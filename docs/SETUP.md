# Screen Remote setup

## What you need

- A Raspberry Pi 4 or 5 (2 GB is plenty), its official power supply and a 16 GB+ SD card.
- **Raspberry Pi OS Lite (64-bit)**, Bookworm or newer.
- A Wi-Fi router or access point.
- Two ethernet cables.
- For the install only: internet access for the Pi (Wi-Fi or ethernet at the shop).

## Wiring

```
 Brompton processors ──┐
                       ├── processor network switch ──┬── Raspberry Pi (ethernet)
                       │                              └── Wi-Fi router (LAN port, not WAN)
                                                              )))  phones
```

- Plug the router into the processor switch through one of its **LAN** ports, not the WAN or
  Internet port. Phones then join the same network as the processors and the Pi.
- In the router settings, turn **off its DHCP server** if the processor network already has one.
  Otherwise give it a DHCP range that doesn't overlap any fixed processor addresses.
- Use a WPA2 or WPA3 password that only the LED team knows. The Wi-Fi password is the first lock
  on the system.

### Optional: keep phones off the processor network

The simple setup lets any phone on the Wi-Fi reach the processors directly. For a stricter setup,
give the Pi a second network adapter (for example a USB ethernet dongle). Connect the router only to
that second adapter, and the processor switch only to the built-in port. Phones can then reach Show
Remote but not the processors. This is not needed to get started.

## Processors

Screen Remote uses the Tessera HTTP API (port 80).

- On each processor, enable **IP Control** in the **Live Control** tile.
- Give the processors fixed IP addresses, or DHCP reservations, so they stay put during a show.
- Processors are found automatically on 192.168.0.x, 192.168.1.x and the Pi's own networks. If
  yours sit on a different range, add it in **Settings → Processors → Scan ranges** (for example
  `10.10.0.0/24`), or add single processors by IP.

### The Pi's own addresses

Processor networks often have no DHCP server, so the installer gives the Pi two fixed addresses on
its ethernet port, **192.168.0.250** and **192.168.1.250**. It still takes a DHCP address too
when the network has one. That way it can always reach processors on the two common ranges.

- Don't give a processor or other device `.250` on those ranges.
- To use other addresses, run the installer with, for example,
  `SR_STATIC_IPS="10.10.0.250/24"`. Use `SR_STATIC_IPS=""` to turn this off.

## Install on the Pi

Do this at the shop, where the Pi has internet. It takes about 10 to 15 minutes.

### 1. Prepare the SD card

In **Raspberry Pi Imager**, choose your Pi model and **Raspberry Pi OS Lite (64-bit)**. Before
writing, open the settings (**Edit settings** or the gear icon) and:

- Set the **hostname** to `screenremote`, so the Pi is `screenremote.local` from the first boot.
- Set a **username and password** (for example `tech`).
- Set up **Wi-Fi** for your shop network, so the Pi has internet for the install.
- On the **Services** tab, **enable SSH** with password authentication.

Write the card, put it in the Pi and power it on. Give it a minute or two to boot.

### 2. Get the code onto the Pi

