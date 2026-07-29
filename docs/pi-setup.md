# Raspberry Pi setup — Phase 1

Companion to `docs/pi-runner-plan.md`. Goal of Phase 1: a Pi on the LAN running a
registered-but-idle GitHub Actions runner, proven able to run `dbt build`.
AdGuard Home is included because it costs almost nothing and is genuinely useful.

**Exit criterion: a clean `dbt build` executed by hand on the Pi.** No workflow
changes until that passes.

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

`Storage=volatile` means logs live in RAM and vanish on reboot. That is usually
the right trade for an appliance, but if you are actively debugging a crash, flip
it back to `Storage=persistent` temporarily.

## 5. Python + dbt, and the Phase 1 verification

`dbt-run.yml` pins Python 3.11; Ubuntu 24.04 ships 3.12. Both are fine for dbt —
install 3.11 so the Pi matches the workflow.

```bash
sudo apt install -y python3.11 python3.11-venv python3-pip git

sudo mkdir -p /opt/qvitta && sudo chown "$USER":"$USER" /opt/qvitta
python3.11 -m venv /opt/qvitta/dbtvenv
/opt/qvitta/dbtvenv/bin/pip install --upgrade pip
/opt/qvitta/dbtvenv/bin/pip install 'dbt-core<2.0' 'dbt-postgres==1.10.0'
/opt/qvitta/dbtvenv/bin/dbt --version
```

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
/opt/qvitta/dbtvenv/bin/dbt deps
/opt/qvitta/dbtvenv/bin/dbt build
```

**A clean `dbt build` here is the Phase 1 exit criterion.**

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

Make dbt available to jobs (the workflow uses `actions/setup-python`, but having
a system Python 3.11 present is what lets the tool-cache fallback work):

```bash
ls /opt/hostedtoolcache 2>/dev/null || sudo mkdir -p /opt/hostedtoolcache
sudo chown -R "$USER":"$USER" /opt/hostedtoolcache
```

If `actions/setup-python` later fails to resolve arm64, pre-seed
`/opt/hostedtoolcache/Python/3.11.<x>/arm64/` with a `.complete` marker file so
it resolves locally — that keeps the workflow YAML identical on both runners.
This is the one genuine unknown in Phase 1.

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

## 9. Where this leaves you

Done here: a hardened Pi with an idle `qvitta-pi` runner, a verified `dbt build`,
and AdGuard serving the LAN.

Not done, and deliberately so: no workflow targets the Pi yet. Phase 2 (the
`runner` input on `dbt-run.yml` plus the `dispatch-workflow` edge function that
picks Pi-vs-hosted before dispatch) is what actually moves the work — see
`docs/pi-runner-plan.md` §3.

In the meantime, §5's manual `dbt build` is your bridge for the ongoing
Actions-minutes outage.
