#!/usr/bin/env bash
#
# Phase 1 bootstrap for the Qvitta Raspberry Pi Actions runner.
# Companion to docs/pi-setup.md — collapses sections 3 to 7 into one command.
#
# Run it on the Pi AFTER flashing Ubuntu Server 24.04 arm64 and SSHing in:
#
#   curl -fsSL https://raw.githubusercontent.com/Fakhravar1/claim-my-train/main/scripts/pi-bootstrap.sh -o pi-bootstrap.sh
#   less pi-bootstrap.sh          # read it before running it
#   bash pi-bootstrap.sh
#
# Optional:
#   WITH_CLAUDE=1 bash pi-bootstrap.sh    # also install Node + Claude Code CLI
#
# Idempotent — safe to re-run.
#
# Deliberately does NOT do anything needing a secret or an interactive choice.
# Runner registration, ~/.dbt/profiles.yml and AdGuard are printed as next steps.

set -euo pipefail

WITH_CLAUDE="${WITH_CLAUDE:-0}"
QV_ROOT=/opt/qvitta
REPO_URL=https://github.com/Fakhravar1/claim-my-train.git

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- preflight

step "Preflight"
[ "$(id -u)" -ne 0 ] || { echo "Run as your normal user, not root (it uses sudo)."; exit 1; }
sudo -v

ARCH="$(uname -m)"
info "arch: $ARCH"
[ "$ARCH" = "aarch64" ] || warn "Expected aarch64. Continuing, but this was written for a 64-bit Pi."

if [ -r /etc/os-release ]; then . /etc/os-release; info "os:   ${PRETTY_NAME:-unknown}"; fi
info "ram:  $(free -h | awk '/^Mem:/{print $2}')"

# ------------------------------------------------------------ system update

step "System update"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get -y -qq full-upgrade
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    git curl ca-certificates tmux unattended-upgrades ufw zram-tools \
    python3 python3-venv python3-pip

# --------------------------------------------------------------- hardening

step "Firewall (SSH only; AdGuard ports are opened later, if you install it)"
sudo ufw allow 22/tcp >/dev/null
sudo ufw --force enable >/dev/null
info "$(sudo ufw status | head -1)"

# ------------------------------------------------------- SD-card write churn

step "Reduce SD-card write churn"

sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nStorage=volatile\nRuntimeMaxUse=64M\n' \
    | sudo tee /etc/systemd/journald.conf.d/99-volatile.conf >/dev/null
sudo systemctl restart systemd-journald
info "journald: logs in RAM, capped at 64M (they no longer survive reboot)"

if ! grep -q '^ALGO=' /etc/default/zramswap 2>/dev/null; then
    printf 'ALGO=zstd\nPERCENT=50\n' | sudo tee -a /etc/default/zramswap >/dev/null
fi
sudo systemctl restart zramswap 2>/dev/null || warn "zramswap not restarted; check 'systemctl status zramswap'"
info "zram: compressed RAM swap enabled"

# fstab is the one edit that can make the Pi unbootable, so: back up, only touch
# a line we positively recognise, and verify afterwards.
if ! grep -q 'noatime' /etc/fstab && grep -q 'errors=remount-ro' /etc/fstab; then
    sudo cp /etc/fstab "/etc/fstab.bak.$(date +%Y%m%d%H%M%S)"
    sudo sed -i 's/errors=remount-ro/errors=remount-ro,noatime/' /etc/fstab
    info "fstab: added noatime (backup written alongside /etc/fstab)"
else
    info "fstab: already has noatime, or no recognised root entry — skipped"
fi

# ------------------------------------------------------------------- DNS

step "Pin the Pi's own DNS upstream (independent of AdGuard)"
# Two purposes, see docs/pi-setup.md section 7:
#   1. DNSStubListener=no frees port 53 so AdGuard can bind later.
#   2. Explicit DNS= means the Pi never resolves through its own AdGuard, so a
#      blocklist or an AdGuard restart can't break dbt's or the runner's DNS.
# Harmless if you never install AdGuard: the Pi just uses these upstreams.
sudo mkdir -p /etc/systemd/resolved.conf.d
printf '[Resolve]\nDNS=1.1.1.1 9.9.9.9\nDomains=~.\nDNSStubListener=no\n' \
    | sudo tee /etc/systemd/resolved.conf.d/99-bypass-adguard.conf >/dev/null
sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
sudo systemctl restart systemd-resolved
sleep 2
if getent hosts github.com >/dev/null; then
    info "DNS OK — github.com resolves"
else
    warn "github.com did not resolve. Check 'resolvectl status' before continuing."
fi

# -------------------------------------------------------------- python/dbt

step "Python + dbt"
PY=python3
PYV="$($PY -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
info "using system python $PYV"
# NOTE: .github/workflows/dbt-run.yml pins 3.11, but Ubuntu 24.04 ships 3.12 and
# does NOT package 3.11. dbt runs fine on 3.12 — the pin only matters once the
# workflow itself runs here (Phase 2), and the clean fix there is to bump the
# workflow to 3.12 so both runners match. See docs/pi-setup.md section 5.

sudo mkdir -p "$QV_ROOT"
sudo chown "$USER":"$USER" "$QV_ROOT"

if [ ! -x "$QV_ROOT/dbtvenv/bin/dbt" ]; then
    $PY -m venv "$QV_ROOT/dbtvenv"
    "$QV_ROOT/dbtvenv/bin/pip" install -q --upgrade pip
    # Pins mirror .github/requirements/dbt.txt. The dbt-core<2.0 cap is load
    # bearing: dbt-postgres==1.10.0 has no upper bound and pip will otherwise
    # pull the Fusion alpha, which has no Postgres adapter.
    "$QV_ROOT/dbtvenv/bin/pip" install -q 'dbt-core<2.0' 'dbt-postgres==1.10.0'
fi
info "$("$QV_ROOT/dbtvenv/bin/dbt" --version 2>&1 | head -2 | tr '\n' ' ')"

if [ ! -d "$QV_ROOT/repo/.git" ]; then
    git clone -q "$REPO_URL" "$QV_ROOT/repo"
    info "cloned repo to $QV_ROOT/repo"
else
    info "repo already present at $QV_ROOT/repo"
fi

# ------------------------------------------------------------ claude (opt-in)

if [ "$WITH_CLAUDE" = "1" ]; then
    step "Claude Code CLI (optional)"
    if ! command -v node >/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
        sudo apt-get install -y -qq nodejs
    fi
    sudo npm install -g @anthropic-ai/claude-code >/dev/null
    info "node $(node -v), claude installed"
    info "next: cd $QV_ROOT/repo && claude   (then /login, accept workspace trust)"
fi

# ------------------------------------------------------------- next steps

cat <<EOF

$(printf '\033[1;32m')Bootstrap complete.$(printf '\033[0m')

Done: system updated, ufw on, journald/zram/noatime set, DNS pinned upstream,
dbt venv at $QV_ROOT/dbtvenv, repo at $QV_ROOT/repo.

Remaining steps need a secret or a decision, so they are deliberately manual:

1. dbt profile — the Phase 1 exit criterion.
   Create ~/.dbt/profiles.yml with the SESSION POOLER creds (port 5432, NOT the
   transaction pooler on 6543). Template: docs/pi-setup.md section 5. Then:

     chmod 600 ~/.dbt/profiles.yml
     cd $QV_ROOT/repo/dbt
     $QV_ROOT/dbtvenv/bin/dbt deps
     $QV_ROOT/dbtvenv/bin/dbt build

   NEVER pass --full-refresh on this project (CLAUDE.md sections 10 and 15).

2. GitHub Actions runner.
   Settings -> Actions -> Runners -> New self-hosted runner -> ARM64.
   The registration token is valid one hour, so get it when you are ready.
   Register with:  --name qvitta-pi --labels qvitta-pi
   Then: sudo ./svc.sh install "$USER" && sudo ./svc.sh start

3. AdGuard Home (optional) — docs/pi-setup.md section 7.
   Port 53 is already free. Remember it makes the Pi network-critical, which
   collides with the Phase 2 failover test (deliberately powering the Pi off).

Reboot now to confirm everything comes back cleanly:  sudo reboot
EOF
