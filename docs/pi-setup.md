# Raspberry Pi setup — Phase 1

Companion to `docs/pi-runner-plan.md`. Goal of Phase 1: a Pi on the LAN running a
registered-but-idle GitHub Actions runner, proven able to run `dbt build`.
AdGuard Home is included because it costs almost nothing and is genuinely useful.

**Exit criterion: a clean `dbt build` executed by hand on the Pi.** No workflow
changes until that passes.

> ## ✅ COMPLETED 2026-07-29
>
> Phase 1 is done. The Pi is `qvitta-pi` at **192.168.1.199**, Ubuntu 24.04.4
> arm64, runner **2.336.0** registered as `qvitta-pi` (labels `qvitta-pi`,
> `self-hosted`, `Linux`, `ARM64`) and Idle, installed as a systemd service and
> verified to survive a reboot.
>
> **`dbt build`: PASS=59, WARN=0, ERROR=0, SKIP=0 in 2m02s.** That run also
> unfroze the board — `int_stop_events` went from ~5 h stale to 11 min, and
> `v_journeys` / `v_claimable_journeys` returned to the current date.
>
> Two measured results contradict what the plan assumed, both favourably:
>
> | | Planned | Measured |
> |---|---|---|
> | `dbt build` duration | "noticeably longer than GitHub's runners" | **122 s on the Pi vs 157–181 s billed on `ubuntu-latest`** — the Pi is *faster* |
> | RAM | "4 GB is plenty"; board is actually **1 GB** | peak **413 MB used / 485 MB free**, zram untouched |
>
> The 1 GB variant is fine at dbt-only scope. It would not be if the browser
> workflows (Phase 4) ever moved here — revisit then, not now.
>
> Sections 1–6 below are left as written, with corrections marked inline.
> Outstanding: the **DHCP reservation** (§2, router-side, still not done) and the
> optional AdGuard (§7) / Claude Code (§9) sections, neither of which blocks
> Phase 2.

---

## 0. Hardware — what you need, and what not to buy

You have everything required: Pi 4, 32 GB microSD, ethernet cable.

**Do not buy a USB stick.** The plan says USB **SSD**, which is a different
device. A USB flash drive / thumb drive is typically *worse* than a decent
microSD for this job — cheap flash drives use low-grade controllers with poor
random-write behaviour and no wear levelling worth the name. If you ever buy
storage for this, it should be an actual SSD (a SATA 2.5" in a USB 3.0 enclosure,
or a Samsung T7 / similar).

**Start on the microSD anyway.** 32 GB is ample (Ubuntu ~3 GB, dbt venv ~0.5 GB,
runner + work dir ~1 GB, AdGuard ~50 MB). Do not let storage shopping block
Phase 1. Section 4 covers reducing write churn so the card lasts.

Move to an SSD when one of these becomes true:
- the card starts throwing I/O errors or the filesystem goes read-only (the
  classic symptom — the Pi appears alive but everything fails to write), or
- you add Home Assistant (see §8), whose recorder database is a genuine SD-card
  killer, unlike anything else here.

Also worth having: a **real 3 A USB-C PSU** and a **heatsink or fan case**.
Undervoltage on a Pi 4 produces intermittent failures that look convincingly like
software bugs, and a throttled Pi just runs dbt slowly.

Check which RAM variant you have once booted: `free -h`.

---

## 1. Flash Ubuntu Server 24.04 LTS (64-bit)

Use **Raspberry Pi Imager** on your desktop.

- Device: Raspberry Pi 4
- OS: *Other general-purpose OS* → *Ubuntu* → **Ubuntu Server 24.04 LTS (64-bit)**
- Storage: your microSD

Before writing, open the **gear / Edit Settings** panel and set:
- hostname: `qvitta-pi`
- username + password (or better, **enable SSH with a public key**)
- **Enable SSH**
- leave Wi-Fi blank — you are on ethernet

Setting these in Imager means you never need a monitor or keyboard.

Why Ubuntu and not Raspberry Pi OS: it matches `ubuntu-latest` on GitHub, so the
same workflow YAML runs on both runners without divergent steps. At dbt-only
scope this is a low-stakes preference, but it costs nothing and keeps the door
open if browser workflows are ever moved.

## 2. First boot

Plug in ethernet, insert the card, power on. Give it ~2 minutes (first boot
expands the filesystem and reboots).

