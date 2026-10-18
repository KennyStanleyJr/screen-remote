# Screen Remote - Project Brief

## Purpose

LED techs need to monitor and set up many Brompton processors from a phone anywhere in the venue,
without walking back to the processor rack or laptop.

- Hardware: Brompton Tessera processors (mostly **SX40** with **XD** distribution boxes) driving
  **ROE** panels.
- Scale: from a single wall up to many walls with **20+ processors**.
- Redundancy: processors usually run in **failover pairs** (primary + backup), but not always.

## Physical setup

```
[Processors + XDs] --- processor network --- [Raspberry Pi (ethernet)]
                                   \
                                    --- [WiFi router] ))) phones
```

- A Raspberry Pi is plugged into the processor (management) network over ethernet and runs the server.
- A WiFi router on the same network gives phones access. Phones open `https://screenremote.local`
  and install it as a PWA.
- Optional, more isolated layout: router plugged into a second (USB) ethernet port on the Pi so phones
  can only reach the Pi. See `docs/SETUP.md`.
- In practice the Pi and router are often unplugged after setup, before the show.

## Safety and security requirements

1. **Never send commands during a show.** Show Mode is a global, server-enforced read-only lock.
   It is ON after every boot. Any device can turn it ON; turning it OFF needs the setup PIN.
2. Turning Show Mode ON while overrides (test pattern, blackout, freeze) are active warns the user,
   and any temporary patterns started by the app (identify, dead pixel check) are restored first.
3. The Brompton API has no authentication, so all protection lives on the Pi:
   - WiFi password (WPA2/WPA3) is the first gate.
   - No user accounts. One shared **setup PIN** unlocks a phone's session for commands and
     settings. Leaving Show Mode always asks for the PIN; turning Show Mode on locks every phone
     (12 h cap otherwise). Wrong PIN attempts are rate limited.
   - Only an allowlist of commands can be sent; values are range checked against the API profile.
   - No raw passthrough to the processor API.
   - Destructive actions need confirmation. Everything is audit logged with the phone's nickname.
   - HTTPS with a local CA (also required for PWA install). Pi firewall allows only 80/443 (+ SSH).

## Tessera API facts (v3.5.2)

- HTTP on port 80 under `/api/`. `GET` reads (directories return subtrees), `PUT {"data": value}`
  writes. Errors come back as `{"response-code": "..."}`.
- IP Control must be enabled in the processor's Live Control tile.
- No discovery protocol: we scan configured subnets and probe `/api/system/serial-number`.
- Failover state and settings are readable; pairs are matched with `partner-serial`.
- Per panel: only device type/firmware and processor-wide online/error counts. **No per-panel
  control or pixel data.** Tessera groups (`groups/items/{n}`) are the closest thing to "screens".
- Frame store: list names, recall (test pattern type = frame number), capture, rename, delete.
  Frame images cannot be downloaded.

## Version flexibility

Tessera versions change. All API paths, types, ranges, and enums live in version profiles
(`shared/src/tessera/profiles/`). The server auto-selects a profile from each processor's
`system/software-version`, and Settings can force one. The UI hides features a profile does not
support. A diff tool compares a live processor's `?help=1` output to a profile.

## Features

### Monitoring

- Auto-discovery (subnet scan + manual add), processors remembered by serial across IP changes.
- Dashboard of failover pairs and standalone processors drawn as illustrations with status lights:
  reachable, active unit, overrides on, alerts.
- Per processor: model, name, serial, software version, project, uptime, active preset, input source
  and resolution/refresh, output brightness/colour temp/gamma, genlock, bit depth, frame rate
  multiplier, failover role/state/partner, XD/device list with firmware, online/error counts,
  cable redundancy loops, temperatures and fans, groups.
- Alerts: processor unreachable, failover partner missing, devices dropped below baseline, device
  errors, no input, over-temperature, fan fault, bad cable loop, mixed software versions.

### Setup commands (blocked in Show Mode)

- Test patterns (picker with thumbnails, Scrolling switch for patterns that have a scrolling
  version), test pattern off. No custom colour.
- Frame store: recall, rename, capture to slot, delete.
- Blackout and freeze.
- Input switching between the ports the processor reports (usually HDMI and SDI). Confirmed,
  and always applied to both processors of a failover pair.
- Output brightness, colour temperature, gamma.
- Screens (Tessera groups): each follows the processor or uses its own settings
  (`global-colour-override`); own settings expose brightness, colour temperature, gamma. Changes
  always go to both processors of a failover pair.
- Presets: recall and rename only. The 3.5.2 API cannot create or overwrite presets; that is done
  in Tessera.
- Identify: flash a pattern on one processor for a few seconds, then restore.
- Dead pixel check: step through white, red, green, blue, black on selected processors, with an
  optional final stored frame (e.g. an LDM map; Tessera's LDM test pattern is not in the API),
  then restore the previous state.
- UI shows the expected result of a command immediately; notifications only for failures and new
  critical alerts.
- Apply to: this processor, this failover pair, all, or a chosen set.
- Admin-level: request failover, reboot (with confirmation).

### Settings

Scan targets, manual hosts, processor labels, Tessera profile override, alert thresholds,
auto-relock timer, change PIN, audit log.

## UI principles

Simple and intuitive; visual over text; dark theme; small 4px radii; clean, modern, not cheesy.
Large touch targets for use with gloves or in the dark. Bottom tab bar on phones.

## Out of scope (for now)

Per-panel control (not in the API), user accounts, remote access from outside the venue network.
