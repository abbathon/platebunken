# ansible — the kiosk laptop

Configures the old laptop in `KID_ROOM`: WiFi, the audio player, and Chromium on the XFCE
session. Development happens on macOS; this machine is a deployment target.

```
cp inventory.example.yml inventory.yml
cp group_vars/kiosk.example.yml group_vars/kiosk.yml
$EDITOR inventory.yml group_vars/kiosk.yml

ansible-playbook site.yml --check --diff     # dry run, changes nothing
ansible-playbook site.yml
```

**`inventory.yml` and `group_vars/kiosk.yml` are gitignored and must stay that way.** They hold
a hostname, an address, an SSID and a PSK. The repo may be made public and carries none of it.

## Tags

```
--tags audio-list    print this machine's ALSA devices and mixers, change nothing
--tags network       WiFi profile, and check the router's reservation took
--tags audio         squeezelite
--tags kiosk         Chromium, blanking, autologin
```

## The address

**Nothing here sets a static address.** It is a DHCP reservation on the router, so the subnet
has one source of truth and a typo in a gateway cannot lock you out of a headless machine in a
bedroom. `kiosk_expected_ip` is used only to *check* the reservation took, and to display it in
the parent's settings screen.

The one thing that makes or breaks that reservation is in `roles/network`:
**`cloned-mac-address=permanent`.** NetworkManager randomises the WiFi MAC per connection by
default, and a reservation keyed to a MAC then never matches — the machine asks for a lease
under a new identity each time and silently gets a different address. It looks exactly like a
broken reservation and cannot be fixed on the router.

## Audio — the phono-out question

The laptop is not a Music Assistant player until squeezelite is running and **the slimproto
provider is enabled in Music Assistant**, which is a toggle on the HA host that Ansible cannot
reach. Until both are true, MA has no output on this machine and `squeezelite_output_device`
has nothing to act on.

Which device is "phono out" is a question for the machine, not for a doc:

```
ansible-playbook site.yml --tags audio-list
```

The built-in analog jack is usually on `hw:CARD=PCH`; the Klipsch over USB appears as its own
card. `squeezelite_mixer` matters as much — it is what lets Music Assistant move real hardware
volume, which is what makes the ceiling in `PRODUCT.md` a safety measure rather than a number
in a web page.

## What this deliberately does not do

- **No static IP on the host.** See above.
- **No input lockdown.** §8's udev rules for the keyboard and trackpad are not here yet; the
  numeric-keypad decision comes first, and locking the keyboard on a machine still being set
  up is how you end up walking to a bedroom with a USB stick.
- **No Tailscale.** §8's parent access path, not yet built.
- **It does not purge XFCE.** It is the surface you debug this machine from.