Find it and connect:

```bash
ssh <your-user>@qvitta-pi.local
# if mDNS doesn't resolve, find the lease on your router's DHCP client list
```

Then:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

**Set a DHCP reservation on your router** for the Pi's MAC address, so its IP
never moves. Do this at the router rather than with netplan — it is easier to
reason about, and AdGuard clients will point at this address. Note the IP down;
call it `<PI_IP>` below.

## 2b. Shortcut: run the bootstrap script

Sections 3 to 7 below are collapsed into `scripts/pi-bootstrap.sh`. It is
idempotent and deliberately stops short of anything needing a secret or a
decision (runner registration, `profiles.yml`, the AdGuard install itself).

The repo is **private**, so the raw GitHub URL will not work unauthenticated and
the script's own `git clone` cannot succeed either. Seed the repo from a machine
that already has it checked out, then run the script from there:

```bash
# On the Pi: make the target directory writable by you
sudo mkdir -p /opt/qvitta && sudo chown "$USER":"$USER" /opt/qvitta
mkdir -p /opt/qvitta/repo && git init -q /opt/qvitta/repo

# From your laptop — core.autocrlf=false is LOAD BEARING on Windows (see below)
git -c core.autocrlf=false archive --format=tar HEAD \
  | ssh <user>@<PI_IP> 'tar -x -C /opt/qvitta/repo'

# Back on the Pi
bash /opt/qvitta/repo/scripts/pi-bootstrap.sh
# optional: WITH_CLAUDE=1 bash /opt/qvitta/repo/scripts/pi-bootstrap.sh
```

`git init` first means the script sees an existing `.git` and skips its clone
entirely, rather than attempting one and warning.

⚠️ **Line endings (hit for real 2026-07-29).** This repo was checked out on
Windows with `core.autocrlf=true` and had **no `.gitattributes`**, so a plain
`git archive` produced CRLF files. Bash will not run a CRLF script — it fails
with `$'\r': command not found` and `set: pipefail: invalid option name`, and
because that happens on the `set -euo pipefail` line the script does nothing at
all while looking like it merely printed two odd warnings. A `.gitattributes`
pinning `*.sh eol=lf` was added on 2026-07-29; `-c core.autocrlf=false` above is
belt-and-braces for older checkouts. Check with `file` if in doubt:

```bash
file /opt/qvitta/repo/scripts/pi-bootstrap.sh   # must NOT say "CRLF line terminators"
```

⚠️ **Running it over a non-interactive SSH session.** The script originally
called `sudo -v` in its preflight, which demands a tty even where `sudo -n true`
succeeds — so driving it with `ssh host 'bash pi-bootstrap.sh'` aborted at the
first step. Fixed 2026-07-29 (`sudo -n true || sudo -v`). Running it from an
interactive shell after SSHing in, as this guide describes, was never affected.

Read the sections below anyway for the reasoning; the script only automates the
mechanical parts.

## 3. Baseline hardening

```bash
# automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# firewall: SSH now, DNS added in §7. The runner needs NO inbound ports —
# it long-polls outbound to GitHub, which is why none of this needs port
# forwarding and why CGNAT / a dynamic IP are irrelevant.
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw enable
```

If you set up an SSH key in Imager, disable password login:
`sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl restart ssh`

## 4. Reduce SD-card write churn

The point is to keep constant small writes off the card. Cheap, do it now.

```bash
# 1. Cap systemd's journal instead of letting it grow
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nStorage=volatile\nRuntimeMaxUse=64M\n' \
  | sudo tee /etc/systemd/journald.conf.d/99-volatile.conf
sudo systemctl restart systemd-journald

# 2. zram — compressed RAM swap instead of swapping to the card
sudo apt install -y zram-tools
printf 'ALGO=zstd\nPERCENT=50\n' | sudo tee -a /etc/default/zramswap
sudo systemctl restart zramswap

# 3. Relax filesystem write-back timestamps
sudo sed -i 's/\(errors=remount-ro\)/\1,noatime,commit=120/' /etc/fstab
```

⚠️ **Correction (2026-07-29): step 3 as written above does nothing on this
image.** The Ubuntu Server Pi root entry is `LABEL=writable / ext4 defaults 0 1`
— there is no `errors=remount-ro` to match, so the `sed` is a no-op and the
bootstrap's equivalent guard reported "no recognised root entry — skipped". The
whole point of this section was silently lost. Match on the mount point instead:

