# 05 — Klipsch R-14PM + local audio out of the kiosk laptop

Research date: 2026-09-18. Every factual claim below carries a primary-source URL.
Claims I could not verify against a primary source are marked **UNVERIFIED** explicitly.

Primary sources pulled for this document:

- Klipsch R-14PM product page — <https://www.klipsch.com/products/r-14pm-powered-monitors>
- Klipsch R-14PM spec sheet (PDF, V02) — <https://d2um2qdswy1tb0.cloudfront.net/spec-sheets/R-14PM_SpecSheet_V02.pdf?v=1718393950>
- Klipsch R-14PM owner's manual (PDF, V05 - 170626) — <https://d2um2qdswy1tb0.cloudfront.net/product-manuals/R-14PM-Manual-v05WEB.pdf?v=1608088327>
- Music Assistant server source, branch `dev`, commit `4bba1b337f8919ea4eb4ee71ca25d70cbe4a429e` (2026-09-18) — <https://github.com/music-assistant/server>

---

## 1. Klipsch R-14PM — I/O, controls, power behaviour

### 1.1 The headline finding: the volume knob is on the REAR panel

This is the single most important fact for this project, and it inverts the premise of the brief.

The manual's exploded diagram is titled **"RIGHT SPEAKER (ACTIVE)"** and the numbered callouts are
all on one panel. Callout 3 is **"Volume/Source Control"**, and it sits on the same panel as callouts
that can only be on the back: **"Left Speaker Terminal"**, **"Mains Inlet"**, **"Ground Screw Terminal"**,
**"Subwoofer Output"**, **"Optical Input"**, **"USB Audio Input"**
(manual pp. 3–4, <https://d2um2qdswy1tb0.cloudfront.net/product-manuals/R-14PM-Manual-v05WEB.pdf?v=1608088327>).

The silkscreen text extracted from the manual's rear-panel artwork (pp. 11–14) reads:

```
RIGHT SPEAKER OUT    DIGITAL IN        ANALOG IN/OUT
VOLUME/SOURCE        OPTICAL           SUB OUT
                     USB AUDIO         GND
                                       AUX IN   AUX 1 IN   PHONO | LINE
                                       AUX 1 LEVEL   UP | DOWN
```

`VOLUME/SOURCE` appears in the rear-panel block, next to `RIGHT SPEAKER OUT`. There is **no front-baffle
control of any kind** anywhere in the manual — the front has the horn tweeter, the woofer, and the LED
source indicator only.

**Consequence for this project:** the brief assumes the child will "freely use the speakers' physical
volume knob". On the R-14PM that knob is on the back of the right speaker, behind the cabinet, next to
the mains inlet and the speaker binding posts. For a 4-year-old this is not a friendly control — it is
awkward to reach, invisible from the front, and it is surrounded by the two things you least want a
child fiddling with (mains cord, spring terminals with bare speaker wire).

The realistic "child-operated volume" on this system is the **IR remote**, not the knob (see 1.3).
The software ceiling is still mandatory — but you should decide deliberately whether the child gets the
remote, and whether the knob is set once by the parent and then left alone. See §6.

### 1.2 Every input and output

From the spec sheet (<https://d2um2qdswy1tb0.cloudfront.net/spec-sheets/R-14PM_SpecSheet_V02.pdf?v=1718393950>)
and the manual's rear-panel callouts:

| Input | Connector | Notes from primary source |
|---|---|---|
| **Phono / Line** | RCA L/R pair, with a **PHONO ⇄ LINE slide switch** and a **ground screw terminal** | Spec sheet: "Phono/Line analog (with switch and ground screw terminal)". The built-in phono preamp is real: "The built-in phono pre-amp lets you enjoy your favorite records without the need for additional electronics." Set the switch to **LINE** for any non-turntable source. |
| **AUX (3.5 mm)** | 3.5 mm stereo mini jack, labelled `AUX IN` | Spec sheet: "3.5mm analog mini jack". Manual callout 5: "Auxiliary 3.5mm Input". |
| **USB** | **USB Type B** (the square printer-style socket) | Manual p. 2 lists the included "USB Cable (A to B)"; spec sheet included-accessories lists "1.5M USB Type A to Type B cable". Rear silkscreen: `USB AUDIO`. |
| **Optical** | TOSLINK S/PDIF, labelled `OPTICAL` under `DIGITAL IN` | Spec sheet: "Optical digital". |
| **Bluetooth** | — | Spec sheet lists "Bluetooth® wireless technology"; the product page states **aptX** codec support (<https://www.klipsch.com/products/r-14pm-powered-monitors>). **The Bluetooth version number is not stated on either the spec sheet or in the manual — UNVERIFIED.** |
| **Sub out** | Single RCA, labelled `SUB OUT` | Spec sheet: "Single RCA line level output for connection to subwoofer". Sub level is adjustable **only from the remote** (Subwoofer Level Up/Down/Reset — manual p. 9). |

USB audio quality: the product page states the USB input plays "digital music files up to
**24-bit / 96kHz** sample rates" (<https://www.klipsch.com/products/r-14pm-powered-monitors>).

**USB Audio Class: not stated by Klipsch — UNVERIFIED.** Inference (clearly flagged as such): 24-bit/96 kHz
stereo is exactly the ceiling of USB Audio Class 1 on full-speed USB, and Klipsch ship it as a
plug-and-play "PC READY" device with no driver download, which is UAC1 behaviour. Either way it is
**class-compliant** and needs no driver under Linux — see §4.

### 1.3 The remote, and what it controls

The manual (p. 9) shows a supplied IR remote and — unusually helpfully — publishes the raw hex codes:

| Function | Hex code |
|---|---|
| ON / OFF | `0x02FD 0AF5` |
| Mute | `0x02FD 0DF2` |
| Volume Up | `0x02FD 1CE3` |
| Volume Down | `0x02FD 07F8` |
| Play/Pause | `0x02FD 1EE1` |
| Phono Source Select | `0x02FD 01FE` |
| Auxiliary Source Select | `0x02FD 09F6` |
| Digital Optical Source Select | `0x02FD 00FF` |
| USB Source Select | `0x02FD 48B7` |
| Bluetooth Source Select | `0x02FD 5CA3` |
| Subwoofer Level Up / Down / Reset | `0x02FD 0CF3` / `0x02FD 04FB` / `0x02FD 03FC` |
| LED ON / OFF | `0x02FD 08F7` |

Source: manual p. 9, <https://d2um2qdswy1tb0.cloudfront.net/product-manuals/R-14PM-Manual-v05WEB.pdf?v=1608088327>

Two things follow:

1. **The remote has direct source-select buttons.** `USB Source Select` is one button press. That is the
   recovery path when the speaker wakes on the wrong input, and it is worth teaching the parent (not the
   child) — or automating with an IR blaster, since the codes are published.
2. **Those codes are published, so you can drive the speaker from software.** An IR LED on the laptop, or
   a Broadlink/ESPHome IR blaster already in the Home Assistant estate, can force the input to USB and
   can push volume down. This is a genuine safety net: an HA automation can slam `Volume Down` N times
   at bedtime regardless of what the child did to the knob. **The R-14PM has no feedback channel — IR is
   one-way and the speaker does not report its volume — so this is open-loop.** Repeating `Volume Down`
   ~40 times reliably lands at minimum; there is no way to read the current level back.

The manual also publishes universal-remote codes (p. 15): RCA `41609`/`43915`, DirecTV `31609`,
Xfinity `30531`/`31023`, Bright House `288`, AT&T `5156`/`5023`, plus three alternative hex code sets.

### 1.4 Source selection and the LED

The `VOLUME/SOURCE` knob is also a **push-button**: manual p. 14 ("SELECT SOURCE") shows the knob with a
"Press" instruction. So a press cycles the input and a turn changes volume — one control, two functions.
A child fumbling at the back of the speaker can therefore *change the input*, not just the volume. That
is the failure mode that produces silence and a crying 4-year-old.

The front LED encodes the active source (manual p. 13):

| Colour | Source |
|---|---|
| Blue | Bluetooth |
| Purple | Phono |
| Green | Auxiliary (3.5 mm) |
| Red | Optical |
| White | USB Audio |

This is genuinely useful for the child: **"white light = music works"** is a rule a 4-year-old can learn,
and it is directly visible from the bed. Note the remote can turn the LED off (`0x02FD 08F7`) — don't.

### 1.5 Power behaviour — largely undocumented

The manual has an ON/OFF button on the remote and a mains inlet. It documents a factory reset
(p. 16: select source to Phono/Analog/Optical/USB, then press-and-hold, LED flashes 10 seconds, which
"will clear the Bluetooth pairing history").

**Not documented anywhere in the manual or spec sheet, therefore UNVERIFIED:**

- Whether the R-14PM **auto-powers-on when it detects signal** on the selected input.
- Whether it **auto-standbys after a period of silence**.
- Whether it **remembers the last selected source across a mains power cycle**.
- Whether it **remembers the last volume setting across a power cycle**.

I could not find a Klipsch primary source stating any of these. Treat all four as unknown and
**determine them empirically** — this is a 10-minute test and it matters more than any spec:

1. Play via USB, set a known volume, pull the mains plug, plug it back in. Does it come back? On which
   input (check LED colour)? At what volume?
2. Leave it silent on USB for 30 minutes with the laptop awake. Does the LED go out / does it stop
   responding until a button press?
3. With it in whatever "off" state it reaches, start playback on the laptop. Does it wake by itself?

Design the system so the answers do not matter (see §6): leave the speakers permanently powered from a
switched outlet the child cannot reach, never let the laptop suspend USB, and keep an IR blaster as the
"put it back on USB" button.

### 1.6 Acoustics, size, and placement

From the spec sheet (<https://d2um2qdswy1tb0.cloudfront.net/spec-sheets/R-14PM_SpecSheet_V02.pdf?v=1718393950>):

| Spec | Value |
|---|---|
| System | Powered monitor (pair) — right speaker is active, left is passive |
| Frequency response | 80 Hz – 20 kHz |
| **Max output** | **103 dB @ 1 m** |
| Total system power | 70 W total (140 W peak); 35 W per channel continuous @ <1% THD |
| Tweeter | 3/4" (1.9 cm) aluminium diaphragm compression driver, 90°×90° square Tractrix horn |
| Woofer | 4" (10.2 cm) copper-spun magnetically shielded IMG |
| Crossover | 2000 Hz, passive |
| Enclosure | MDF, bass-reflex, **rear-firing port** |
| H × W × D | 9.75" × 5.88" × 7.5" (24.8 × 14.9 × 19.1 cm) |
| Weight | 7.1 lb (3.2 kg) each |
| Power | 100–240 V 50/60 Hz internal supply |

**103 dB @ 1 m is the number that should frighten you.** That is the manufacturer's own published maximum,
and it is roughly the level of a chainsaw at arm's length. At a typical near-field/bedside distance of
0.5 m it is higher still. A 4-year-old's pillow is often well inside 1 m of a bedside speaker. The
software ceiling in §2 is not paranoia — the hardware is genuinely capable of causing injury, and
Klipsch horn-loaded designs are efficient, which means a *small* knob movement produces a *large* SPL change.

**Placement, from the primary specs:**

- **Rear-firing port.** Shoving these against a wall or into a bookshelf cubby will boom the bass badly.
  Klipsch specify bass-reflex via a rear port; give them ~20–30 cm of clearance behind.
- **3.2 kg on a 14.9 cm footprint, 24.8 cm tall.** That is a top-heavy brick a 4-year-old can pull over.
  It weighs enough to hurt. Wall-mount, strap, or place them out of reach — not on a nightstand edge.
  Spec sheet lists **rubber feet** in the box; those stop sliding, not tipping.
- **The active speaker needs mains + the passive speaker needs 4 m of speaker wire run to it**
  (spec sheet: "4M speaker wire with soldered tips"). Two cable runs at child height. Route them behind
  furniture.
- **Magnetically shielded woofer** — irrelevant for safety, relevant if there is a CRT or a magnetic toy
  nearby. Not a factor in 2026.

---

## 2. The software volume ceiling

### 2.1 Restating the threat model, because the hardware changed it

The brief says "the child MAY freely use the speakers' physical volume knob". §1.1 establishes that knob
is on the **rear panel**, next to the mains inlet. So the realistic threats, ranked:

1. **The IR remote** (`Volume Up` = `0x02FD 1CE3`, auto-repeat while held). This is the actual child-reachable
   volume control, and it can be held down. If the child gets the remote, the Klipsch's own analogue gain
   goes to maximum and *nothing in software can pull it back*.
2. **The rear knob**, if the child goes behind the speaker — which also risks changing the *input*
   (the knob is a push-to-cycle-source control, §1.4) and exposes mains + bare speaker wire.
3. **The kiosk UI / laptop mixer**, if the child can reach a volume slider or a keyboard volume key.

**The hard truth: software on the laptop cannot bound what the amplifier does with its own volume control.**
A software ceiling bounds the *signal level presented to the R-14PM's input*. If the Klipsch's own gain is
at maximum, a -18 dB software ceiling just means the child hears a quieter-but-still-amplified signal —
and the amp's maximum is 103 dB @ 1 m (§1.6). Software attenuation and the amp's gain multiply.

So the design must be:

- **Software ceiling** (§2.2–2.6) — bounds the digital signal. Necessary, not sufficient.
- **Plus a fixed, calibrated analogue gain** on the Klipsch, set once by the parent, with the remote
  kept out of the room (or its volume buttons taped over). This is the part that actually makes 103 dB
  unreachable.
- **Plus calibration performed at the worst case** (§2.7) — knob wherever the child can get it to.

I would not give a 4-year-old the remote. The child's volume control should be *in the kiosk UI*, where it
is bounded by construction. That contradicts the brief's premise, and I think the brief's premise is wrong
for this specific speaker — on a front-knob speaker it would be fine; on the R-14PM the knob is in the
worst possible place.

### 2.2 ALSA `softvol` — yes, this is the right primitive

ALSA's `softvol` plugin takes a `max_dB` parameter, and **the control cannot exceed it**. That is a genuine
hard ceiling baked into a root-owned config file rather than into a mixer setting the user can move.

Per the ALSA plugin reference (<https://www.alsa-project.org/alsa-doc/alsa-lib/pcm_plugins.html>), `softvol`
"applies the software volume attenuation", and takes:

```
pcm.name {
    type softvol
    slave STR|{ pcm STR [format STR] }
    control { name STR [card STR] [iface STR] [index INT] [count INT] }
    [min_dB REAL]      # default -51.0
    [max_dB REAL]      # default 0.0
    [resolution INT]   # default 256
}
```

The key property: the softvol control maps its 0..resolution range onto `min_dB..max_dB`. Set
`max_dB -18.0` and a control reading 100% produces −18 dB relative to unity. The kiosk can slam that
control to maximum all day; −18 dB is the ceiling.

**Concrete `/etc/asound.conf`** (system-wide, root-owned, mode `0644`):

```
# /etc/asound.conf
# Bounded-output configuration for a child's bedroom kiosk.
# THE CEILING IS max_dB BELOW. Calibrate it per section 2.7, then chmod 644 root:root.

pcm.!default {
    type plug
    slave.pcm "safe_out"
}

pcm.safe_out {
    type softvol
    slave.pcm "dmixed"
    control {
        name "SafeCeiling"
        card "Speakers"          # see note on card naming below
    }
    min_dB     -60.0
    max_dB     -18.0             # <<<<<< THE SAFETY CEILING. Calibrated, not guessed.
    resolution 100
}

pcm.dmixed {
    type dmix
    ipc_key 2048
    slave {
        pcm         "hw:Speakers,0"
        rate        48000
        format      S16_LE
        period_size 1024
        buffer_size 8192
    }
}

ctl.!default {
    type hw
    card "Speakers"
}
```

Notes on this config:

- Replace `Speakers` with the real card id from `cat /proc/asound/cards` or `aplay -l`. **Use the card
  *name*, never the index** — indices renumber when USB devices enumerate in a different order at boot,
  and an index-based config is a config that silently points at the wrong card after a reboot. You can pin
  a name with a udev rule or the `snd-usb-audio` `index=`/`id=` module options.
- `dmix` lets more than one process open the device (the player plus, say, a notification sound) without
  `EBUSY`. If only one process ever plays, you can slave `softvol` straight to `hw:Speakers,0` and drop the
  `dmix` block — fewer moving parts, lower latency.
- `resolution 100` makes the control a clean 0–100 so it lines up with MA's 0–100 volume scale.
- **This file is the ceiling.** Its protection is filesystem permissions: root-owned, not writable by the
  kiosk user. A per-user `~/.asoundrc` would be writable by the kiosk user and is therefore **useless as a
  safety control** — use `/etc/asound.conf`.

### 2.3 The hardware mixer is a separate hole — close it

`softvol` bounds only the stream that passes through it. The card's own mixer controls (`Master`, `PCM`,
`Speaker`, `Headphone`, and on a USB DAC often a `PCM` feature-unit control) sit *downstream* and can undo
your work. Three complementary measures:

**(a) Set the hardware mixer once and persist it.**

```sh
amixer -c Speakers sset 'PCM' 100% unmute      # or whatever the device exposes
alsactl store                                   # writes /var/lib/alsa/asound.state
```

`alsactl store`/`restore` and the `alsa-restore.service` shipped by alsa-utils reload that state at boot.
Setting the hardware control to 100% and doing all attenuation in `softvol` is the right split: one place
to reason about, and the calibrated number lives in a root-owned file.

**(b) Deny the kiosk user access to the control devices.**

The control device nodes are `/dev/snd/controlC*`, normally `crw-rw----+ root:audio`. A process that is not
in group `audio` (and has no ACL) cannot open them, so it cannot run `amixer`, cannot move `SafeCeiling`,
and cannot move the hardware mixer.

```sh
gpasswd -d kiosk audio          # kiosk browser user loses mixer access entirely
```

**The important gotcha:** `softvol` *creates and writes an ALSA control element*, so the process doing the
playback **does** need write access to the control device. If you strip `audio` from the account that runs
the player, softvol breaks. Therefore:

> Run the **player** as a user (or container) that has `/dev/snd` access, and run the **kiosk browser** as a
> different user that does not.

This falls out for free with the Local Audio App (§3.2): it runs in Docker as root with `/dev/snd` mounted,
while the kiosk browser user needs no audio access at all — the browser is not producing audio in that
design. This is a real architectural advantage of the Local Audio App over the in-browser web player, and
it is worth more than the visualiser.

If you must keep one user for both, drop this udev rule to make the controls read-only to non-root and
have the player run with the needed privilege:

```
# /etc/udev/rules.d/89-sound-lockdown.rules
SUBSYSTEM=="sound", KERNEL=="controlC*", MODE="0600", OWNER="root", GROUP="root"
```

**(c) Neutralise the keyboard volume keys.** On a laptop these are real keys the child will find. Remove
the XF86AudioRaiseVolume/LowerVolume bindings in the desktop/WM config, or remap them to no-ops. Physically
prying the keycaps off an old laptop is a legitimate engineering solution here.

### 2.4 PipeWire / WirePlumber — possible, but I recommend against using it at all

If PipeWire is already on the machine, the clean way to get a hard ceiling is **not** a node volume
(WirePlumber has no "maximum volume" property that bounds a user-settable volume — a node's volume is just
a number anything with session-manager access can set). The robust way is to put a **fixed gain stage in
the graph** as a virtual sink, make it the default sink, and never expose its controls.

`module-filter-chain` supports LADSPA, LV2 and builtin filters, configured under
`/etc/pipewire/filter-chain.conf.d/` (<https://docs.pipewire.org/page_module_filter_chain.html>).

**A brickwall limiter as a virtual sink**, using the classic `swh-plugins` fast-lookahead limiter:

```
# /etc/pipewire/filter-chain.conf.d/99-safe-ceiling.conf
context.modules = [
  { name = libpipewire-module-filter-chain
    args = {
      node.description = "Safe Ceiling"
      media.name       = "Safe Ceiling"
      filter.graph = {
        nodes = [
          { type   = ladspa
            name   = limiter
            plugin = fast_lookahead_limiter_1913
            label  = fastLookaheadLimiter
            control = {
              "Input gain (dB)" = -18.0
              "Limit (dB)"      = -12.0
              "Release time (s)" = 0.5
            }
          }
        ]
      }
      capture.props = {
        node.name   = "safe_ceiling_sink"
        media.class = Audio/Sink
        audio.position = [ FL FR ]
      }
      playback.props = {
        node.name   = "safe_ceiling_out"
        node.passive = true
        audio.position = [ FL FR ]
      }
    }
  }
]
```

Then pin it as the default sink in WirePlumber so applications land on it, and let its output link to the
real device.

Two honest caveats:

- **The exact LADSPA `plugin`/`label`/control-port names must be verified on your machine** with
  `analyseplugin /usr/lib/ladspa/fast_lookahead_limiter_1913.so` — the PipeWire docs themselves say to use
  `analyseplugin` to discover port names, and they differ between plugin builds. Treat the control names
  above as **UNVERIFIED for your specific package** until `analyseplugin` confirms them.
- **A limiter is a better safety device than a fixed gain**, because it bounds *peaks* rather than average
  level — a quiet album with one loud transient cannot spike through. But it also means a child who cranks
  everything gets loud, compressed mush rather than silence. That is the correct failure mode for safety
  and the wrong one for musicality. Set `Input gain` for the ceiling and `Limit` as the true brickwall.

**My recommendation: don't run PipeWire on this machine.** It is an old laptop running one job. The Local
Audio App talks ALSA directly (`SENDSPIN_OUTPUT=hw:Speakers,0`), the ALSA `softvol` ceiling is simpler,
has fewer failure modes, survives a session-manager crash, and cannot be renegotiated by a desktop session
that nobody is logged into. PipeWire's value is dynamic routing between many apps and users; there is one
app and no user here. Use ALSA.

### 2.5 Re-asserting the level, so drift cannot accumulate

Even with `max_dB`, the `SafeCeiling` control itself can drift (a player restores its own last volume,
MA pushes a volume). Belt and braces — two mechanisms, use both:

**(a) A systemd timer that re-asserts the level.**

```ini
# /etc/systemd/system/volume-ceiling.service
[Unit]
Description=Re-assert the safe volume ceiling
After=sound.target

[Service]
Type=oneshot
ExecStart=/usr/bin/amixer -c Speakers sset 'SafeCeiling' 80%
ExecStart=/usr/bin/amixer -c Speakers sset 'PCM' 100% unmute
```

```ini
# /etc/systemd/system/volume-ceiling.timer
[Unit]
Description=Re-assert the safe volume ceiling periodically

[Timer]
OnBootSec=30s
OnUnitActiveSec=2min
AccuracySec=10s

[Install]
WantedBy=timers.target
```

`systemctl enable --now volume-ceiling.timer`. Note this competes with the player's own volume control — if
MA sets the player to 60% and the timer slams it to 80% two minutes later, that is a bug, not a feature.
**Use the timer only to re-assert the *hardware* mixer** and let `max_dB` be the ceiling on the software
side. Drop the `SafeCeiling` line unless you have decided the child gets no in-UI volume control at all.

**(b) The Local Audio App's stream hooks — the elegant one.**

`sendspin-cli` runs `SENDSPIN_HOOK_START` on every stream start
(<https://raw.githubusercontent.com/music-assistant/local-audio-addon/main/README.md>). That is the exact
moment you want the hardware mixer pinned, and it costs nothing when no music is playing:

```yaml
# docker-compose.yml (excerpt)
environment:
  SENDSPIN_NAME: "Bedroom Speakers"
  SENDSPIN_OUTPUT: "hw:Speakers,0"
  SENDSPIN_HOOK_START: amixer -c Speakers sset 'PCM' 100% unmute
```

Remember the README's warning about `$` in Compose: "To read one of them inside a command written in
`docker-compose.yml`, double the dollar — `$$SENDSPIN_EVENT`."

### 2.6 MA's own per-player ceiling — a genuine third layer, with a twist

Music Assistant has a built-in per-player maximum volume. From `music_assistant/constants.py` L434–443
(<https://github.com/music-assistant/server/blob/dev/music_assistant/constants.py>):

```python
CONF_ENTRY_MAX_VOLUME = ConfigEntry(
    key=CONF_MAX_VOLUME,
    type=ConfigEntryType.INTEGER,
    range=(0, 100),
    default_value=100,
    category="player_controls",
    advanced=True,
    depends_on=CONF_VOLUME_CONTROL,
    depends_on_value_not=PLAYER_CONTROL_NONE,
)
```

**The twist: it is a rescale, not a clamp.** From `controllers/players/controller.py` L1915–1927:

```python
"""Scale logical volume (0-100) to device volume (min_volume-max_volume)."""
...
# Scale: logical 0 -> min_volume, logical 100 -> max_volume
return min_volume + (logical_volume * (max_volume - min_volume)) // 100
```

So `max_volume = 40` means MA's own 0–100 slider is remapped onto the device's 0–40. The child sees a
full-range slider in the UI; the device never goes above 40. That is exactly the behaviour you want for a
child's UI — no visible "forbidden zone" to fight against, just a slider whose top is safe.

There is also `_enforce_volume_limits`, which clamps back if the volume is changed *externally* and lands
outside the configured range (L2798–2817). So if something else moves the player's volume, MA corrects it.

Set this. It is one field (it is marked `advanced=True`, so enable advanced settings in the MA UI), it
applies per-player so the Sonos and the Klipsch can have different ceilings, and it is enforced on the
server — surviving a laptop reimage.

### 2.7 Calibration: the actual procedure

**What to target.** There is no published standard for "loudspeakers in a child's bedroom" (see §2.8), so
build the target from the occupational limit with a large margin:

- NIOSH's recommended exposure limit is **85 dBA averaged over 8 hours, with a 3 dB exchange rate** — every
  3 dBA increase halves the allowable duration (<https://www.cdc.gov/niosh/noise/about/noise.html>).
  NIOSH explicitly does **not** identify any level as safe for unlimited exposure.
- A bedroom is not an 8-hour workday for an adult; it is potentially all day for a developing auditory
  system, unsupervised.

Working backwards with the 3 dB exchange rate from 85 dBA / 8 h: 82 dBA / 16 h, 79 dBA / 32 h, 76 dBA / 64 h.

> **Target: 75 dBA maximum at the pillow, with the system at full software scale and the Klipsch knob
> wherever the child can get it.** Typical listening will then land around 55–65 dBA, which is
> conversation level and plenty for a bedroom.

This is my opinionated number, derived as above, not a quoted standard. Being 10 dB under an adult
occupational limit, for a child, in a room they cannot leave, is the right kind of conservative.

**Procedure:**

1. **Turn on MA's volume normalisation first.** Without it, calibration is meaningless: you calibrate on one
   track and a louder master blows straight past it. MA has `CONF_VOLUME_NORMALIZATION` with
   `CONF_VOLUME_NORMALIZATION_TARGET`, an integer in range `(-30, -5)` defaulting to **-14** LUFS
   (<https://github.com/music-assistant/server/blob/dev/music_assistant/constants.py>, L461–468). Enable it.
   Now every track arrives at roughly the same loudness and one calibration holds for the whole library.
2. **Get a real SPL meter.** A Class 2 meter is ~£30. Phone apps are uncalibrated and typically read several
   dB off, worse at the extremes and worse still on cheap mics — use one only to compare against a real
   meter, never as the basis for the ceiling. Set **A-weighting, Slow response**.
3. **Put the microphone where the child's head actually is** — on the pillow, not at the speaker, not at
   standing adult height. Measure the distance; if it is under 1 m, note that the Klipsch's published
   103 dB figure is quoted at 1 m and will be exceeded closer in.
4. **Set the Klipsch rear knob to the position you intend to leave it**, then **mark it** — a dot of nail
   varnish on the knob and the cabinet, so you can see at a glance if it has moved.
5. **Play the worst case**: the loudest, densest, most compressed track in the child's actual library (not
   pink noise — pink noise under-represents how loud a modern master feels). Set MA volume to 100.
6. **Read the meter over a full minute.** Note the maximum.
7. **Adjust `max_dB` in `/etc/asound.conf`** until that maximum reads your target. Each 6 dB you subtract
   halves the voltage. Restart the player after each change (ALSA reads the config at PCM open).
8. **Re-test the adversarial cases**, because this is the step people skip:
   - Turn the rear knob to **maximum**. Re-measure. If the child can reach the knob, *this* is the number
     that must be ≤ your target, and you must take the difference out of `max_dB`.
   - If the remote stays in the room, hold **Volume Up** until it stops rising. Re-measure. If that exceeds
     target, the remote cannot stay in the room — no software setting fixes it.
   - Measure with the child's door closed and the room's soft furnishings as they normally are.
9. **Write the numbers down** in this repo: the `max_dB` value, the knob position, the measured dBA at the
   pillow, the date, and the track used. Re-check after any hardware change.
10. **Re-measure after any OS update.** A PipeWire or ALSA package update can reintroduce a default route
    that bypasses your `softvol` chain entirely. This is the most likely way the ceiling silently fails.

### 2.8 Published guidance on safe levels for loudspeakers in a child's bedroom

**There isn't any, and the brief is right to be suspicious of the headphone standards.**

- **EN 50332 and WHO-ITU H.870 are headphone-derived and do not transfer.** They constrain what a *personal
  audio device* delivers into a defined acoustic load (an ear simulator / coupler), expressed as a dose
  budget over a rolling seven days. There is no coupler between a bookshelf speaker and a child's ear —
  the level at the ear depends on distance, room, and where the child is standing. A speaker cannot be
  "H.870 compliant" in any meaningful sense. WHO's own hearing-loss fact sheet references the "WHO-ITU
  global standard for personal audio systems and devices" without specifying levels for loudspeakers
  (<https://www.who.int/news-room/fact-sheets/detail/deafness-and-hearing-loss>).
- **The transferable part is the dose concept, not the numbers.** Both the headphone standards and NIOSH
  rest on the same physiology: hearing damage is a function of intensity × duration. That logic applies to
  a bedroom speaker; only the measurement method changes. Hence the approach in §2.7 — measure the actual
  SPL at the actual head position, and budget it against an exposure-duration curve.
- **NIOSH's REL (85 dBA / 8 h, 3 dB exchange rate) is the most defensible anchor I found**
  (<https://www.cdc.gov/niosh/noise/about/noise.html>), with the explicit caveat that it is an
  *occupational* limit for *adults* and is a compromise with industrial feasibility — not a target for a
  child's bedroom. Use it as a ceiling to stay well below, never as a goal.
- **A second, independent reason to keep bedroom levels low: sleep.** The relevant guidance for a bedroom
  is environmental-noise guidance about sleep disturbance, which lands far below any hearing-damage
  threshold — bedroom levels for undisturbed sleep are conventionally cited in the low tens of dBA, i.e.
  two orders of magnitude of intensity below the hearing-risk numbers. **I did not verify a specific WHO
  night-noise figure against a primary source for this document — UNVERIFIED.** The practical consequence
  is unambiguous regardless: if this player is ever used at bedtime, the bedtime ceiling should be far
  lower than the daytime one, and that argues for a *time-of-day-dependent* ceiling enforced in MA or by
  the systemd timer, not a single fixed number.

**The honest summary: no standards body has published "how loud may a bookshelf speaker be in a child's
bedroom". You must measure it yourself, and the measurement is the deliverable.**

---

## 3. How the laptop becomes a Music Assistant player

### 3.1 The landscape has changed: "builtin player" is now **Sendspin**

The brief asks about MA's "built-in Web Player / builtin player provider". In current MA that name no
longer exists. I checked the provider directory on `dev` at commit `4bba1b3`
(<https://github.com/music-assistant/server/tree/dev/music_assistant/providers>): there is **no
`builtin_player` directory**. The provider called `builtin` is a *music* provider, not a player —
its manifest reads `"type": "music"`, `"description": "Built-in/generic provider that handles generic
URLs and playlists."` (<https://github.com/music-assistant/server/blob/dev/music_assistant/providers/builtin/manifest.json>).

What replaced it is **Sendspin**, MA's native playback protocol, developed by the Open Home Foundation.
Its manifest (<https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sendspin/manifest.json>):

```json
{
  "type": "player", "domain": "sendspin", "stage": "beta", "name": "Sendspin",
  "description": "Sendspin is an audio playback, control and synchronization protocol developed by
   the Open Home Foundation and is the native playback protocol built into Music Assistant, used for
   playback to supported clients like the Music Assistant Web interface, supported (mobile) clients
   and supported hardware",
  "requirements": ["aiosendspin[server]==9.1.1", "av==18.1.0"],
  "builtin": true, "allow_disable": false
}
```

Note `"builtin": true, "allow_disable": false` — it is always present and cannot be turned off.

**So: yes, the thing the brief hoped for is real, and it is better than hoped.** MA's docs state it
plainly: "the web player you use in your browser is a Sendspin player"
(<https://music-assistant.io/player-support/sendspin/>).

Answers to the brief's specific questions:

- **Does it exist?** Yes, as `sendspin`, stage `beta`, always-on builtin.
- **Does it play audio in the browser tab?** Yes. The provider README documents the browser path:
  the browser opens a **WebRTC DataChannel** to the server (signalled over the authenticated MA API
  WebSocket via `sendspin/ice_servers`, `sendspin/connect`, `sendspin/ice`, `sendspin/disconnect`), and
  Sendspin protocol messages flow over that DataChannel
  (<https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sendspin/README.md>).
  Hardware clients on the LAN can instead connect directly to `ws://<ma-server-ip>:8927/sendspin`.
- **Is it a normal targetable player, with volume and queue?** Yes. `player.py` adds
  `PlayerFeature.PLAY_MEDIA`, `PlayerFeature.SET_MEMBERS`, `PlayerFeature.MULTI_DEVICE_DSP`
  unconditionally, and adds `PlayerFeature.VOLUME_SET` / `PlayerFeature.VOLUME_MUTE` when the connected
  client advertises those capabilities
  (<https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sendspin/player.py>, ~L1231–1260).
  The README's "Player Features" section confirms: "**Volume control** - Set volume level (0-100) and mute".
  It gets a normal `PlayerQueue` like any other player.
- **Audio quality in the browser:** MA's docs state lossless **FLAC** on desktop and Android browsers
  on the local network, Opus on iOS/Safari and for all browsers over remote access
  (<https://music-assistant.io/player-support/sendspin/>). On a LAN-local kiosk laptop you get FLAC.
- **Does it survive a page reload?** **UNVERIFIED — and this is the load-bearing unknown.** MA's docs
  do not address it, and I could not find a primary statement either way. Mechanically, a page reload
  tears down the `RTCPeerConnection`, so the DataChannel closes and the client must re-run the
  `sendspin/connect` handshake and re-register. The player object is keyed to the client, and the
  provider has explicit `DisconnectBehaviour` handling (`DisconnectBehaviour.UNGROUP` and
  `DisconnectBehaviour.STOP` both appear in `player.py`), which tells you disconnects are a first-class,
  handled event rather than a crash — but also that **a reload plausibly stops playback**.
  **Test this before committing to it.** For a kiosk that may reload on a whim, this is the risk.
- **Pairing:** the provider has a whole PIN-pairing subsystem (`CONF_PAIRING_METHOD`, `CONF_PAIRING_PIN`,
  `CONF_MIN_PIN_LENGTH`, `PAIR_PIN_ENTRY_TIMEOUT`, `security.py`). MA's docs say pairing is optional and
  configurable per player. For a locked-down kiosk you want pairing **off** (or paired once), so the
  kiosk never shows a PIN prompt a 4-year-old cannot answer.

### 3.2 The better option for this project: the **Local Audio App** (sendspin-cli)

There is a second Sendspin client that is a far better fit for a wired-speaker kiosk, and it is the
official successor to the old local-audio provider.

The old `local_audio` player provider is **retired**. Its code is a tombstone that raises on load
(<https://github.com/music-assistant/server/blob/dev/music_assistant/providers/local_audio/__init__.py>):

```python
raise UnsupportedSystemError(
    "The local audio provider within Music Assistant has been retired in favor of "
    "running a sendspin add-on such as the official Local Audio App.",
    ...)
```

The replacement is <https://github.com/music-assistant/local-audio-addon>, which packages
[`sendspin-cli`](https://github.com/Sendspin/sendspin-cpp-cli). Per its README
(<https://raw.githubusercontent.com/music-assistant/local-audio-addon/main/README.md>):

- It "Plays Music Assistant audio out of the machine it runs on — through ALSA, or through a PulseAudio
  or PipeWire server the host already runs."
- **It is not HA-only.** "Quickstart with Docker Compose: `docker compose up -d`". Docker Compose and the
  HA app are the two supported deployments.
- **It self-discovers.** "Music Assistant discovers the player over mDNS and connects back in on port
  8928, which is why the container needs `network_mode: host`." No provider config in MA.
- **Output selection** via `SENDSPIN_OUTPUT`: backends built are `null`, `stdout`, `alsa`, `pulse`,
  `pipewire`. "`default`, `hw:1,0` or any other unclaimed name is an ALSA PCM." Under Compose there is
  no `/etc/asound.conf` in the image, so `default` is "ALSA's own default over `/dev/snd` — usually the
  first card, not whatever the host routes its audio through. Name the card explicitly if that is not
  the one you want, for example `hw:1,0`." **This matters — see §6.**
- **Volume persists.** "`/data` holds the player's persistent state — volume, mute, static delay and the
  last server it talked to — under `/data/state`. The Compose file keeps it in a named volume, so a
  recreated container comes back at the same volume level."
- **It survives the output vanishing.** "An ALSA device that disappears while a stream is playing is
  reopened by the player rather than being lost until the next track." That is exactly the USB-DAC
  re-enumeration case.
- **It has start/stop hooks** — `SENDSPIN_HOOK_START` / `SENDSPIN_HOOK_STOP`, shell commands run via
  `sh -c` on every stream start/stop. **Use this to re-assert the volume ceiling on every single stream
  start** (see §2.5). This is the single best lever in the whole design.
- Caveat, stated by MA: "The app is experimental. It works, but it has not been through wide testing on
  real hardware." (<https://music-assistant.io/player-support/local-audio/>)
- `SENDSPIN_BUFFER_MS` (10–2000, default 100) is the knob for an old laptop that stutters.

### 3.3 The alternatives, briefly and with their current status

| Option | Manifest `stage` | Volume from MA | Gapless | Verdict for this project |
|---|---|---|---|---|
| **Sendspin / Local Audio App** | `beta` (provider), app "experimental" | Yes (0–100, client-advertised) | Server-side continuous stream | **Recommended.** Native, no transcode hop, auto-discovered, persists volume, has stream hooks. |
| **Sendspin web player (kiosk tab)** | `beta` | Yes | Server-side | Attractive (restores Web Audio for a future visualiser) but **reload behaviour unverified**. |
| **Squeezelite** | `stable` | Yes | **Yes, explicitly** | The safe, boring fallback. Only `stable`-stage option here. |
| **Snapcast** | **`unmaintained`** | — | — | **Do not use.** MA's own manifest marks it unmaintained. |
| **AirPlay** (`airplay`) | — | — | — | Extra protocol hop, latency, and it now exists mainly as a Sendspin *bridge* (`airplay/sendspin_bridge.py`). No reason to pick it for a wired local speaker. |
| **DLNA/UPnP** (`dlna`) | — | Yes (`VOLUME_SET`, `VOLUME_MUTE`) | Yes (`GAPLESS_PLAYBACK`) | Works, but you would be installing a UPnP renderer on the laptop to talk to a server on the same LAN to drive a speaker wired to that same laptop. Pointless indirection. |

Sources: each provider's `manifest.json` and `player.py` under
<https://github.com/music-assistant/server/tree/dev/music_assistant/providers>.

**Squeezelite specifics** (the fallback): manifest is `"stage": "stable"`, uses `aioslimproto==3.2.2`
over slimproto (<https://github.com/music-assistant/server/blob/dev/music_assistant/providers/squeezelite/manifest.json>).
Its `player.py` declares `PLAY_MEDIA`, `SET_MEMBERS`, `MULTI_DEVICE_DSP`, **`VOLUME_SET`**, `PAUSE`,
`ENQUEUE`, and **`GAPLESS_PLAYBACK`** — the only provider examined here that declares gapless as an
explicit player feature (<https://github.com/music-assistant/server/blob/dev/music_assistant/providers/squeezelite/player.py>, ~L105–111).
Install `squeezelite` from the distro, point it at the ALSA device, and MA's Squeezelite provider
discovers it. It is a tiny C daemon — negligible CPU on an old laptop — and it restarts cleanly from a
systemd unit, which makes "robust across reboots" trivially true.

Note that Sendspin does **not** declare `PlayerFeature.GAPLESS_PLAYBACK`. That is not a defect: Sendspin
receives one continuous server-side-mixed stream, so track transitions (and crossfade) happen on the MA
server before the audio reaches the client. Gapless is inherent rather than delegated. Squeezelite, by
contrast, receives discrete tracks and must handle the seam itself, hence the explicit flag.

### 3.4 Recommendation for §3

**Use the Local Audio App (sendspin-cli) in Docker on the laptop, with ALSA output, as the primary
player. Keep Squeezelite installed and disabled as the fallback.**

Reasoning against the brief's own criteria:

- *Latency*: Sendspin is the native protocol with sample-accurate sync; no AirPlay/DLNA transcode hop.
- *Gapless*: inherent (server-side stream).
- *Can MA set its volume*: yes, 0–100, and MA additionally has a per-player `max_volume` (see §2.6).
- *Robust across reboots*: Docker `restart: unless-stopped` + named volume for `/data/state` (volume level
  survives), + mDNS re-discovery. Strictly better than a browser tab.
- *CPU on an old laptop*: `sendspin-cli` is C++; decoding FLAC is trivial. Compare to a browser tab doing
  WebRTC + decode + your kiosk UI, which is the expensive option.

The decisive point is that **the kiosk browser stops being load-bearing for audio**. If the UI crashes,
reloads, or is being restyled, the music keeps playing. For a 4-year-old's bedroom that is worth more
than the visualiser.

If the future Web Audio visualiser becomes a hard requirement, revisit the web player — but note you can
also build a visualiser from MA's own metadata/progress events without needing the audio in the tab.

---

## 4. USB vs 3.5 mm vs optical from an old Linux laptop

### 4.1 The verdict: USB

**Use USB.** The reasoning is mostly about what it *avoids*.

| | **USB** | **3.5 mm** | **Optical** |
|---|---|---|---|
| Who does D→A | The R-14PM | **The laptop's headphone DAC** | The R-14PM |
| Does an old laptop's analogue stage degrade it | No — bypassed entirely | **Yes, and this is the whole problem** | No |
| Ground loop / charger whine risk | Low (shared ground, but no analogue path to inject into) | **High** | **None** (galvanically isolated) |
| Present on an old laptop? | Always | Usually (often a 4-pole combo jack) | **Almost never** |
| Max quality | 24-bit / 96 kHz per Klipsch | Whatever the laptop's codec does | Typically 24/96 over TOSLINK |
| Cable in the box | **Yes**, 1.5 m A-to-B | No | No |
| Recovery button on remote | `USB Source Select` `0x02FD 48B7` | `Auxiliary` `0x02FD 09F6` | `Digital Optical` `0x02FD 00FF` |
| LED confirmation | **White** | Green | Red |

Sources: spec sheet and manual as cited in §1.

**Why not 3.5 mm.** The laptop's headphone output is the single worst component in this chain. On an old
machine it is a cheap codec sharing a ground plane with a switching PSU, a spinning disk and a Wi-Fi radio.
You get hiss on quiet passages, and — the classic — a whine that changes pitch with CPU load and appears
only when the charger is plugged in. A permanently-installed bedroom system is *always* on the charger. The
R-14PM gives you a way to skip that entire stage; take it.

There is one genuine argument *for* 3.5 mm: it gives you an analogue attenuation stage in the laptop
(the hardware mixer) as an extra layer, and it avoids all USB power-management complexity. If the USB route
proves flaky on this specific old laptop, 3.5 mm is a working fallback — accept the noise floor and move on.
It is a bedroom, not a mastering suite.

**Why not optical.** The blocker is trivial: **most laptops have no S/PDIF output.** A few older models had a
combo headphone jack with a mini-TOSLINK optical mode. Check yours (`cat /proc/asound/card*/codec*` and look
for an SPDIF pin, or just look for a red glow in the jack). If it happens to be there, optical is
technically the nicest option — it is the only one that is *galvanically isolated*, so mains hum and USB
bus noise cannot cross into the speaker at all, and it has none of the USB autosuspend problems in §4.3.
But do not buy a USB-to-optical adapter to get there: that reintroduces USB, with an extra box to lose
power, for no benefit over plugging USB into the speaker directly.

### 4.2 Class-compliance under Linux

The R-14PM presents as a standard USB audio device. Klipsch ship no driver and market it as "PC READY"
with the included A-to-B cable (<https://www.klipsch.com/products/r-14pm-powered-monitors>), which means it
must be class-compliant. Under Linux the in-kernel `snd-usb-audio` driver binds it with no configuration.

**Klipsch do not state the USB Audio Class version — UNVERIFIED.** As noted in §1.2, 24-bit/96 kHz stereo is
precisely the UAC1 full-speed ceiling, which makes UAC1 the likely answer. Practically it does not matter:
both UAC1 and UAC2 are handled by `snd-usb-audio` without a driver, and UAC2 is not the "needs
`quirks`/implicit-feedback fiddling" case that some pro interfaces are.

Verify on the actual machine before building anything on top:

```sh
lsusb                                   # find the Klipsch device, note idVendor:idProduct
cat /proc/asound/cards                  # confirm it registered as a card, note its id
aplay -l                                # confirm the playback device, e.g. hw:2,0
cat /proc/asound/card2/stream0          # THE IMPORTANT ONE: shows the USB audio class,
                                        # supported formats, rates, and endpoint/sync type
speaker-test -D hw:2,0 -c 2 -t wav      # confirm sound actually comes out, both channels
```

`/proc/asound/cardN/stream0` is the definitive answer to "what does this device actually support" — it
prints the altsettings, formats, sample rates and whether the endpoint is adaptive or asynchronous. Read it
before choosing a rate to pin in §4.4.

### 4.3 Known Linux USB-audio issues, and the fixes

**(a) USB autosuspend — fix this first, it is the most likely cause of "the first second of every song is
missing".** The kernel suspends idle USB devices by default. A suspended USB DAC takes time to resume, so
the beginning of a track is clipped, or the stream fails to start at all.

Per the kernel's USB power-management documentation
(<https://www.kernel.org/doc/html/latest/driver-api/usb/power-management.html>):

- The `usbcore.autosuspend` module parameter is the default idle-delay in **seconds**, and its **default
  value is 2**.
- "Setting the initial default idle-delay to -1 will prevent any autosuspend of any USB device."
- Per-device, `/sys/bus/usb/devices/.../power/control` holds `"on"` or `"auto"` — `"on"` "resumes the device
  and prevents autosuspend". `power/autosuspend_delay_ms` is the per-device delay in ms, default 2000, and
  "negative values disable it entirely".

The blunt global fix:

```
# /etc/modprobe.d/usb-audio.conf
options usbcore autosuspend=-1
```

(or `usbcore.autosuspend=-1` on the kernel command line if usbcore is built in, which the same document
describes). On a laptop this costs battery — irrelevant for a permanently-plugged-in bedroom appliance, so
take the blunt fix.

If you would rather scope it to the one device, a udev rule using the ids from `lsusb`:

```
# /etc/udev/rules.d/90-klipsch-usb-audio.rules
# Replace XXXX:YYYY with the idVendor:idProduct that `lsusb` reports for the R-14PM.
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="XXXX", ATTR{idProduct}=="YYYY", \
  TEST=="power/control", ATTR{power/control}="on"
```

**(b) Pops and clicks on stream start/stop.** Every time ALSA opens the device at a new rate, the DAC
re-locks its clock and many produce an audible click. With one track ending and another starting at a
different sample rate, you get a pop between every song. Two mitigations, both in the config you already
have:

- **Pin one sample rate** in the `dmix` slave block in §2.2 (`rate 48000`) so the hardware is opened once at
  one rate and everything else is resampled to it. Resampling in software on modern CPUs is inaudible and
  free; clock re-locks are audible.
- **Keep the device open.** This is what `dmix` does for you — the hardware PCM stays open as long as any
  client holds it. It is also why the Local Audio App is better than a browser tab here: a long-lived
  daemon holds the device rather than opening and closing it around each stream.

**(c) Re-enumeration and stable naming.** A USB device that re-enumerates (after a reboot, a power blip, or
a cable nudge) can come back as a different card index. Anything configured as `hw:1,0` then points at the
wrong card. Use card **names** in `/etc/asound.conf` and in `SENDSPIN_OUTPUT`, and pin the name with
`snd-usb-audio` `index=`/`id=` options if needed. The Local Audio App handles the transient case: "An ALSA
device that disappears while a stream is playing is reopened by the player rather than being lost until the
next track" (<https://raw.githubusercontent.com/music-assistant/local-audio-addon/main/README.md>).

**(d) Crackling on an old/slow machine.** If you get dropouts, raise the player's buffer before touching
anything else — `SENDSPIN_BUFFER_MS` accepts 10–2000 and the player defaults to 100 (same source). Try 300.
A commonly-cited additional workaround is `options snd-usb-audio nrpacks=1`, which reduces the number of
packets per URB; I did not find this in kernel documentation, so treat it as folklore that often works
rather than a documented fix — **UNVERIFIED**.

**(e) Cable length.** The included cable is 1.5 m (spec sheet). If the laptop is further away, any USB 2.0
A-to-B cable works up to the 5 m spec limit. Do not use an unpowered extension beyond that. This is a real
planning constraint in a bedroom where the laptop and the speakers may be on opposite walls.

### 4.4 One consequence of choosing USB that must be designed for

Over USB, **all volume control is digital**, happening on the laptop before the signal reaches the speaker's
DAC (unless the device exposes a USB feature-unit volume control — check `amixer -c <card> scontrols`; it
may expose nothing at all). Combined with the ceiling in §2.2, that means your usable dynamic range is
`max_dB` below full scale, and the child's in-UI volume range sits inside that.

At 16-bit this matters: attenuating 18 dB digitally throws away about three bits, leaving ~13 bits of
resolution. In practice this is inaudible at bedroom levels against a room noise floor of 30-plus dBA — but
it is the reason to do as much attenuation as possible in the **analogue** domain (the Klipsch's own knob,
set low and left alone) and as little as possible in software. Set the speaker's knob as low as you can
while still reaching comfortable listening at MA volume ~70, rather than leaving the knob high and taking
30 dB out digitally.

---

## 5. Dual-target behaviour in MA (Sonos vs. the laptop)

Confirmed from source at commit `4bba1b3`.

**Can one client target either player at runtime?** Yes, and it is exactly the API the brief guessed.
`music_assistant/controllers/player_queues/controller.py` L491–521
(<https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/player_queues/controller.py>):

```python
@api_command("player_queues/play_media", required_scope=Scope.QUEUES_CONTROL,
             allow_impersonation=True)
async def play_media(
    self,
    queue_id: str,
    media: MediaItemType | ItemMapping | str | list[MediaItemType | ItemMapping | str],
    option: QueueOption | None = None,
    radio_mode: bool = False,
    start_item: PlayableMediaItemType | str | None = None,
    sort_by: str | None = None,
    start_from_beginning: bool = False,
    shuffle: bool | None = None,
) -> None:
```

`queue_id` is the first positional parameter — "The queue_id of the queue to play media on." For ordinary
players the queue id is the player id. So the kiosk sends the identical `play_media` call and swaps one
string to switch between the Sonos and the laptop. **There is nothing awkward about "same UI, two
possible outputs" at the API level** — it is a one-field change, and each target keeps its own
independent queue.

**Can it query which players are available?** Yes:

```python
@api_command("players/all", required_scope=Scope.PLAYERS_READ)
def all_player_states(
    self,
    return_unavailable: bool = True,
    return_disabled: bool = False,
    provider_filter: str | None = None,
    return_protocol_players: bool = False,
) -> list[PlayerState]: ...
```

(<https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/players/controller.py>, L412.)

Note the default is `return_unavailable=True` — **the kiosk must pass `return_unavailable=False`, or
filter on `PlayerState.available` itself**, or it will happily offer the child a speaker that is switched
off. This is the one real gotcha.

**What does MA report when a player is offline?** The player object persists with
`state.available == False`; it is not removed from the registry. `get_player` /
`players/get` take a `raise_unavailable` flag:

```python
if (not player.state.available or not player.state.enabled) and raise_unavailable:
    msg = f"Player {player_id} is not available"
    raise PlayerUnavailableError(msg)
```

So an offline player is a **queryable object reporting `available: False`**, and commands against it
raise `PlayerUnavailableError` on the paths that opt into that check. The kiosk should treat
`available: False` as "grey out this button", not "the player is gone".

**Practical guidance for a two-output kiosk:**

- Subscribe to MA's event stream and re-render the target picker on player availability changes, rather
  than polling `players/all`.
- Because each player has its own queue, switching targets mid-song does **not** move playback. If you
  want "move the music to the other speaker", that is a different operation (transfer the queue), not a
  different `queue_id` on the next `play_media`.
- Give the child a visual, not a name: two big icons (a picture of the Sonos, a picture of the Klipsch
  pair). A 4-year-old cannot read "Kitchen" but can absolutely learn "the black box" vs "the two towers".
- Grey out, do not hide, the unavailable one. A button that vanishes teaches nothing; a greyed button
  with the speaker picture teaches "that one is asleep".

---

## 6. Recommended wiring and configuration

### 6.1 Physical wiring

```
  [ Old Linux laptop ]
        │
        │  USB A → USB B  (1.5 m cable in the box; up to 5 m if needed)
        ▼
  [ Klipsch R-14PM — RIGHT speaker (active) ]      LED must read WHITE
        │  rear panel: PHONO/LINE switch → irrelevant on USB, but set it to LINE anyway
        │
        ├── speaker wire (4 m, in the box) ──▶ [ LEFT speaker (passive) ]
        └── mains ──▶ wall outlet the child cannot reach, always on
```

Decisions, with reasons:

1. **USB, not 3.5 mm, not optical** (§4.1). It bypasses the old laptop's noisy analogue stage, the cable is
   in the box, the LED turns **white** so the child gets an at-a-glance "this is working" signal, and the
   remote has a one-press `USB Source Select` recovery button.
2. **Leave the speakers permanently powered.** Do not put them on a smart plug that cuts mains — you do not
   know whether they remember source and volume across a power cycle (§1.5, UNVERIFIED), so never make them
   find out. Power behaviour you have not tested is a 6 a.m. silent-speaker failure.
3. **Set the rear knob low and mark it.** Nail varnish dot on knob and cabinet. Set it as low as still
   reaches comfortable volume at MA ~70 (§4.4) — analogue attenuation first, digital second.
4. **Mount or secure the speakers.** 3.2 kg each, 24.8 cm tall on a 14.9 cm footprint (§1.6). Out of reach
   is better than reachable-and-safe, and it solves the rear-knob problem at the same time.
5. **Leave 20–30 cm behind them** — rear-firing bass-reflex port (§1.6).
6. **Take the remote out of the room**, or tape over Volume Up/Down and the source buttons. This is the
   single highest-leverage safety action available, because it is the only child-reachable control that can
   defeat the software ceiling entirely (§2.1).
7. **Keep the published IR codes** (§1.3) — an IR blaster already on the HA network gives you a scripted
   "force back to USB, wind volume down" recovery, which is worth wiring up once you are otherwise done.

### 6.2 Which MA player provider

**The Local Audio App (`sendspin-cli`) in Docker on the laptop, ALSA output.**

```yaml
# /opt/ma-local-audio/docker-compose.yml
services:
  local-audio:
    image: ghcr.io/music-assistant/local-audio:latest   # confirm the exact tag from the repo
    network_mode: host          # required: MA connects back on port 8928
    restart: unless-stopped
    devices:
      - /dev/snd:/dev/snd
    volumes:
      - local-audio-state:/data # persists volume, mute, last server
    environment:
      SENDSPIN_NAME: "Bedroom Speakers"
      SENDSPIN_OUTPUT: "hw:Speakers,0"      # card NAME, not index (§4.3c)
      SENDSPIN_BUFFER_MS: "300"             # old laptop; default is 100
      SENDSPIN_HOOK_START: amixer -c Speakers sset 'PCM' 100% unmute
volumes:
  local-audio-state:
```

Reference: <https://github.com/music-assistant/local-audio-addon> and its README. Take the exact image
reference and the shipped `docker-compose.yml` from that repo rather than trusting the tag above.

Why this and not the in-browser web player:

- **The kiosk browser stops being load-bearing for audio.** UI reload, crash or restyle does not stop the
  music. For a 4-year-old's bedroom that outranks the visualiser.
- **It lets the kiosk browser user have no `/dev/snd` access at all** (§2.3b), which is the cleanest way to
  make the mixer untouchable from the UI.
- Web-player survival across a page reload is **UNVERIFIED** (§3.1) and a kiosk reloads.
- Volume persists in `/data/state` across container recreation.
- `SENDSPIN_HOOK_START` gives a free hook to re-assert the hardware mixer on every stream (§2.5b).

Keep **Squeezelite** installed-but-disabled as the fallback: it is the only `stable`-stage option and
explicitly declares `GAPLESS_PLAYBACK` and `VOLUME_SET` (§3.3). If the Local Audio App's "experimental"
status bites, switch in an afternoon.

Do **not** use Snapcast — MA's own manifest marks it `"stage": "unmaintained"`.

### 6.3 The exact volume-ceiling configuration

Four layers. Each is independently sufficient for its own failure mode; none is sufficient alone.

**Layer 1 — ALSA `softvol` hard ceiling** (`/etc/asound.conf`, root:root 0644). Full file in §2.2. The
load-bearing line:

```
    max_dB     -18.0      # calibrated per §2.7 — this is THE ceiling
```

**Layer 2 — deny the kiosk user the mixer.**

```sh
gpasswd -d kiosk audio      # kiosk browser user cannot open /dev/snd/controlC*
```

The player is in a container with `/dev/snd` mounted, so it is unaffected. Also unbind the laptop's
XF86AudioRaiseVolume/LowerVolume keys (§2.3c).

**Layer 3 — MA's per-player `max_volume`.** In the MA UI, enable advanced settings, open the Bedroom
Speakers player config, set **max_volume** to your calibrated figure (start at 40). It is a rescale, not a
clamp, so the child still sees a full-range slider whose top is safe (§2.6). Set it per-player, so the Sonos
keeps its own.

**Layer 4 — re-assertion.** `SENDSPIN_HOOK_START` (above) pins the hardware mixer on every stream start.
Add the systemd timer from §2.5a only if you also want the hardware mixer re-pinned while idle.

**And enable MA volume normalisation** (`volume_normalization`, target default **-14** LUFS, range -30..-5)
— without it, one loud master defeats a calibration done on a quiet one (§2.7 step 1).

### 6.4 Calibration procedure, condensed

Full version in §2.7. The short form:

1. Enable MA volume normalisation. Wait for the library to be analysed.
2. Real SPL meter (not a phone app), **A-weighting, Slow**, microphone **on the child's pillow**.
3. Klipsch rear knob at the position you intend to leave it; mark it with varnish.
4. Play the loudest, most compressed track in the child's actual library, MA volume 100.
5. Adjust `max_dB` in `/etc/asound.conf` until the one-minute maximum reads **≤ 75 dBA at the pillow**.
   Restart the player after each change.
6. **Adversarial re-test — do not skip.** Rear knob to maximum; remote Volume Up held to its limit. If
   either exceeds 75 dBA, take the difference out of `max_dB`, or remove the remote from the room, or both.
7. Record in this repo: `max_dB`, knob position, measured dBA, the track used, the date.
8. **Re-measure after every OS update.** A package update that reinstates a default ALSA/PipeWire route can
   bypass the `softvol` chain silently — this is the most likely way the ceiling fails without anyone
   noticing.

The 75 dBA target is derived, not quoted: NIOSH's occupational REL is 85 dBA / 8 h with a 3 dB exchange
rate (<https://www.cdc.gov/niosh/noise/about/noise.html>), which gives ~64 h at 76 dBA. There is **no
published standard for loudspeakers in a child's bedroom** (§2.8), and the headphone standards (EN 50332,
WHO-ITU H.870) do not transfer because they are defined into an ear-simulator coupler that does not exist
here. If the system is used at bedtime, set a lower evening ceiling — sleep disturbance happens far below
any hearing-damage threshold.

### 6.5 Open items to settle empirically

These are the things no primary source answers. Each is a short test; do them before the child depends on it.

| # | Question | How to settle it | Why it matters |
|---|---|---|---|
| 1 | Does the R-14PM auto-power-on, auto-standby, and remember source + volume across a mains cycle? (§1.5) | Pull the plug, plug it back, watch the LED colour and listen | Decides whether the speakers may ever lose mains |
| 2 | Does the MA Sendspin **web player** survive a page reload? (§3.1) | Play in the kiosk tab, press F5 | Decides whether the web player is viable at all |
| 3 | What USB audio class / formats does it present? (§4.2) | `cat /proc/asound/card*/stream0` | Picks the rate to pin in `dmix` |
| 4 | Does the USB interface expose a mixer control? | `amixer -c <card> scontrols` | Another control surface to pin, if present |
| 5 | Bluetooth version (§1.2) | Not published by Klipsch | Irrelevant if you use USB — listed only for completeness |
| 6 | Exact LADSPA limiter port names, if you go the PipeWire route (§2.4) | `analyseplugin` | Config will not load otherwise |