SSH in (use the username you chose; if `screenremote.local` isn't found, use the Pi's IP address
from your router's client list), then clone the repo:

```bash
ssh tech@screenremote.local
sudo apt-get install -y git
git clone https://github.com/KennyStanleyJr/screen-remote.git ~/screen-remote
```

### 3. Run the installer

```bash
cd ~/screen-remote
sudo bash scripts/install-pi.sh
```

The installer:

- Installs Node.js and the system packages it needs, then builds the app.
- Makes sure the Pi is named `screenremote` (it renames it if you skipped that in Imager).
- Adds the fixed ethernet addresses (see above).
- Makes the HTTPS certificate.
- Asks you to choose the **setup PIN** (4 to 8 digits). Write it down somewhere safe.
- Turns on a firewall that allows only SSH, HTTP, HTTPS and mDNS.
- Starts the `screen-remote` service, which also starts on every boot.
- Checks the app is answering, then prints **Done**.

### 4. Reboot and check

```bash
sudo reboot
```

This applies the fixed ethernet addresses. After the reboot, SSH back in with
`ssh tech@screenremote.local` and check:

```bash
systemctl status screen-remote   # should say "active (running)"
ip -4 addr show eth0           # should list 192.168.0.250 and 192.168.1.250
```

Plug the Pi into a processor (or a switch with one on it) and open the app. The processor should
appear within a minute or two.

### 5. Starting on power-up

There is nothing to start by hand. The installer sets everything to start on its own whenever the
Pi gets power: the network setup, the `screenremote.local` name, the firewall and Screen Remote itself.
If Screen Remote ever stops or crashes, it restarts within a few seconds, as many times as needed.
It always comes up in Show Mode.

To check it once:

1. Pull the Pi's power, wait a few seconds and plug it back in. There's no need to shut it down
   first.
2. Wait about a minute.
3. Open `https://screenremote.local` on a phone. The app should load and show your processors.

To confirm from SSH that everything is set to start at boot:

```bash
systemctl is-enabled screen-remote avahi-daemon NetworkManager ufw   # each should say "enabled"
```

To stop it starting at boot (for example to use the Pi for something else), run
`sudo systemctl disable --now screen-remote`. Turn it back on with
`sudo systemctl enable --now screen-remote`.

### Updating later

Push your changes to GitHub from your laptop, then on the Pi (it needs internet for this):

```bash
cd ~/screen-remote && git pull && sudo bash scripts/install-pi.sh
```

Your PIN, certificates, processor names and settings are kept. Reload the app on each phone
afterwards; an installed app picks up the new version the next time it opens.

**No internet at the Pi?** On your laptop run `npm run bundle` and
`scp screen-remote.tgz tech@screenremote.local:~`, then on the Pi run
`tar -xzf ~/screen-remote.tgz -C ~/screen-remote` and the installer as above. The installer
itself still needs internet the first time, to download Node.js and packages.

### Useful commands

| What               | Command                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| Live logs          | `journalctl -u screen-remote -f`                                                |
| Restart            | `sudo systemctl restart screen-remote`                                          |
| Reset a lost PIN   | See below                                                                       |
| More detailed logs | add `Environment=LOG_LEVEL=info` to `/etc/systemd/system/screen-remote.service` |

To reset a lost PIN, stop the service first, or it will write the old PIN back when it stops:

```bash
sudo systemctl stop screen-remote
sudo -u screenremote DATA_DIR=/var/lib/screen-remote node /opt/screen-remote/server/dist/cli/set-pin.js
sudo systemctl start screen-remote
```

## Set up each phone (once)

The phone needs to trust Screen Remote's certificate. Without that, the app shows a security warning
and can't be installed to the home screen.

### iPhone

1. Join the show Wi-Fi and open **http://screenremote.local/certs** in **Safari**.
2. Tap **Download certificate** and allow the profile download.
3. Go to **Settings → General → VPN & Device Management**, tap the Screen Remote profile, and tap
   **Install**.
4. Go to **Settings → General → About → Certificate Trust Settings** and turn on the mkcert
   certificate.
5. Open **https://screenremote.local**, tap **Share → Add to Home Screen**.

### Android

1. Join the show Wi-Fi and open **http://screenremote.local/certs** in **Chrome**.
2. Tap **Download certificate**.
3. Go to **Settings → Security → More security settings → Install a certificate → CA certificate**
   and pick the downloaded file. The exact menu names vary by phone.
4. Open **https://screenremote.local** and choose **Install app** from the Chrome menu.

If `screenremote.local` doesn't resolve (some older Android phones), use the Pi's IP address instead,
for example `https://192.168.0.250` or `https://192.168.1.250`. The certificate covers the fixed
addresses and whatever addresses the Pi had when you ran the installer. Run it again if you add
new ones.

## Using it on a show

- **Show Mode is on at startup.** While it is on, the Pi refuses every command and only monitors.
- To make changes during setup, tap **Setup Mode** and enter the setup PIN. The PIN is asked
  every time. That phone stays unlocked until Show Mode is turned back on (by anyone, or by the
  auto relock), or until you tap **Lock** in Settings.
- Before doors, turn **Show Mode** back on. Any identify or pixel check patterns still running are
  put back first.
- **Settings → Alerts and safety** can turn Show Mode back on automatically after a period with no
  commands.
- For complete peace of mind, unplug the Pi and router once setup is done. The processors don't
  depend on them.

### On-site checklist

1. Plug the Pi and router into the processor switch and power them on. Nothing needs starting by
   hand; give the Pi about a minute to boot.
2. Join the show Wi-Fi and open the app. The header should say **Show Mode**.
3. Check every processor appears. If one is missing, check its IP is on 192.168.0.x or
   192.168.1.x, or add its range under **Settings → Processors**.
4. Check the expected device counts look right, and reset them on the **Devices** tab if the wall
   has changed since last time.
5. Do your setup in **Setup Mode**, then switch back to **Show Mode** before doors.

### If something goes wrong

- **The app doesn't load:** check the phone is on the show Wi-Fi. Try `https://192.168.0.250`
  or `https://192.168.1.250`. Check the Pi has power (green LED flickering).
- **The header says Offline:** the phone lost the Pi. It reconnects on its own once the Wi-Fi
  is back.
- **A processor shows as not responding:** check its network cable, that **IP Control** is on, and
  that its address is on a range the Pi can reach.
- **The Pi is unplugged mid-show:** nothing happens to the screens. The Pi only reads from the
  processors, and only writes when someone sends a command in Setup Mode. When it boots again it
  starts in Show Mode and doesn't change anything on the processors.
- **The server crashes:** it restarts on its own within a few seconds, in Show Mode.

## Development (on a laptop)

```bash
npm install
npm run dev        # mock processors + server + web app with hot reload
```

Open http://localhost:5173. The dev setup PIN is `1234`. It starts eight simulated processors on
`127.0.0.1:9001-9008`, including pairs, a missing partner, a hot processor and a version mismatch.

Other commands:

- `npm run check`, `npm run lint` and `npm run format` keep the code clean.
- `npm run build` then `npm start` runs the production build.
- `npm run bundle` makes `screen-remote.tgz` for copying to a Pi.
- `npm run diff-api -- 192.168.0.50` compares a real processor's API with the Tessera profile.
  Run it after a Tessera update (see `shared/src/tessera/profiles/`).