```bash
sudo cp /etc/fstab /etc/fstab.bak
sudo awk '!/^#/ && $2=="/" && $4 !~ /noatime/ { sub($4, $4",noatime") } { print }' \
    /etc/fstab | sudo tee /etc/fstab.new >/dev/null
sudo mv /etc/fstab.new /etc/fstab
sudo findmnt --verify && sudo systemctl daemon-reload   # verify BEFORE rebooting
```

Confirm after reboot with `findmnt -no OPTIONS /` — it should include `noatime`.
`scripts/pi-bootstrap.sh` now does this, including restoring the backup if
`findmnt` rejects the result.

`Storage=volatile` means logs live in RAM and vanish on reboot. That is usually
the right trade for an appliance, but if you are actively debugging a crash, flip
it back to `Storage=persistent` temporarily.

## 5. Python + dbt, and the Phase 1 verification

⚠️ **Correction (2026-07-29):** an earlier version of this section said
`apt install python3.11`. That does not work — **Ubuntu 24.04 ships Python 3.12
and does not package 3.11**, so the command fails. Use the system Python:

```bash
sudo apt install -y python3 python3-venv python3-pip git

sudo mkdir -p /opt/qvitta && sudo chown "$USER":"$USER" /opt/qvitta
python3 -m venv /opt/qvitta/dbtvenv
/opt/qvitta/dbtvenv/bin/pip install --upgrade pip
/opt/qvitta/dbtvenv/bin/pip install 'dbt-core<2.0' 'dbt-postgres==1.10.0'
/opt/qvitta/dbtvenv/bin/dbt --version
```

dbt runs fine on 3.12, so this has no effect on the Phase 1 verification.

**It does change Phase 2.** `dbt-run.yml` pins `python-version: '3.11'`, which the
Pi cannot satisfy from apt. Rather than pulling 3.11 from the deadsnakes PPA and
hand-seeding the runner tool cache, the clean fix is to **bump the workflow to
3.12** — GitHub's `ubuntu-latest` provides it too, so both runners match and the
tool-cache problem disappears entirely. That removes the one genuine unknown
flagged in §6 and in `pi-runner-plan.md`.

Those pins come from `.github/requirements/dbt.txt` — the `dbt-core<2.0` cap
exists because `dbt-postgres==1.10.0` has no upper bound and pip will otherwise
pull the Fusion alpha, which has no Postgres adapter.

Now clone and configure a profile for the manual verification:

```bash
git clone https://github.com/Fakhravar1/claim-my-train.git /opt/qvitta/repo
mkdir -p ~/.dbt
```

Create `~/.dbt/profiles.yml` with the **session pooler** credentials (port 5432,
*not* the transaction pooler on 6543 — that breaks dbt's multi-statement
transactions). Same values as the `SUPABASE_DB_*` repo secrets:

```yaml
trafiklab:
  outputs:
    dev:
      type: postgres
      host: <SUPABASE_DB_HOST>
      port: 5432
      user: <SUPABASE_DB_USER>
      password: <SUPABASE_DB_PASSWORD>
      dbname: <SUPABASE_DB_NAME>
      schema: dbt_dev
      threads: 2
      sslmode: require
  target: dev
```

```bash
chmod 600 ~/.dbt/profiles.yml
cd /opt/qvitta/repo/dbt
/opt/qvitta/dbtvenv/bin/dbt debug     # validates the connection in ~2 s — do this first
/opt/qvitta/dbtvenv/bin/dbt deps
/opt/qvitta/dbtvenv/bin/dbt build
```

**A clean `dbt build` here is the Phase 1 exit criterion.**

✅ **Passed 2026-07-29: `PASS=59 WARN=0 ERROR=0 SKIP=0` in 122 s.** Peak memory
during the build was 413 MB used / 485 MB free on a **1 GB** Pi 4, with zram
never touched — comfortable, though see the plan's §4 note about the browser
workflows, which would change that.

⚠️ **The host is `aws-1-…`, not `aws-0-…`.** The actual value is
`aws-1-eu-west-1.pooler.supabase.com`. `aws-0-` appears in this repo's docs (the
worked DNS example in §7) and is wrong — it will not resolve. If you do not have
the password, it is the same value as the `SUPABASE_DB_PASSWORD` repo secret and
is already in `~/.dbt/profiles.yml` on the laptop that runs dbt locally, under
dbt's `pass:` alias. GitHub secrets are write-only, and resetting the Supabase
database password would invalidate that secret and every other consumer of it —
so read it from the local profile rather than rotating.

Note also that dbt on the Pi resolves to **dbt-core 1.12.0** with
dbt-postgres 1.10.0, because the pin is `dbt-core<2.0` rather than an exact
version. CI installs from `.github/requirements/dbt.txt` and lands on ~1.10.x.
That drift only affects manual runs — in Phase 2 the workflow installs its own
pinned dbt on the runner, so the venv here is not what executes.

Note this puts the DB password on the Pi's disk. The workflow writes its own
`profiles.yml` at job time from GitHub secrets, so this file is only for manual
runs — delete it if you would rather not keep it. Meanwhile it is genuinely
useful: it is the bridge for the current outage (run `dbt build` by hand until
the runner is live or the quota resets).

⚠️ **Never run `dbt build --full-refresh`** on this project. Several models are
accumulating tables whose history exceeds what raw retention can rebuild —
`fct_claimable_stop_events` (91 d claim window vs ~5 d of int), the SEO aggs, and
`int_stop_events` itself. A full refresh silently and permanently destroys that
history. See CLAUDE.md §10 and §15.

## 6. Register the GitHub Actions runner

On GitHub: **repo → Settings → Actions → Runners → New self-hosted runner**,
architecture **ARM64**. That page shows a registration token valid for one hour —
use the commands it gives you, which are the ones below with the token filled in.

```bash
sudo mkdir -p /opt/actions-runner && sudo chown "$USER":"$USER" /opt/actions-runner
cd /opt/actions-runner
curl -o actions-runner-linux-arm64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v<VERSION>/actions-runner-linux-arm64-<VERSION>.tar.gz
tar xzf actions-runner-linux-arm64.tar.gz
sudo ./bin/installdependencies.sh     # pulls libicu etc. for the bundled .NET runtime

./config.sh --url https://github.com/Fakhravar1/claim-my-train \
            --token <REGISTRATION_TOKEN> \
            --name qvitta-pi \
            --labels qvitta-pi \
            --work _work
```

The `--labels qvitta-pi` is load-bearing: the plan's router dispatches
`runs-on: qvitta-pi`, and the label is how the job finds this machine.

Install as a service so it survives reboots:

```bash
sudo ./svc.sh install "$USER"
sudo ./svc.sh start
sudo ./svc.sh status
```

The runner should now show **Idle** in the GitHub Runners page. Leave it idle —
no workflow targets it until Phase 2.

✅ **Done 2026-07-29.** Runner **2.336.0**, registered unattended with:

```bash
./config.sh --url https://github.com/Fakhravar1/claim-my-train \
            --token <REGISTRATION_TOKEN> \
            --name qvitta-pi --labels qvitta-pi \
            --work _work --unattended --replace
```

Resulting labels: `qvitta-pi`, `self-hosted`, `Linux`, `ARM64`. Service installed
via `sudo ./svc.sh install arian && sudo ./svc.sh start`, confirmed `enabled` +
`active` after a deliberate reboot, and the listener log shows `Session created`
/ `Listening for Jobs`. Idle RAM with the runner up: ~322 MB of 899 MB.

⚠️ **`svc.sh` is not in the tarball.** For runner 2.336.0 it is *generated* by
`config.sh` from `bin/systemd.svc.sh.template`, so it does not exist until after
registration. The download block above implies otherwise; do not go looking for
it before configuring.

### ✅ `actions/setup-python` on arm64 — RESOLVED 2026-07-29, no workaround needed

This was the one genuine unknown carried out of Phase 1. It is settled: a
smoke-test job (`.github/workflows/pi-smoke-test.yml`, dispatched with
`runner=qvitta-pi`) ran green end to end on this Pi.

```
arch:        aarch64          runner:      qvitta-pi
kernel:      6.8.0-1060-raspi environment: self-hosted
tool cache:  /opt/actions-runner/_work/_tool
actions/setup-python@v5 → "Create Python 3.12.13 folder"   ← downloaded arm64, no pre-seed
dbt-core 1.12.0 + dbt-postgres 1.10.0 installed from .github/requirements/dbt.txt
```

`actions/python-versions` **does** publish linux-arm64 for 3.12 — setup-python
fetched and installed 3.12.13 unaided. **No tool-cache pre-seeding, and no
`runner.environment` branching in the YAML.**

⚠️ Two corrections to what this section used to say:

- **`RUNNER_TOOL_CACHE` is `/opt/actions-runner/_work/_tool`, not
  `/opt/hostedtoolcache`.** Self-hosted runners default the tool cache under the
  work directory. The earlier `mkdir /opt/hostedtoolcache` instruction was
  pointless — that path is never consulted. Skip it.
- Any pre-seed fallback, if ever needed for another version, belongs at
  `$RUNNER_TOOL_CACHE/Python/<ver>/arm64/` with a `.complete` marker.

**Self-hosted jobs are not billed.** The same run reported
`{"billable":{}}` — an empty billable object against 199 s of wall clock — from
`GET /repos/:owner/:repo/actions/runs/:id/timing`. Confirms the core premise of
`pi-runner-plan.md`: moving `dbt-run` here takes its ~2 160 min/month to zero.

Still required in Phase 2: bump `dbt-run.yml` from `python-version: '3.11'` to
`'3.12'`. Ubuntu 24.04 does not package 3.11, and `ubuntu-latest` provides 3.12,
so 3.12 is what lets one YAML serve both runners.

## 7. AdGuard Home

```bash
# Ubuntu's systemd-resolved holds port 53 — AdGuard cannot bind until it lets go.
# This is the classic install failure; do it FIRST.
sudo sed -i 's/^#\?DNSStubListener=.*/DNSStubListener=no/' /etc/systemd/resolved.conf
sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
sudo systemctl restart systemd-resolved

curl -sSL https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v

sudo ufw allow 53
sudo ufw allow 3000/tcp
sudo ufw allow 80/tcp
```

Set it up at `http://<PI_IP>:3000`, then point your **router's DHCP DNS server**
at `<PI_IP>` so every device uses it.

### Decouple the Pi's own DNS from AdGuard — do not skip this

Once the router hands out `<PI_IP>` as the DNS server, the Pi would normally
resolve through **its own AdGuard instance**. That creates a real, non-obvious
dependency: anything that breaks AdGuard also breaks the Pi's ability to resolve
`*.pooler.supabase.com` and `github.com`, so **dbt and the runner fail with DNS
errors caused by an unrelated service on the same box**.

Concrete example: you add a stricter blocklist, it contains a wildcard that
catches an AWS domain, and the next hourly build dies with
`could not translate host name "aws-0-eu-west-1.pooler.supabase.com"`. Browsing
looks fine, so you spend the evening in Supabase and the runner logs. Same class
of failure from an AdGuard restart during upgrade, a bad upstream, or AdGuard
simply not coming back after a reboot.

Pin the Pi's own resolver to an upstream instead. Other devices still filter
through AdGuard; only the Pi bypasses it.

```bash
sudo mkdir -p /etc/systemd/resolved.conf.d
printf '[Resolve]\nDNS=1.1.1.1 9.9.9.9\nDomains=~.\nDNSStubListener=no\n' \
  | sudo tee /etc/systemd/resolved.conf.d/99-bypass-adguard.conf
sudo systemctl restart systemd-resolved

# verify: should answer from 1.1.1.1, not from AdGuard
resolvectl status | grep -A2 'Current DNS'
getent hosts github.com
```

⚠️ **Correction (2026-07-29): the snippet above is NOT sufficient on its own.**
After running it, the global scope does show `DNS Servers: 1.1.1.1 9.9.9.9` with
`DNS Domain: ~.` — but `eth0` *still* carries the DHCP-supplied router DNS with
`+DefaultRoute`:

```
Link 2 (eth0)
       DNS Servers: 192.168.1.1 2001:…::1
        DNS Domain: lan
```

A link with `+DefaultRoute` matches every query, so which scope answers is not
guaranteed. Today that is harmless — the router forwards upstream and AdGuard is
not installed. **The moment the router hands out the Pi's own address as DNS,
`eth0`'s resolver becomes AdGuard on this same box, which is precisely the
circular dependency this section exists to prevent.** Suppress the DHCP-supplied
servers so only the pinned upstreams remain:

```bash
# netplan: stop eth0 accepting DNS from DHCP
sudo tee /etc/netplan/99-no-dhcp-dns.yaml >/dev/null <<'YAML'
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: true
      dhcp4-overrides:
        use-dns: false
YAML
sudo chmod 600 /etc/netplan/99-no-dhcp-dns.yaml
sudo netplan apply

# verify eth0 now lists no DNS servers of its own
resolvectl status eth0 | grep -E 'DNS Servers|Default Route'
```

Do this **before** pointing the router at the Pi, not after — debugging it from
the other side means the box you need to SSH into is the one with broken DNS.
`scripts/pi-bootstrap.sh` does not do this, because it is only needed if you
actually install AdGuard.

Trade-off, stated honestly: the Pi's own traffic is then unfiltered. That is the
point — you do not want ad-blocking policy sitting in the path between your data
pipeline and its database.

### Read this before pointing your router at it

AdGuard turns the Pi into **network-critical infrastructure**. That is a real
change in stakes: if dbt is late, a train board is stale and a watchdog emails
you. If DNS is down, nobody in the house can load anything, and they will notice
immediately.

Consequences worth planning for:

- **Set a secondary DNS on the router** (e.g. `1.1.1.1` or your ISP's) so a Pi
  reboot degrades to "ads not blocked" rather than "internet broken". Note that
  clients may then bypass filtering unpredictably — that is the trade.
- **The Phase 2 failover test involves deliberately powering the Pi off** to
  prove the router flips dbt to `ubuntu-latest`. Do that when nobody is
  mid-stream, or you will be debugging two things at once.
- **Turn the query log down.** AdGuard logs every DNS query by default, which is
  the single biggest writer on the card once installed. Settings → General →
  Query log: shorten retention (24 h is plenty) or disable it.

## 8. Headspace — what fits

Rough steady-state RAM on a Pi 4:

| Component | RAM | Notes |
|---|---|---|
| Ubuntu Server (headless) | ~250 MB | |
| Actions runner (idle) | ~120 MB | long-polling .NET process |
| `dbt build` (while running) | ~300–600 MB | ~3–5 min, hourly, then released |
| AdGuard Home | ~50–100 MB | negligible CPU |
| Mosquitto / Node-RED / Zigbee2MQTT | ~50–150 MB each | genuinely lightweight |
| **Home Assistant (container)** | **~1–1.5 GB** | **steady, not a spike** |

**On 4 GB:** everything except Home Assistant fits comfortably — roughly 700 MB
in use, leaving headroom several times over for the hourly dbt spike. Add HA and
you are at ~2.2 GB steady, which still fits but stops being relaxed.

**On 8 GB:** all of the above is a non-issue.

### The home-automation fork in the road

"Minor home automation" splits into two very different things:

- **Genuinely minor — do it freely.** Mosquitto (MQTT broker), Node-RED,
  Zigbee2MQTT, Uptime Kuma, a Syncthing node, a handful of cron scripts. Tens of
  MB each, no meaningful contention with dbt.

- **Home Assistant — think first.** Two problems, neither about RAM:
  1. **Home Assistant OS is an appliance image that takes over the whole
     device.** You cannot run a GitHub Actions runner on it. If you want both,
     HA must be the *container* install on this Ubuntu, which is a more
     hands-on setup and upgrade path.
  2. **HA's recorder database writes constantly**, and it is the classic
     SD-card killer. Running HA on the microSD is where the SSD purchase stops
     being optional.

If HA is on the roadmap, the clean split is: **Pi = dbt + AdGuard + light
services; a second box for Home Assistant.** Mixing an appliance-style smart-home
hub with your data pipeline's runner means one reboot takes down both.

## 9. Optional: reaching Claude on the Pi from your phone

### Dispatch will NOT work here — Remote Control will

**Dispatch** pairs the Claude mobile app with the **Claude Desktop app**, and runs
tasks in that desktop environment (local files, desktop apps, connectors). It
needs a GUI machine that is awake with Desktop open. This Pi is headless Ubuntu
Server on arm64 — there is no desktop for Dispatch to drive, so it is the wrong
tool regardless of architecture support.

**Remote Control** is the CLI equivalent and is exactly right for a headless box:
you run a Claude Code session on the Pi and steer it from `claude.ai/code` or the
Claude mobile app. Anthropic's own comparison table lists Dispatch as running on
"your machine (Desktop)" and Remote Control as "your machine (CLI or VS Code)".

Two properties make it a good fit here:

- **Outbound HTTPS only — it never opens inbound ports.** Same reason the Actions
  runner needs no port forwarding, and it works behind CGNAT and a dynamic IP.
- The docs explicitly cover the remote-machine case: *"To keep a session running
  on a remote machine after you disconnect from SSH, start it inside `tmux` or
  `screen`."*

### Install

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g @anthropic-ai/claude-code

sudo apt install -y tmux
cd /opt/qvitta/repo
claude                       # run once: /login, and accept the workspace-trust prompt
```

Then start a session that survives your SSH disconnecting:

```bash
tmux new -s claude
claude remote-control --name qvitta-pi
# press spacebar for a QR code, or open the printed URL
# detach with Ctrl-b then d
```

Connect from the Claude mobile app (**Code** tab) or `claude.ai/code` — the
session shows a computer icon with a green dot while online.

### Requirements and gotchas worth knowing in advance

- **Pro, Max, Team or Enterprise.** API keys are not supported.
- **Must be a full `/login` session token.** A `claude setup-token` /
  `CLAUDE_CODE_OAUTH_TOKEN` credential only makes model requests and is rejected
  for Remote Control. Unset `ANTHROPIC_API_KEY` if it is in the environment.
- **`DISABLE_TELEMETRY`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  and `DISABLE_GROWTHBOOK` each break it** — they disable the feature-flag
  evaluation Remote Control depends on.
- **Run `claude` in the project directory once first.** The trust dialog never
  saves trust for your home directory.
- **A network outage longer than ~10 min ends the session** and the process
  exits; start it again. Worth knowing on a home connection.
- The §7 DNS bypass protects this too — if the Pi resolved through its own
  AdGuard, a blocklist could break `api.anthropic.com` the same way it breaks the
  Supabase pooler.

### Tailscale — still useful, but not for this

Remote Control is outbound-only, so you do **not** need Tailscale to reach Claude
on the Pi. It is still worth installing for plain SSH access from outside the
house without forwarding ports:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

### Worth deciding deliberately

By the end of this guide the Pi holds your **Supabase session-pooler password**
(`~/.dbt/profiles.yml`, §5) and is your **network's DNS server**. A Remote Control
session means that shell is drivable from your phone, and while Remote Control is
connected the transcript is stored on Anthropic servers (execution and filesystem
access stay local). None of that is an argument against doing it on your own
private box — just do it knowingly. Two cheap mitigations: delete
`~/.dbt/profiles.yml` once the runner is live (workflows write their own from
GitHub secrets at job time), and keep Tailscale ACLs to your own devices.

## 10. Where this leaves you

**Superseded 2026-07-29 — Phases 2 and 3 also landed the same day.** This section
described the state at the end of Phase 1; it is kept for the sequence.

Current reality: `dbt-run` is dispatched **every 15 minutes** by pg_cron jobid 18
→ the `dispatch-workflow` edge function → the Pi, falling back to
`ubuntu-latest` when the Pi is offline. Self-hosted runs are unbilled, so the
recurring cost of `dbt build` is now zero. See `docs/pi-runner-plan.md` §5 and
CLAUDE.md §3.

Operational notes that matter day to day:

- **Change cadence with `cron.alter_job` on jobid 18** — not the repo, and no
  longer the cron-jobs.org dashboard (retired for dbt).
- **A manual dispatch is the one path the router cannot protect.** If you fire
  `dbt-run` by hand while the Pi is down, pick `ubuntu-latest` from the dropdown,
  or the job queues silently for up to 24 h.
- **`~/.dbt/profiles.yml` on the Pi is no longer load-bearing.** The workflow
  writes its own profile at job time from GitHub secrets. Keep the file if you
  want to run `dbt build` by hand; delete it if you would rather the pooler
  password not sit on the box (§9's "worth deciding deliberately").
- Re-run the failover test whenever these workflows change materially
  (`pi-runner-plan.md` §6). Stopping the runner service over SSH is enough —
  `sudo ./svc.sh stop`, confirm the router picks `ubuntu-latest`, `svc.sh start`.
