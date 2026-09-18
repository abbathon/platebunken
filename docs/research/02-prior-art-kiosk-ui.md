# Prior art & kiosk UI research — "browse album covers" player for a 4-year-old

Research date: **2026-09-18**. Every claim below links to a primary source. Anything I could not
confirm live is marked **UNVERIFIED**.

Project context: old Linux laptop + touchscreen, web app UI, locked down with a UniFi firewall at the
network layer. Audio out to Sonos. The child can browse albums by cover art, play, and set volume.
Nothing else.

---

## 0. The backend spine (verified first, because it constrains everything else)

This section is not in the original brief, but the Sonos output requirement determines the whole
architecture, so I verified it before anything else.

### Sonos cannot be driven directly from a browser

Sonos' official **Control API is cloud-based**. The Sonos docs state plainly that "Use the Control API
on the cloud to communicate with a Sonos player. The Sonos cloud manages the communication between
your integration and the player," and that **"The Control API on the LAN is not available for wide
release"** — https://docs.sonos.com/docs/connected-home-architecture

Implication: a browser-only app talking to the official API requires OAuth, a developer account, and a
round-trip to Sonos' cloud for every play/volume command. That is the wrong dependency for a device
that should work when the internet is down, and it fights the UniFi lockdown (you'd have to punch
holes out to Sonos' cloud).

So you need a **local middleman on the LAN**. Verified options:

| Option | Status (verified 2026-09-18) | Notes |
|---|---|---|
| **Music Assistant** (server) | v2.10.3, ~3.1k stars, active — https://www.music-assistant.io/ , https://github.com/music-assistant/server | Purpose-built: library manager + player bridge |
| **SoCo** (Python Sonos lib) | 1,609 stars, last push **2026-07-29**, not archived — https://api.github.com/repos/SoCo/SoCo | Low-level UPnP control |
| **node-sonos-http-api** | 1,961 stars, last push **2025-03-22**, 200 open issues — https://api.github.com/repos/jishi/node-sonos-http-api | Still works but clearly slowing down |
| **Home Assistant Sonos integration** | "Local Push", UPnP-based, needs TCP 1400 back to HA — https://www.home-assistant.io/integrations/sonos/ | Good if HA is already running |

### Recommended spine: Navidrome → Music Assistant → Sonos

**Music Assistant controls Sonos locally** (mDNS/UPnP autodiscovery, supports both S1 and S2) —
https://www.music-assistant.io/player-support/sonos/ . Caveat from that same page: *"Using the Sonos HA
Integration at the same time as the MA Sonos S1 player provider may cause problems."*

**Music Assistant exposes a websocket API** at `/ws`, partially mirrored as JSON/REST. Maintainers
confirm API docs are served by the server itself at `http://<ma-server>:8095/api-docs` for 2.7.0+ —
https://github.com/orgs/music-assistant/discussions/3802

There is a **TypeScript client you can crib directly**: the official Vue 3 frontend's API plugin at
https://github.com/music-assistant/frontend/blob/main/src/plugins/api/index.ts . It exposes exactly
what this project needs — `getLibraryAlbums()` (filterable by favorite, search, album type, provider,
genre), `getAlbum()`, `getAlbumTracks()`, plus reactive `players` and `queues` objects and an image
proxy derived from the websocket base URL. The frontend is Apache-2.0 —
https://github.com/music-assistant/frontend

Note the maintainers' own caveat in that discussion: they "do not have the capacity to write
documentation for the API" and prefer people use the official **Python** client
(https://github.com/music-assistant/client). So the TS path is legitimate but you are reading source,
not docs.

**Music Assistant supports Subsonic/OpenSubsonic as a music provider**, tested against Gonic and
Navidrome — https://www.music-assistant.io/music-providers/subsonic/

### Why put Navidrome underneath

**Navidrome gives you a server-side thumbnail pipeline for free**, which is the single biggest
performance lever for a cover grid on weak hardware (see §4).

- Navidrome is a lightweight Subsonic-API-compatible server, explicitly targeting low resource usage
  and old hardware — https://www.navidrome.org/docs/overview/
- The Subsonic/OpenSubsonic `getCoverArt` endpoint takes a `size` parameter: *"If specified, scale
  image to this size"*, returning binary image data —
  https://opensubsonic.netlify.app/docs/endpoints/getcoverart/
- Album listing by tags via `getAlbumList2` — https://opensubsonic.netlify.app/docs/endpoints/getalbumlist2/
- Navidrome's artwork config: `CoverArtPriority` defaults to `cover.*, folder.*, front.*, embedded,
  external`; `CoverArtQuality` controls resized JPEG/WebP encoding quality (default 75);
  `EnableWebPEncoding` produces smaller images at the cost of more CPU when resizing —
  https://www.navidrome.org/docs/usage/library/artwork/

That means your kiosk can request `getCoverArt?id=…&size=300` and get a correctly-sized, cached,
optionally-WebP thumbnail without you building an image pipeline at all.

**UNVERIFIED:** I did not confirm Navidrome's exact current stable version number. The docs site's
most recent edit referenced config options for 0.63.0 as of 2026-07-08
(https://www.navidrome.org/docs/overview/), but the overview page does not state a current version.

### If you'd rather not run Navidrome

Tag your library with **beets** and let its `fetchart` plugin pull covers at import time; by default it
writes `cover.jpg` alongside the album and can resize via Pillow or ImageMagick —
https://github.com/beetbox/beets/blob/master/docs/plugins/fetchart.rst . Cover art itself can come from
the **Cover Art Archive**, which serves `/release/{mbid}/front` and pre-rendered thumbnails at 250,
500 and 1200 px, and currently documents **no rate limiting** —
https://musicbrainz.org/doc/Cover_Art_Archive/API

### Volume safety at the Sonos end

Sonos has a per-product **Volume Limit** (Settings → Your System → product → Sound → Volume Limit,
scale 0–100) — https://support.sonos.com/en-us/article/setting-a-volume-limit-on-sonos-products

Read the caveat carefully: it is **proportional, not an SPL cap**. Setting 50% means the slider's
far-right now outputs what 50% used to. It does not guarantee any dB(A) figure. See §5 for what that
means for hearing safety.

### Network lockdown note

With this spine, **the kiosk needs no internet access at all** — Navidrome, Music Assistant and Sonos
are all on the LAN. That makes the UniFi rule trivial: allow the kiosk's MAC/IP to reach only those LAN
hosts, deny all WAN. This is a much stronger position than allowlisting cloud domains.

**UNVERIFIED:** Ubiquiti's help center returned HTTP 403 to automated fetching, so I could not verify
the current UniFi UI paths first-hand. The relevant article is
https://help.ui.com/hc/en-us/articles/5546542486551-Traffic-Policy-Management-in-UniFi — confirm the
exact menu path yourself in your controller version.

---

## 1. Prior art — kids' music players

### 1.1 The landscape, classified

The brief's central question is screen-with-cover-art vs physical token. Here is the honest split.

| Project / product | Interaction model | Music source | Status (verified 2026-09-18) | Class |
|---|---|---|---|---|
| **Phoniebox / RPi-Jukebox-RFID** | RFID/NFC card + GPIO buttons + **web app with cover art** | local, podcast, web radio, Spotify | 1,791★, last push 2026-08-05, v3.6.0 (2026-03-04) — [repo](https://github.com/MiczFlor/RPi-Jukebox-RFID) | **Hybrid** |
| **TonUINO (original)** | RFID + arcade buttons, no display | local microSD (DFPlayer) | 450★, last push **2023-08-13** — dormant — [repo](https://github.com/xfjx/TonUINO) | Token |
| **TonUINO-TNG** (now official) | RFID + arcade buttons, no display | local microSD | 202★, last push **2026-09-18**, v3.3.3 (2026-09-17) — [repo](https://github.com/tonuino/TonUINO-TNG) | Token |
| **Jukebox4Kids** | RFID + buttons + rotary + 7-seg/16x2 LCD | local MP3 via MPD | 12★, last push **2015-02-12** — dead — [repo](https://github.com/hdo/jukebox4kids) | Token |
| **Pi MusicBox** | headless + browser UI with cover art | Spotify + local | **archived 2024-11-20**; domain squatted — [repo](https://github.com/pimusicbox/pimusicbox) | Screen |
| **Mopidy** (the engine underneath) | n/a (server) | extensible backends | 8,580★, last push 2026-09-12 — very active — [repo](https://github.com/mopidy/mopidy) | — |
| **Mopidy-MusicBox-Webclient** | browser UI, cover art | via Mopidy | 398★, last push 2026-02-10, not archived — [repo](https://github.com/pimusicbox/mopidy-musicbox-webclient) | Screen |
| **Yoto Player** | card into slot + **twist-and-press knob**, 16×16 px display | Yoto cloud store + MYO cards | commercial, 4th gen current — [product](https://us.yotoplay.com/players/yoto-player-4) | **Screen (minimal)** |
| **Toniebox** | figurine on top; squeeze ears / tap / tilt | Tonies store + Creative-Tonies | commercial — [how it works](https://us.tonies.com/pages/tonieboxes) | Token |
| **TeddyCloud** | self-hosted Toniebox cloud replacement | your own files | ~1.0k★, v0.7.0 (2026-08-25) — active — [repo](https://github.com/toniebox-reverse-engineering/teddycloud) | Token |
| **OpenYoto** | independent Yoto Mini firmware | local | 1★, ~89 commits, no release — hobby-stage — [repo](https://github.com/tensorfish/open-yoto) | Token |
| **Hörbert** | 9 large coloured buttons, **no display at all** | local SD (WAV/MP3/M4A) | commercial, from €269 — [site](https://en.hoerbert.com/) | Other |
| **Jooki** | physical tokens | vendor cloud | **company dead** — [warranty page](https://jooki.com/pages/warranty-us) | Token (defunct) |
| **Sonos-Kids-Controller** | touchscreen jukebox, TTS for non-readers | Spotify/Apple/Amazon/local via node-sonos-http-api | 163★ but **archived**, last commit ~2025-12-01 — [repo](https://github.com/Thyraz/Sonos-Kids-Controller) | Screen |
| **This project** | touch, full cover art | Navidrome/MA → Sonos | — | **Screen with cover art** |

### 1.2 What each one actually teaches

**Phoniebox** is the most important precedent because it already does the hybrid: the RFID card is the *trigger*, but a web app with cover art is the *browsing and admin layer*. Its v3 rewrite is explicitly in transition — the wiki says version 3 "is becoming mature and will soon be the new default" while v2 is maintenance-only ([wiki](https://github.com/MiczFlor/RPi-Jukebox-RFID/wiki)). Lesson: decoupling trigger from UI is proven at scale.

**Pi MusicBox is the cautionary tale about turnkey images.** It is archived with a maintainer banner saying it is no longer maintained, and its old domain now redirects to a squatted site — while the modular engine underneath it (Mopidy) is still shipping commits in September 2026. Build on a maintained *library/server*, never on someone's all-in-one SD image.

**Jooki is the cautionary tale about clouds.** Muuselabs went bankrupt and shut down the servers, bricking cloud-dependent devices ([Hackaday, 2025-03-30](https://hackaday.com/2025/03/30/can-hackers-bring-jooki-back-to-life/)). A community rescue exists — [OpenJooki](https://github.com/Guillain-RDCDE/OpenJooki), an A/B-partition installer designed to be unbrickable — but it is early-stage. This is the single strongest argument for the local-first spine in §0.

**Hörbert is the cautionary tale in the opposite direction** — the simplest possible architecture. No display, no app, no cloud: nine coloured buttons, each mapped to an SD-card folder. Its own homepage describes a "simple control concept without a display", and it is sold as a repairable DIY kit. Lesson: the thing that never breaks is the thing with no network dependency.

**Jukebox4Kids**, though dead since 2015, contributes one useful data point: the author pivoted barcodes → RFID for recognition reliability, and Raspberry Pi → STM32 to cut boot time from ~30s to ~4s ([project thread](https://forum-raspberrypi.de/forum/thread/13144-projekt-jukebox4kids-jukebox-fuer-kinder/)). **Time-to-music matters enormously for a 4-year-old.** Your kiosk should already be showing covers when the child walks up — never booting, never a splash screen.

**Sonos-Kids-Controller is the closest existing template to this exact project** and it is archived. There is no live, maintained "kid picks a cover, it plays on Sonos" project to fork. You are building something genuinely novel, but you also have no upstream to lean on.

### 1.3 Screen vs. physical token — what's evidence and what's marketing

This is the part of the brief that deserves the most care, because the answer is not what the market implies.

**The marketing claim.** Tonies brands itself the "#1 Screen-Free Audio Player For Kids" and states that screen-free play "stimulates imagination … in ways screens simply can't" ([about us](https://tonies.com/en-eu/about-us/)). Its how-it-works page says "no screens or menus in sight" and "with no screens or ads, their kids can safely and independently play" ([source](https://us.tonies.com/pages/tonieboxes)). **No citations are given for any of it.**

**The founder rationale is a parenting preference, not a study.** Tonies co-founder Patric Faßbender: *"I didn't want to give them the smartphone in their hands the whole day"* ([Romper](https://www.romper.com/life/toniebox-screenfree-toy-creation-inspiration-interview-founders)). Yoto's founders describe "nagging concerns" about sleep and motor development while calling themselves "technophiles" ([Ember Startups](https://emberstartups.com/profiles-and-tools/yoto-founders-ben-drury-and-filip-denker-are-saving-kids-from-screen-overload/)).

**Yoto's own product quietly contradicts the category's marketing.** Yoto's homepage title is "The Screen-Free Audio Platform for Children" — and on the same site: *"The display brings a visual dimension to Yoto's audio-first experience. **Title artwork helps kids browse and choose what they want to listen to** using the Green Button"*, which you operate by "twist to browse and press to play" ([us.yotoplay.com](https://us.yotoplay.com/), [Player 4](https://us.yotoplay.com/players/yoto-player-4)). The display is deliberately crippled to 16×16 pixels — Yoto's developer docs require an `icon16x16` key per chapter ([yoto.dev](https://yoto.dev/icons/using-icons/)).

So the market leader in "screen-free" audio **already ships browse-artwork-and-choose as its core interaction.** It just renders the artwork at 16×16 so it cannot become video. That is a design constraint, not a prohibition on visual browsing — and it is strong validation of your concept.

**The actual research is thin and does not support tangible superiority.** Xie, Antle & Motamedi (TEI '08, n=132, ages 7–9) found enjoyment was *statistically similar* across physical, graphical and tangible interfaces ([ACM DL](https://dl.acm.org/doi/10.1145/1056808.1057095)). Antle's own later work is framed around *knowledge gaps* in tangible-interface research ([ACM DL](https://dl.acm.org/doi/pdf/10.1145/2388676.2388726)) — the field admits its evidence base is weak. **No controlled study was found comparing screen-based cover-art browsing against physical-token selection for ages 2–6.** That is a genuine evidence gap, not a settled finding in either direction.

Nielsen Norman Group has substantial children's-UX guidance (see §5) but **nothing comparing tangible vs. screen interfaces** for this age group ([young users hub](https://www.nngroup.com/topic/young-users/)).

**Health guidance is about content and quantity, not modality.** The AAP's February 2026 update retired the flat two-hour cap in favour of a "5 C's" framework (Child, Content, Calm, Crowding Out, Communication), keeping ≤1 hr/day of high-quality, ideally co-viewed media for ages 2–5 ([HealthyChildren.org](https://www.healthychildren.org/English/family-life/Media/Pages/kids-and-screen-time-how-to-use-the-5-cs-of-media-guidance.aspx)). WHO's 2019 guidance is stricter and undifferentiated: ≤1 hr/day sedentary screen time for ages 2–4, with no carve-out for interactive use ([WHO](https://www.who.int/publications/i/item/9789241550536)).

**Honest bottom line.** The "screen-free is better" claim from the two dominant products is marketing and founder opinion, not evidence they cite. The one directly relevant controlled study found parity. But note the asymmetry: a token system *cannot* become a video player, whereas a screen *can*. The real risk of your design is not the pixels — it is **scope creep and dwell**. Mitigate it in the design (§5), not by abandoning cover art.

**UNVERIFIED:** Parent-community sentiment (Reddit and similar) could not be fetched directly — those sources blocked automated access. Community themes reported here are secondhand via review blogs and should be treated as anecdote.

---

## 2. Cover-art browsing UIs as prior art

### 2.1 Cover Flow: the thing you are recreating, and why Apple killed it

Cover Flow was conceived by Andrew Coulter Enright and implemented as a standalone Mac app by Jonathan del Strother at Steel Skies; Apple acquired it in 2006 ([AppleInsider, 2006](https://appleinsider.com/articles/06/09/13/notes_apple_renames_itunes_store_acquires_cover_flow)). Apple's own iTunes 7 press release describes it as letting users "quickly find titles in their library and **casually browse through and re-discover titles they already own**" ([Apple Newsroom, 2006-09-12](https://www.apple.com/newsroom/2006/09/12Apple-Announces-iTunes-7-with-Amazing-New-Features/)). That sentence is, almost exactly, this project's brief.

Removal timeline: dropped from iTunes in version 11 (2012); replaced in iOS 7 (2013) by a tiled "Album Wall" grid; fully gone by iOS 8.4 (2015); Finder's Cover Flow replaced by Gallery View in macOS Mojave (2018) ([Wikipedia: Cover Flow](https://en.wikipedia.org/wiki/Cover_Flow), corroborated at [512pixels](https://512pixels.net/2023/10/the-history-of-cover-flow/)).

The standard critique is that it "prioritizes form over function … slowing down the search process in large collections" and "consumed a significant amount of screen real estate without adding functional value" ([source](https://alextheactualizer.com/ux-ui-blog-posts/the-rise-and-fall-of-cover-flow-a-design-perspective)).

**This critique does not apply to you.** Cover Flow failed at scale — thousands of albums, one at a time, for an adult who knows what they want and would rather type. Your user cannot type, cannot read, and should have a *deliberately small curated library*. Cover Flow's weakness is precisely neutralised by your constraints. Note though that Apple's replacement in every case was a **grid**, not a list — grids won on density.

### 2.2 The other reference points

- **Plexamp** — no coverflow mode; its distinctive contribution is ambient colour extracted from album art. Plex Labs writeups: [Plexamp v3](https://medium.com/plexlabs/plexamp-v3-9af3b10063b4), [Plex Pro Week '24](https://www.plex.tv/blog/plex-pro-week-24-my-plexamp-music-journey/). Closed source. **UNVERIFIED:** the specific "smoked glass" design quote could not be fetched directly (Medium returns 403 to automated fetch).
- **Roon** — nothing official worth citing; its KB pages on artwork are stubs ([example](https://kb.roonlabs.com/FAQ:_How_do_I_change_the_cover_art_of_an_album)). The interesting prior art is community-built: [arthursoares/roon-now-playing](https://github.com/arthursoares/roon-now-playing) (Vue 3 + TS, includes an album-gallery mosaic layout, MIT) and an ["Album Wall" community project](https://community.roonlabs.com/t/album-wall-try-it-yourself/323169).
- **Sonos app, 2024** — the cautionary tale, and directly relevant since you are building on Sonos. The May 2024 rewrite shipped without sleep timers, local-library management, queue editing and screen-reader support. CEO Patrick Spence apologised publicly on 2024-07-25: *"I want to begin by personally apologizing for disappointing you"* ([Sonos Community](https://en.community.sonos.com/product-updates/update-on-the-sonos-app-from-patrick-spence-6900501)). By 2024-10-28 Sonos reported >80% of missing features restored ([update](https://en.community.sonos.com/product-updates/update-on-the-new-sonos-app-and-future-features-october-28-2024-6920397/index4.html)), and published seven new quality commitments ([investor news](https://investors.sonos.com/news-and-events/investor-news/latest-news/2024/Sonos-Announces-New-Quality-and-Customer-Experience-Commitments/default.aspx)). Lesson: a beautiful rewrite that regresses reliability is worse than an ugly thing that works. For a 4-year-old, *reliability is the feature*.
- **Bandcamp** — flat large-tile grid, minimal chrome. **UNVERIFIED:** no primary Bandcamp design writeup exists; only third-party critiques. Low value as prior art.
- **TouchTunes Virtuo** — the most transferable idea in this whole section. Its design agency describes a 26" touchscreen explicitly built to avoid "frustrating the users with infinite lists and alphanumeric scrolling", using a "game-like interface" instead ([frog case study](https://www.frog.co/work/reinventing-the-touchtunes-digital-jukebox-for-next-gen-in-venue-entertainment)). Bar patrons and pre-readers share a constraint: **they will not type.** Make browsing itself the interaction.

### 2.3 Reusable components — the honest answer

There is **no mature, maintained, purpose-built album-coverflow web component** to install in 2026.

| Library | Status (verified 2026-09-18) | Verdict |
|---|---|---|
| **Swiper** | v14.2.0, published 2026-08-26, 41.9k★ — [swiperjs.com](https://swiperjs.com/), [npm](https://registry.npmjs.org/swiper) | **Only maintained option with a built-in coverflow effect** ([effect-coverflow docs](https://swiperjs.com/types/modules/types_modules_effect-coverflow-1)) |
| **Embla Carousel** | v8.6.0, published 2025-04-04 — [embla-carousel.com](https://www.embla-carousel.com/) | Good physics, dependency-free, **no 3D coverflow** — you'd write the transforms |
| **keen-slider** | v6.8.6, last published **2023-07-05** | Stalled; coverflow is an open unresolved request ([#79](https://github.com/rcbyr/keen-slider/issues/79)). Avoid |
| **coverflowjs/coverflow** | **archived 2021-01-02**, jQuery-era — [repo](https://github.com/coverflowjs/coverflow) | Dead |
| **dsheeler/CoverflowAltTab** | 422★, updated 2026-09-18 — [repo](https://github.com/dsheeler/CoverflowAltTab) | Proves the pattern is alive in 2026, but it's a GNOME Shell window-switcher — not reusable web code |

GitHub searches for "coverflow" / "album wall" surface mostly zero-star, days-old, likely AI-generated scaffolds (e.g. `antter-ui/Radio-ishq`, `girishlade111/3d-coverflow-carousel-component`). Useful as inspiration, **not as dependencies**. No Jellyfin or Plex coverflow plugin exists.

**The CSS-native route.** Because you control the browser exactly (one Chromium, one machine), scroll-driven animations are available to you even though MDN correctly flags them as "**Limited availability — not Baseline**" for the general web ([MDN: animation-timeline](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline), [MDN guide](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations)). Chromium has shipped `animation-timeline: view()` since Chrome 115 ([Chrome for Developers](https://developer.chrome.com/blog/scroll-triggered-animations)). Baseline status is a cross-browser concern and is **irrelevant to a single-target kiosk**.

**Recommendation:** build the grid with CSS `scroll-snap` and, if you want the 3D crate-flip flourish, `animation-timeline: view()` — zero dependencies, GPU-composited. Keep Swiper's `effect-coverflow` as the fallback if hand-rolled gesture handling disappoints on real hardware.

---

## 3. Linux kiosk lockdown on a laptop with a touchscreen

### 3.1 Distro

**Recommendation: Debian 13 "Trixie" netinst, minimal install, no desktop environment** ([debian.org/CD/netinst](https://www.debian.org/CD/netinst/)). It is the only option in this list with an unambiguous, currently-live, well-documented minimal path for old x86_64 hardware, and it lets you hand-assemble exactly the stack below.

The alternatives, with honest status:

- **Ubuntu Core + Ubuntu Frame** — the old kiosk docs URL 404s and Ubuntu Core 26 is current ([docs index](https://documentation.ubuntu.com/core/)). **Important:** if you go this route, the current component is **Ubuntu Frame**, not the old `mir-kiosk` snap — Canonical states Ubuntu Frame "replaces mir-kiosk… new features will only be added to Ubuntu Frame, while mir-kiosk will remain maintained until decommission" ([snapcraft.io/mir-kiosk](https://snapcraft.io/mir-kiosk)). Ubuntu Frame is stable v24, last updated 2026-04-27, explicitly targeting "kiosks, digital signage, IoT, and robotics" ([snapcraft.io/ubuntu-frame](https://snapcraft.io/ubuntu-frame)). Every mir-kiosk tutorial you find is stale. Strict snap confinement remains a poor fit for hand-tuning an old laptop.
- **Fedora IoT** — active edition ([fedoraproject.org/iot](https://fedoraproject.org/iot/)), but no kiosk-specific docs found, and its ostree image model is rigid for a one-off build.
- **Alpine** — **UNVERIFIED**: `wiki.alpinelinux.org/wiki/Kiosk` returned HTTP 403 to automated fetch. musl-libc can cause friction with prebuilt binary blobs.
- **DietPi** — genuinely supports x86: it ships "Native PC for BIOS/CSM" and "Native PC for UEFI" images ([dietpi.com/docs/hardware](https://dietpi.com/docs/hardware/)). A reasonable shortcut if you want its software installer, but you give up some control.

### 3.2 Kiosk session — use cage

**Recommendation: `cage` + `greetd`.**

[cage](https://github.com/cage-kiosk/cage) is a Wayland kiosk compositor whose entire purpose is "a kiosk runs a single, maximized application." 2.1k★, **v0.3 released April 2026** ([Phoronix](https://www.phoronix.com/news/Cage-0.3-Released)), based on wlroots 0.20. Invocation is simply `cage <command>`.

Two properties make it the right choice, both verified from the man page ([cage(1)](https://man.archlinux.org/man/cage.1)):

1. **VT switching is disabled by default.** The man page documents `-s` as "Allow VT switching" — an *opt-in*. Omit it and Ctrl+Alt+F* does nothing. This is the single biggest lockdown win and you get it for free.
2. **There are essentially no keybindings to strip.** Alt+Esc quits, but only in debug builds; a release build has no escape chord at all.

Alternatives, ranked:

2. **labwc** ([repo](https://github.com/labwc/labwc)) — v0.9.4 (2026-02-27), 2.8k★, wlroots-based, Openbox-3.6-compatible `rc.xml`. Pick this if you may later want a second pinned app. **Note a trap:** leaving the `<keyboard>` section empty does *not* disable labwc's built-in defaults — you must explicitly override each one, e.g. `<keybind key="W-Return"><action name="None"/></keybind>`, repeated per default binding ([docs/rc.xml](https://github.com/labwc/labwc/blob/master/docs/rc.xml), [docs/rc.xml.all](https://github.com/labwc/labwc/blob/master/docs/rc.xml.all)).
3. **weston kiosk-shell** — set `shell=kiosk-shell.so` in `weston.ini` or `--shell=kiosk-shell.so` ([kiosk-shell docs](https://wayland.pages.freedesktop.org/weston/toc/kiosk-shell.html)). Weston's `[shell] binding-modifier=` accepts `none | ctrl | alt | super` ([weston.ini(5)](https://man.archlinux.org/man/weston.ini.5)), so `binding-modifier=none` neuters the standard bindings. Solid but more configuration surface than cage for a single app.
4. **Openbox + Chromium (X11)** — **Openbox is effectively frozen**: stable 3.6.1 dates from July 2015. Still packaged and functional; pick it only if a legacy touchscreen driver forces X11.
5. **GNOME Kiosk** ([gitlab](https://gitlab.gnome.org/GNOME/gnome-kiosk)) — mutter-based, actively maintained on GNOME's cadence (NEWS shows 51.0). Well-resourced but the heaviest dependency chain here; overkill on an old low-RAM laptop.

**Autologin with greetd.** Verified from [greetd(5)](https://man.archlinux.org/man/greetd.5): `[initial_session]` runs exactly once per boot — true autologin, distinct from `[default_session]`.

```toml
# /etc/greetd/config.toml
[terminal]
vt = 1

[default_session]
command = "agreety -c cage"
user = "greeter"

[initial_session]
command = "cage -- chromium --kiosk --user-data-dir=/home/kiosk/.chromium-profile https://kiosk.lan"
user = "kiosk"
```

LightDM autologin (`autologin-user=` / `autologin-session=` in `[Seat:*]`) and a systemd getty drop-in overriding `ExecStart` with `agetty --autologin` both work too, but greetd is the cleanest fit for a Wayland single-app session.

### 3.3 Chromium flags that actually matter

The authoritative list is Peter Beverloo's generated reference, confirmed live and current — its banner read "1,567 switches and 4,754 feature flags as of September 18, 2026" ([peter.sh](https://peter.sh/experiments/chromium-command-line-switches/)). The page is too large for automated extraction, so only `--app` could be quoted directly: *"Specifies that the associated value should be launched in 'application' mode."* **UNVERIFIED by direct quotation this session:** the exact current help text of the remaining switches below. Ctrl+F that page before finalising your launch line.

Flags worth passing:

```
chromium \
  --kiosk \
  --user-data-dir=/home/kiosk/.chromium-profile \
  --app=https://kiosk.lan \
  --noerrdialogs \
  --disable-pinch \
  --disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation,TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  --start-fullscreen
```

**Three corrections to the folklore doing the rounds in kiosk tutorials.** These were checked against Chromium's own source-derived switch data:

- **`--disable-infobars` is gone from the source entirely** — not merely deprecated. Google removed support around Chrome 65 (2018) specifically so it could not hide the "controlled by automated test software" infobar ([crbug 826578](https://bugs.chromium.org/p/chromium/issues/detail?id=826578), [issues.chromium.org/41379384](https://issues.chromium.org/issues/41379384)). Tutorials still pass it out of habit. It does nothing.
- **`--overscroll-history-navigation=0` no longer exists as a switch.** Overscroll navigation is now gated by feature flags, both default-on. The current, correct invocation is `--disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation`. Every guide citing the old switch is stale.
- **No flag reliably kills the "Restore pages?" bubble on Linux.** `--disable-session-crashed-bubble` has also been **removed from source**; `--hide-crash-restore-bubble` still exists but is **ChromeOS-scoped** (its source comment ties it to the ChromeOS full-restore feature), so it is not a Linux-desktop fix ([CefSharp #4903](https://github.com/cefsharp/CefSharp/issues/4903) discusses the flag; the non-functioning behaviour of the older one is reported at the [RPi forum](https://forums.raspberrypi.com/viewtopic.php?t=203921)).

**The only reliable cross-platform fix is patching the profile before every launch** — via `ExecStartPre` or the launcher script — and then making the file read-only so Chromium cannot dirty it again:

```sh
P=/home/kiosk/.chromium-profile/Default/Preferences
chmod u+w "$P"
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "$P"
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/'   "$P"
chmod a-w "$P"
```

**`--incognito` is a trap for this project.** It destroys Service Worker and Cache API persistence between restarts, which is exactly the offline cover-art cache you want (§4.5). Use a dedicated persistent profile plus the sed patch above.

**One useful architectural note:** since audio plays on Sonos and not through the laptop, `--autoplay-policy` is mostly belt-and-braces. Include it anyway in case you ever add local UI sounds.

**Chrome enterprise policies** — drop JSON into `/etc/chromium/policies/managed/` (Chromium) or `/etc/opt/chrome/policies/managed/` (Chrome); Ubuntu's package uses `/etc/chromium-browser/policies` ([chromium.org Linux quick start](https://www.chromium.org/administrators/linux-quick-start/)). The two that matter:

```json
{
  "DeveloperToolsAvailability": 2,
  "URLBlocklist": ["*"],
  "URLAllowlist": ["kiosk.lan"]
}
```

`DeveloperToolsAvailability: 2` means, in Google's words, *"you can't access developer tools, and you can't inspect website elements. This setting also turns off keyboard shortcuts and menu or context menu entries to open developer tools"* ([policy docs](https://chromeenterprise.google/policies/developer-tools-availability/)); allowlist takes precedence over blocklist in `URLBlocklist`/`URLAllowlist` ([policy docs](https://chromeenterprise.google/policies/url-blocklist/)).

**Firefox alternative.** `firefox --kiosk 'https://example.com'` works, with `--kiosk-monitor <N>` for multi-display ([Mozilla support](https://support.mozilla.org/en-US/kb/firefox-enterprise-kiosk-mode)). Lockdown is via `policies.json` at `<install-dir>/distribution/policies.json` — `DisableDeveloperTools`, `BlockAboutConfig`, locked `Homepage`, `UserMessaging`, `DisableFirefoxStudies` ([Firefox admin docs](https://firefox-admin-docs.mozilla.org/reference/policies/)). There is **no single umbrella "Kiosk" policy**. Note Mozilla's own framing: kiosk mode targets environments where "keyboard access is restricted (particularly Ctrl and Alt)" — i.e. **the browser does not consider itself a jail.**

### 3.4 Actually preventing escape

Layer these; no single one is sufficient.

1. **Compositor**: use cage without `-s`. VT switching off, no keybindings. Done.
2. **X11 only** (if you go that route) — in `Section "ServerFlags"` of `xorg.conf`, verified from [xorg.conf(5)](https://man.archlinux.org/man/xorg.conf.5):
   - `Option "DontVTSwitch" "true"` — *"This disallows the use of the Ctrl+Alt+Fn sequence."* Default is **off**, so you must set it.
   - `Option "DontZap" "true"` — disallows the Terminate_Server action (Ctrl+Alt+Backspace). Default off.
   - `Option "DontZoom" "true"` — disallows Ctrl+Alt+Keypad-Plus/Minus mode switching.
3. **Kill the spare VTs** — in `/etc/systemd/logind.conf`, verified from [logind.conf(5)](https://man.archlinux.org/man/logind.conf.5): `NAutoVTs=0` (default 6; "when set to 0, automatic spawning is disabled") and `ReserveVT=0` (default 6; 0 disables reservation). **Nuance:** on Wayland there is no direct equivalent of `DontVTSwitch` — VT switching is a kernel console feature the compositor does not own. Setting these means switching lands on nothing usable; combined with cage's default, it is adequate.
4. **Physically remove the keyboard and trackpad from the input stack.** This is the actual control, and it works for both X11 and Wayland because libinput backs both. Verified syntax from [libinput's ignoring-devices doc](https://wayland.freedesktop.org/libinput/doc/latest/device-configuration-via-udev.html) — *"If set to anything other than '0', the device is ignored by libinput"*:

```
# /etc/udev/rules.d/99-kiosk-disable-input.rules
ACTION!="remove", KERNEL=="event[0-9]*", \
  ENV{ID_VENDOR_ID}=="<kbd-vid>", ENV{ID_MODEL_ID}=="<kbd-pid>", \
  ENV{LIBINPUT_IGNORE_DEVICE}="1"
```

Leave the touchscreen untouched. For X11 ad-hoc testing, `xinput disable <device>` works ([xinput(1)](https://man.archlinux.org/man/xinput.1)).

5. **App side** — `touch-action: none` on the grid container disables browser-handled panning and zooming so your app owns the gesture ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)); add `user-select: none` and a `contextmenu` listener calling `preventDefault()`. MDN notes `touch-action: none` harms accessibility by blocking pinch-zoom — an acceptable trade for a single-purpose kids' kiosk.

**The honest summary:** browser kiosk flags are cosmetic. `LIBINPUT_IGNORE_DEVICE` on the keyboard is what actually stops a determined child (or a cat on the keys).

### 3.5 Laptop as appliance

Verified from [logind.conf(5)](https://man.archlinux.org/man/logind.conf.5):

```ini
# /etc/systemd/logind.conf
HandleLidSwitch=ignore            # default is "suspend"
HandleLidSwitchExternalPower=ignore
HandlePowerKey=ignore             # default is "poweroff"
IdleAction=ignore                 # already the default
NAutoVTs=0
ReserveVT=0
```

`HandleLidSwitch` accepts `ignore`, `poweroff`, `reboot`, `halt`, `kexec`, `suspend`, `hibernate`, `hybrid-sleep`, `suspend-then-hibernate`, `sleep`, `lock`, `factory-reset`, `secure-attention-key`. Note `HandleLidSwitchExternalPower` is "completely ignored by default (for backwards compatibility) — an explicit value must be set before it will be used", so set it explicitly. Belt and braces:

```
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

**Screen blanking.** On X11: `xset s off -dpms`, or set `BlankTime`/`StandbyTime`/`SuspendTime`/`OffTime` to `0` in `ServerFlags` ([xorg.conf(5)](https://man.archlinux.org/man/xorg.conf.5)). Add `consoleblank=0` to the kernel command line for the text console. Under Wayland, `wlr-randr` supports per-output `--on`/`--off` where the compositor implements `wlr-output-management-unstable-v1` ([wlr-randr(1)](https://manpages.debian.org/testing/wlr-randr/wlr-randr.1.en.html)), and there is a dedicated `wlr-dpms` tool ("xset dpms on|off for wlroots compositors", supporting `off|on|toggle|query`) at [sr.ht/~dsemy/wlr-dpms](https://sr.ht/~dsemy/wlr-dpms/). **UNVERIFIED:** whether cage itself implements the output-power protocol — cage is deliberately minimal and may not. With cage the simpler answer is to never let the system idle at all.

### 3.6 Watchdog

Verified from [systemd.service(5)](https://man.archlinux.org/man/systemd.service.5): `Restart=always` means *"the service will be restarted regardless of whether it exited cleanly or not, got terminated abnormally by a signal, or hit a timeout."* `RestartSec=` defaults to 100ms.

```ini
[Unit]
StartLimitIntervalSec=0          # never give up

[Service]
ExecStartPre=/usr/local/bin/clear-chromium-crash-flag.sh
ExecStart=/usr/bin/cage -- /usr/bin/chromium --kiosk ...
Restart=always
RestartSec=2
```

**This is the gotcha most kiosk guides get backwards.** Start rate-limiting is not opt-in extra safety — it is **on by default** (manager defaults are commonly 5 starts per 10 s), and once tripped systemd marks the unit **failed and stops retrying permanently** until someone manually resets it. For an appliance in a child's room that must never simply give up, set **`StartLimitIntervalSec=0`** to disable the limit outright rather than tuning it.

Pair that with an `OnFailure=` unit that wipes the profile directory and restarts, so a corrupted profile self-heals instead of crash-looping forever on the same bad state.

### 3.7 Parent's way back in

- **SSH over the LAN** is the primary hatch — it works even when the UI is wedged. Check `KillUserProcesses=no` in `logind.conf` if SSH and kiosk sessions will coexist.
- **Tailscale** for access from outside the house without any port-forwarding: it assigns a stable `100.x.y.z` address reachable "even behind a firewall" and offers Tailscale SSH ([install docs](https://tailscale.com/kb/1017/install)).
- **An in-app hidden gesture** (hold a corner for 5 s to reveal an admin overlay) is worth adding, but note it is *your* code — there is no documented browser or compositor feature to cite. **UNVERIFIED** as a named, standardised pattern.
- Do **not** rely on a hardware key combo: you just disabled the keyboard.

### 3.8 Turnkey options — none of them fit

| Option | Status (verified 2026-09-18) | Verdict |
|---|---|---|
| **Anthias** (ex-Screenly OSE) | 3.7k★, **actively maintained — v2026.08.2 released 2026-08-17**, roughly monthly cadence; supports Pi **and x86-64 PCs** — [repo](https://github.com/Screenly/Anthias) | Alive, but wrong shape: it is **digital signage** (scheduled playlists of images/URLs/video), built for passive display, not an interactive touch app |
| **Porteus Kiosk** | Site live; ">90% of packages" open source but booting, configuration, installation, remote management and updates are **proprietary/commercial** — [porteus-kiosk.org](https://porteus-kiosk.org/) | Not simply free; check licensing before committing. **UNVERIFIED:** current version/date (changelog 404'd) |
| **Ubuntu Core kiosk snap** | Tutorial URL 404s; `kiosk-browser` snap page 404s | **UNVERIFIED** / likely stale |
| **balena browser block** | Old `balena-io-experimental/balena-browser` path is **404 — the project moved** to [balenablocks/browser](https://github.com/balenablocks/browser), which is active (238 commits, has a CHANGELOG, supports `KIOSK` and `SHOW_CURSOR` env vars) | **Alive**, and the closest turnkey fit here — but it ties you to balenaOS/container tooling for what is a single-laptop build |
| **Fully Kiosk Browser** | "a secure and flexible **Android** Kiosk Browser and App Launcher", Android 6–16 — [fully-kiosk.com](https://www.fully-kiosk.com/en/) | **Android only. There is no Linux desktop equivalent.** Rules it out |
| **WebKiosk** | No canonical maintained project surfaced | **UNVERIFIED** |

**Conclusion: build it yourself.** The Debian + cage + greetd + Chromium + udev + systemd + Tailscale stack has a primary-source citation for every component, which is more than any turnkey option here can offer.

---

## 4. Frontend stack for a large touch cover-grid

### 4.1 Framework — vanilla + Vite, or Svelte 5

Current stable versions verified via npm: React 19.3.0, Svelte 5.x, Lit 3.3.3, Vite 8.3.0 ([vite.dev/releases](https://vite.dev/releases)). SolidJS 2.0 is **still at RC** (`2.0.0-rc.7`) — [releases](https://github.com/solidjs/solid/releases) — so Solid means 1.x if you want stability.

**A warning about benchmark numbers.** Every specific percentage comparison surfaced by search ("Svelte 30–40% faster TTI than React", "Solid 70% faster") came from SEO content-mill sites, not framework docs or official benchmarks. **Treat all of them as UNVERIFIED and do not repeat them.** The real benchmark ([js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)) is active through 2026 and documents its methodology — a weighted geometric mean of startup, script-bootup, main-thread cost, memory and byte weight since Chrome 118 — but its results table is client-rendered and could not be extracted programmatically. **UNVERIFIED:** the specific 2026 rankings.

Svelte's own team states the motivation for the Svelte 5 runes rewrite plainly: other frameworks "adopted fine-grained reactivity based on signals, leapfrogging Svelte's performance" ([svelte.dev](https://svelte.dev/blog/svelte-5-is-alive)).

**Recommendation.** This is one heavy scrolling view, not an app with complex state. What matters on a weak CPU is (a) JS parse/compile at boot and (b) not running a VDOM diff on scroll frames. So: **vanilla TypeScript + Vite** for the grid itself. If you want component ergonomics for the surrounding chrome, **Svelte 5** — compiler-based, no runtime VDOM. Avoid React here: reconciliation cost buys you nothing for a static-ish grid. Lit is fine if you specifically want Web Components.

### 4.2 Virtualization — you probably don't need it

For *hundreds* of covers, skip the virtualizer entirely and use CSS containment:

```css
.cover-cell {
  content-visibility: auto;
  contain-intrinsic-size: auto 300px;
}
```

`content-visibility: auto` enables layout/style/paint containment and skips rendering work for off-screen content while keeping it in the DOM and accessibility tree ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility)). web.dev's demo measures a **7× rendering performance boost on initial load** ([web.dev](https://web.dev/articles/content-visibility)), and it is now Baseline newly available ([web.dev](https://web.dev/blog/css-content-visibility-baseline)). `contain-intrinsic-size` reserves the space so scroll position doesn't jump as cells enter and leave the skipped state.

This is **zero extra JS to parse** — exactly right for the hardware.

If the library later grows past a couple of thousand covers, the escape hatches, both verified active:
- **virtua** — ~3KB, native **grid** support, release v0.50.3, commits within days ([repo](https://github.com/inokawa/virtua)). Smallest footprint.
- **TanStack Virtual** — `@tanstack/virtual-core` 3.17.8, headless, multi-framework ([docs](https://tanstack.com/virtual/latest)). Better docs and community.
- react-window / react-virtualized: react-virtualized is superseded — web.dev itself recommends react-window as the lighter alternative ([web.dev](https://web.dev/articles/virtualize-long-lists-react-window)). **UNVERIFIED:** react-window's exact maintenance status; its README carries no status notice.

### 4.3 Image decoding is the real bottleneck

This is where an old laptop will actually fall over.

- Decoded images cost roughly **4 bytes per pixel in memory** regardless of the compressed file size, and serving a 4000×3000 image into a 400×300 box moves ~100× more data than needed ([web.dev](https://web.dev/learn/performance/image-performance)). **Never CSS-downscale a full-size cover.** Multiply that waste by hundreds of tiles and you have your jank.
- `decoding="async"` means the next paint does not wait for the image to decode ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decoding)).
- `loading="lazy"` defers loading — and therefore decoding — until the image nears the viewport ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/loading)).
- `Image.decode()` returns a promise resolving once decode completes, so you can pre-decode off the render path and swap in without jank. MDN explicitly recommends this for "online photo albums" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode)) — precisely your case. Pre-decode the next row before it scrolls into view.

**Format.** Use **WebP** (or JPEG). Skip AVIF: **UNVERIFIED** — no primary Chrome/web.dev benchmark quantifying AVIF-vs-WebP decode cost on low-end CPUs could be found, though AVIF inherits AV1's block-partitioning complexity and Chrome decodes it in software via dav1d. The claim "AVIF decode is notoriously slow" is widely repeated in secondary sources but not stated by web.dev or the Chromium team. Given the uncertainty and that **your network is a LAN, so bytes are not the bottleneck**, there is no upside to AVIF here and a plausible downside.

Skip JPEG XL too: Chrome 145 (Feb 2026) restored JXL decode using a Rust `jxl-rs` decoder, but **behind the `enable-jxl-image-format` flag, not on by default** ([Phoronix](https://www.phoronix.com/news/Chrome-145-Released)).

### 4.4 Thumbnail pipeline — you already have one

The frontend research recommends pre-generating with [sharp](https://github.com/lovell/sharp) (libvips-backed, "typically 4x-5x faster than ImageMagick and GraphicsMagick") or running [imgproxy](https://github.com/imgproxy/imgproxy).

**But if you take the §0 spine, you don't need either.** Navidrome already serves `getCoverArt?id=…&size=N` with server-side resizing, a configurable `CoverArtQuality`, optional WebP output via `EnableWebPEncoding`, and caching ([OpenSubsonic getCoverArt](https://opensubsonic.netlify.app/docs/endpoints/getcoverart/), [Navidrome artwork docs](https://www.navidrome.org/docs/usage/library/artwork/)). Request exactly your tile size and be done. Music Assistant likewise exposes an image proxy derived from its websocket base URL ([MA frontend API client](https://github.com/music-assistant/frontend/blob/main/src/plugins/api/index.ts)).

Use `srcset` with **density descriptors** (`1x`/`2x`) rather than width descriptors, since your grid cells are fixed-size — MDN's recommended approach for fixed-size images ([MDN responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images)).

### 4.5 Offline caching

Service Worker + Cache API, cache-first for cover art ([MDN: Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [MDN PWA caching guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)).

**Workbox** is still Google-maintained — Chrome's Aurora team owns it, and `workbox-precaching` is at **7.4.1**, published mid-2026 ([repo](https://github.com/GoogleChrome/workbox)). Caveat worth knowing: `developer.chrome.com`'s "What is Workbox" page shows a stale 2021 last-updated date, so **check npm/GitHub releases rather than trusting the doc page's freshness**.

Call `navigator.storage.persist()` at first launch to reduce eviction risk; `navigator.storage.estimate()` reports `{usage, quota}` and requires a secure origin ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate), [MDN quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).

**The critical gotcha, repeated because it matters: in private/incognito browsing, storage is wiped when the session ends.** A kiosk running Chromium in Guest/Incognito loses its entire cover-art cache on every reboot. Use a dedicated persistent profile.

Note: a secure origin is required for Service Workers. `localhost` counts; a plain `http://kiosk.lan` does not. Either serve the app from localhost on the kiosk itself, or terminate TLS with a local certificate.

### 4.6 PWA vs `--app=` — just use the flag

Chromium's installability criteria (manifest with name/icons, secure origin, service worker with a fetch handler) apply on Linux ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Chrome for Developers](https://developer.chrome.com/blog/update-install-criteria)), and Chrome additionally gates the install prompt behind user-engagement heuristics.

For a machine you own, that is pointless ceremony. **Launch with `--kiosk --app=<url>` from systemd** — deterministic at every boot, no engagement timers. Ship the manifest anyway with `display: "fullscreen"` for correctness and the `display-mode` media query hook ([MDN manifest display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display)).

**UNVERIFIED:** Chromium's official kiosk documentation ([kiosk_public_session.md](https://chromium.googlesource.com/chromium/src/+/main/docs/enterprise/kiosk_public_session.md)) covers **ChromeOS managed kiosk sessions only** — generic Linux desktop `--kiosk`/`--app=` behaviour is not covered by any official doc.

### 4.7 Touch scroll — the weakest link, test it on hardware

**This is the one area where the primary sources do not give a clean 2026 answer, and you should budget hands-on time.**

What is solid: `overscroll-behavior` prevents scroll chaining and boundary effects ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior)), and `scroll-snap-type` + `scroll-snap-align` give a deterministic crate-flip feel ([MDN scroll snap](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap)). Both are standard in any current Chromium and are not Linux-specific risks.

What is not solid: Chromium's Ozone/Wayland touch support. Wayland has historically needed `--ozone-platform=wayland` or `--ozone-platform-hint=auto` to be enabled manually, and there are long-standing reports of touchscreens not being detected as pointer devices ([meta-browser #645](https://github.com/OSSystems/meta-browser/issues/645)). **UNVERIFIED:** the current (2026) status of these issues — the bug numbers found date from ~2015 and no dated primary statement ("Wayland touch is production-ready as of Chromium N") could be found either way.

**Practical guidance:**
- Do not bet the UX on native fling physics. Use `scroll-snap-type: y proximity` (proximity, not `mandatory` — mandatory can feel harsh and laggy on weak hardware with imprecise touch) plus `overscroll-behavior: contain` on the grid container. Snapping makes the interaction feel intentional and "clicky" rather than dependent on momentum quality.
- **There is real tension here** between §3's recommendation of cage (Wayland) and the touch maturity question. Resolve it empirically: test touch under cage first; if fling or touch detection is bad on your specific hardware, fall back to an X11 session (labwc→Openbox, or weston→X). Do this test **before** you build anything else — it determines the display stack.

### 4.8 Not Electron, not Tauri

**Electron** bundles its own full Chromium plus Node per app ([performance docs](https://www.electronjs.org/docs/latest/tutorial/performance)). On a 4GB machine that is pure duplication — you already need system Chromium for the kiosk shell.

**Tauri v2** is lighter in binary size but uses the OS webview, which on Linux means **WebKitGTK** — Tauri's own docs specify webkit2gtk 4.1 ([webview versions](https://v2.tauri.app/reference/webview-versions/)). That is a **different rendering and JS engine from Chromium**, so every finding in §4.2–4.7 — `content-visibility` behaviour, decode paths, scroll-snap quality, Cache API semantics, and especially Linux touch handling — would need re-verifying on a less-tested stack, for no benefit on a machine you own.

**Use plain Chromium in kiosk mode.**

---

## 5. Child-interaction design constraints for a 4-year-old

### 5.1 The numbers that matter

**Touch targets.** The authoritative figure for children is far larger than the accessibility minimums:

- **NN/g: "at least 2cm × 2cm touch targets for young children (4 times bigger than the 1cm × 1cm recommended target size for adult users)"** ([NN/g, Design for Kids Based on Their Stage of Physical Development](https://www.nngroup.com/articles/children-ux-physical-development/)). At a typical ~96 dpi laptop screen, 2 cm ≈ **76 CSS px**. Treat that as your floor for any control.
- WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA: *"The target size for pointer input is at least 24 by 24 CSS pixels"* ([W3C](https://www.w3.org/TR/WCAG22/#target-size-minimum)).
- WCAG 2.1 SC 2.5.5 Target Size (Enhanced), Level AAA: *"User interface components have a target size of at least 44 by 44 CSS pixels"* ([W3C](https://www.w3.org/TR/WCAG22/#target-size-enhanced)).

**Note the gap.** WCAG's AAA target is 44 px. NN/g's children's guidance is roughly 76 px — **nearly double the strictest WCAG level.** Design to NN/g, not to WCAG. Album covers rendered large are naturally compliant; the danger is the *controls* (play, volume, back), which is exactly where people shrink things.

- Google's Android accessibility guidance confirms the Material figure from a first-party source: *"Consider making touch targets at least 48x48dp… A touch target of 48x48dp results in a physical size of about 9mm, regardless of screen size"*, separated by "8dp of space or more", with a stated recommended range of **7–10 mm** for touchscreen objects ([Google](https://support.google.com/accessibility/android/answer/7101858?hl=en)).
- NN/g's *adult* baseline for comparison is 1 cm × 1 cm ([NN/g](https://www.nngroup.com/articles/touch-target-size/)).

**UNVERIFIED:** Apple HIG's 44×44 pt figure could not be confirmed by direct fetch (the page renders client-side). It is well known but is smaller than the children's guidance anyway, so it does not change the recommendation.

### 5.2 What a 4-year-old can and cannot do

From [NN/g's physical development research](https://www.nngroup.com/articles/children-ux-physical-development/), children under 5 have "limited motor abilities" with "very limited" fine motor skills and coordination:

- **Works:** tapping, swiping, dragging — because these "involve big movements of arms and hands, which are better developed during early childhood than fine motor skills."
- **Fails:** *precise* dragging. "Precise dragging of target through a tunnel or to a specific spot was hard for kids, because it required relatively high motor dexterity."
- **Avoid entirely:** anything needing "complex motor coordination such as two-handed use or quick manual actions in response to a visual stimulus." That rules out pinch-zoom, two-finger gestures, and anything timed.
- A **5 mm close button** was documented as frustrating young users.
- **How children actually tap matters as much as target size.** NN/g observed that kids "don't tap with a fingertip — they press with the full finger pad, often at an angle, and sometimes with multiple fingers landing at once. Accuracy is secondary to force and enthusiasm," which "leads to accidental taps." Their recommended remedy is **intentional "dead zones" along the edges of the screen — areas that do not trigger critical actions.**
- Children aged 3–5 "may be comfortable only with touchscreen interfaces"; trackpad competence typically arrives around 6.

**How unreliable is a 4-year-old's tap, in numbers?** A freely accessible pediatrics study measured this directly — Yadav, Chakraborty, Kaul et al., *"Ability of children to perform touchscreen gestures and follow prompting techniques when using mobile apps"*, **Clinical and Experimental Pediatrics** 2020;63(6):232–236 ([PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC7303424/)). For the 4–6 bracket:

| Action | Success rate, ages 4–6 |
|---|---|
| Tap an intended place | **57%** |
| Tap a moving object | 37% |
| Tap and hold | **20%** |
| Tap and slide | 57% |
| Follow animated instructions | 63% |

(For ages 2–3, only 27% could tap an intended location at all.)

**Read that first row again: even on a static, intended target, a 4-year-old succeeds barely more than half the time.** That is the strongest possible argument for oversized targets and forgiving layout — and it rules out tap-and-hold (20%) as a primary action entirely.

Corroborating academic work (Anthony, Brown, Tate et al., *Personal and Ubiquitous Computing*, [Springer](https://link.springer.com/article/10.1007/s00779-013-0749-9)) finds from a corpus of 10,000+ touch interactions that children "have more trouble successfully acquiring onscreen targets and having their gestures recognized than do adults, especially the youngest age group." **UNVERIFIED:** that paper is paywalled; only the abstract was readable. Vatavu & Cramariuc's study covering ages 3–6 specifically ([ACM DL](https://dl.acm.org/doi/10.1016/j.ijhcs.2014.10.007)) was also paywalled.

From [NN/g's cognitive research](https://www.nngroup.com/articles/kids-cognition/) and [Children's UX: Usability Issues](https://www.nngroup.com/articles/childrens-websites-usability-issues/):

- **The youngest children do not read at all.** Suggested font sizes when text is present: "14 point (young children), 12 point (older children)."
- **Icons work better than you'd expect**: "3-year-olds easily recognized the main functions within video players: play, pause, volume controls, and the full-screen icon." **This is a significant finding for you** — you do not need to invent novel iconography; the standard transport icons are already legible to this age group.
- **Avoid requiring scrolling for under-6s**; 6+ tolerate it.
- **Skeuomorphism helps.** A 3-year-old navigated tasks successfully via "skeuomorphic design elements such as household foods, tools, and gestures" — young children lean on real-world knowledge to compensate for limited abstract reasoning. **Your crate-of-records metaphor is well-founded by this.**
- **Undo/redo is not a concept they have.** Children "naturally prefer familiar tools (like erasers) over abstract interface conventions." Do not rely on undo as a safety net.
- **Animation and sound are liked** by children, unlike adults.
- Children "mine-sweep the screen" — tapping everything exploratorily. Treat this as expected behaviour, not misuse.

Nielsen's classic heuristics reinforce the conclusion, and are still current (reviewed 2024-01-30): Heuristic #5 says "the best designs carefully prevent problems from occurring in the first place… eliminate error-prone conditions" ([NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)); NN/g's guidance on confirmation dialogs restricts them to actions "with serious consequences… that cannot be undone" ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)). **Note the trap: a confirmation dialog is worthless here, because your user cannot read it.** For a pre-reader, forgiving layout is the defense — not a dialog, and not undo.
- NN/g is explicit that there is no single "designing for children": you must distinguish **3–5, 6–8, and 9–12**. Design for 3–5 and do not let older-sibling requirements creep in.

### 5.3 Design rules that follow

1. **No text anywhere on the child-facing surface.** Cover art and standard transport icons only. Album identity *is* the cover.
2. **Minimum 76 px (2 cm) for every control**; covers themselves much larger. Add **dead zones along the screen edges** where no critical action fires — children press with the whole finger pad, at an angle, often with several fingers landing at once.
3. **Tap and swipe only.** No pinch (`touch-action: none`), no precise drag, nothing timed — and **no long-press for anything the child needs**, since tap-and-hold succeeds only ~20% of the time at this age. (Long-press is fine for the *parent's* hidden admin gesture — its unreliability for a 4-year-old is a feature there.)
4. **No destructive actions exist.** There is no delete, no settings, no queue editing. The only verbs are browse, play/pause, and volume. If an action cannot be undone, it must not be reachable — since undo is not a concept a 4-year-old holds.
5. **Everything is reversible by tapping something else.** Tapping a different cover just plays that album.
6. **Volume as discrete steps, not a slider.** A slider demands precise dragging — the exact thing the research says fails. Use two large `+`/`−` buttons with a coarse step and a hard ceiling (§5.4).
7. **No boot, no loading, no empty states.** Instant time-to-music; recall the Jukebox4Kids 30s→4s lesson. Cache covers offline (§4.5) so the grid renders before the network settles.
8. **Give feedback in sound and motion**, not text — children like both, and they are the only channel a pre-reader reads.
9. **Session limits:** if you add one, make it ambient (the screen dims, music fades) rather than a modal the child cannot dismiss. **UNVERIFIED:** no published guidance addresses time limits for audio-first devices with an incidental screen.

### 5.4 Volume and hearing safety — the one genuinely safety-critical part

**The numbers, verified.** The WHO-ITU global standard for safe listening devices and systems defines a sound allowance of:

- **80 dB for 40 hours per week for adults**
- **75 dB for 40 hours per week for children**

([WHO publication](https://www.who.int/publications/i/item/9789241515276); the standard is implemented through a dosimetry function tracking exposure as a percentage of the allowance.) The corresponding ITU recommendation is **ITU-T H.870, "Guidelines for safe listening devices/systems", edition 03/2022, in force** ([ITU](https://www.itu.int/rec/T-REC-H.870/en)). WHO's Make Listening Safe initiative lists it alongside the 2022 venues standard and the 2025 video-gameplay/esports standard ([WHO](https://www.who.int/activities/making-listening-safe)).

H.870 also recommends that devices offer **password-protected parental volume limits for children**, alongside automatic dose tracking and automatic volume reduction.

**The EU dose figures, verified from the legal instrument** (the EN 50332 standard text itself is CENELEC-paywalled, but the Commission Decision that mandated it is public). Commission Decision 2009/490/EC, Article 3(2)(1): *"At 80 dB(A) exposure time shall be limited to 40 hours/week, whereas at 89 dB(A) exposure time shall be limited to 5 hours/week"*, with linear interpolation between ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009D0490)).

**UNVERIFIED — and worth flagging because it is widely repeated:** the familiar "85 dB default / 100 dB override" framing for EU headphones could **not** be confirmed from any primary source. The verified EU dose pair is 80 dB(A)/40 h ↔ 89 dB(A)/5 h. Do not cite the 85/100 numbers.

The EU Toy Safety Directive 2009/48/EC, Recital 27, requires "more stringent and comprehensive standards to limit the maximum values for both impulse noise and continuous noise emitted by toys" ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0048)); the numeric limits live in EN 71-1. **UNVERIFIED:** EN 71-1's specific dB figures — paywalled, could not be read. Confirmed only that binding numeric limits exist.

Note also that EN 50332 governs *headphone* output, which does not apply to a room speaker.

**What the commercial products do.** Yoto states its player is "set by default to ensure safe listening volumes when used with wired or Bluetooth headphones" and advises parents to "aim for 60% of a device's maximum volume level for everyday use" — **but publishes no dB figure** ([Yoto Player 4](https://us.yotoplay.com/players/yoto-player-4)). Tonies offers app-side limits: "In-app volume controls let parents set volume limits right from the app" ([Tonies](https://us.tonies.com/pages/tonieboxes)). Hörbert says its "volume limit reliably protects sensitive children's ears from excessively high volume levels" ([Hörbert](https://en.hoerbert.com/musicbox-your-hoerbert/)). **None of the three vendors publishes a maximum SPL figure.** Yoto's safety page lists EN71/ASTM/ISO compliance and no dB spec ([Yoto](https://eu.yotoplay.com/legal/safety-standards)). That silence is itself informative: if the category leaders will not commit to a number, do not assume their defaults are protective.

**What this means for a Sonos system — and this is the important caveat.** All the WHO/ITU numbers above are about *personal listening devices*, i.e. headphones, where output maps predictably to exposure. **A Sonos speaker in a room has no such mapping**: the SPL at the child's ear depends on distance, room acoustics and the speaker model. You cannot derive a safe volume percentage from the WHO figures.

Practical levers, in order of reliability:

1. **Set a per-product Volume Limit in the Sonos app** — Settings → Your System → *product* → Sound → Volume Limit, on a 0–100 scale ([Sonos support](https://support.sonos.com/en-us/article/setting-a-volume-limit-on-sonos-products)). **Read the caveat carefully: this is proportional, not an SPL cap.** Setting 50% means the slider's far right now outputs what 50% used to. It guarantees no dB figure.
2. **Cap volume in your own app too**, independently — never expose the full 0–100 range to the child. Belt and braces, because a Sonos app or firmware change could reset the speaker-side limit.
3. **Measure it once with an SPL meter** at the child's typical listening position, at your intended maximum, and set the cap from the measurement. Given that the vendor limit is proportional and the WHO figures are headphone-derived, **this is the only way to actually know.** A phone SPL app is imprecise but far better than guessing.
4. Keep the step size coarse so a child cannot creep the volume up unnoticed.

---

## 6. Recommendations

Opinionated, in build order.

### 6.1 Architecture

**Navidrome → Music Assistant → Sonos, with a static web app on the kiosk.**

- **Navidrome** holds the library and, crucially, gives you `getCoverArt?id=…&size=N` — a cached, server-side thumbnail pipeline you would otherwise have to build. Tag the library with **beets** + `fetchart`, backfilling covers from the **Cover Art Archive**.
- **Music Assistant** (v2.10.3) does local Sonos control and speaks Subsonic to Navidrome. Crib its websocket client from the Apache-2.0 Vue frontend's `src/plugins/api/index.ts`; API docs are served at `http://<ma>:8095/api-docs`. Accept that you are reading source rather than docs — the maintainers say so themselves.
- **Do not use the official Sonos Control API.** It is cloud-only, OAuth-gated, and can only play pre-registered Favorites. It would also force you to open WAN access on a device whose whole point is being locked down.
- If you prefer something smaller than Music Assistant, **SoCo** (v0.31.2, 2026-07-29) is the actively maintained low-level option. **Do not build on node-sonos-http-api** — last commit 2025-03-22, last tagged release 2017, 200 open issues.
- **The kiosk needs zero internet access.** Make the UniFi rule "allow to Navidrome/MA/Sonos on the LAN, deny WAN". That is a far stronger posture than allowlisting cloud domains.

### 6.2 The one thing to test before building anything

**Put Chromium on the actual laptop and drag your finger across a page of images.** Touch and fling quality under Linux Chromium is the least-documented part of this whole stack, and it determines whether you use Wayland (cage) or X11. Nothing else in the plan is worth writing until you know.

While you're there, confirm the laptop actually *has* a touchscreen — most old laptops don't.

### 6.3 Kiosk stack

Debian 13 netinst (minimal) → **greetd `[initial_session]`** → **cage** → **Chromium** with a persistent profile.

The four things that actually matter, in order:
1. **`LIBINPUT_IGNORE_DEVICE="1"` udev rule on the keyboard and trackpad.** This is the real lock. Browser flags are cosmetic.
2. **cage without `-s`** — VT switching off by default, no keybindings to strip.
3. **`HandleLidSwitch=ignore`, `NAutoVTs=0`, `ReserveVT=0`**, and mask the sleep targets.
4. **`Restart=always` with `StartLimitIntervalSec=0`** — start rate-limiting is on by default and will permanently give up after ~5 rapid restarts; disable it outright. Add an `OnFailure=` unit that wipes the profile so a bad profile self-heals.

Patch `exited_cleanly`/`exit_type` in the Chromium Preferences file on every launch and then make it read-only — the flags for this were removed from source and do not work. Use `--disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation`, not the long-dead `--overscroll-history-navigation=0`. Add Chrome policies `DeveloperToolsAvailability: 2` and `URLBlocklist: ["*"]` / `URLAllowlist: ["kiosk.lan"]`.

**SSH plus Tailscale is the parent's way in.** Add a hold-the-corner admin gesture in the app as a convenience, but never rely on it — and remember you disabled the keyboard, so there is no magic key combo.

Skip the turnkey options. Anthias is alive but is signage, not an interactive app shell; Porteus is partly commercial; Fully Kiosk is Android-only; the balena browser block is alive at its new home but drags in balenaOS container tooling for a single laptop.

### 6.4 Frontend

**Vanilla TypeScript + Vite.** Svelte 5 if you want components for the chrome.

- **No virtualization library.** `content-visibility: auto` + `contain-intrinsic-size` on grid cells, which web.dev measures at a 7× initial-render win. Add `virtua` only if you ever exceed a couple of thousand covers.
- **Request thumbnails at exactly the tile size from Navidrome.** Never CSS-downscale a full cover — at ~4 bytes per decoded pixel that is where an old laptop dies.
- WebP or JPEG. **Not AVIF, not JPEG XL.**
- `loading="lazy" decoding="async"` on every `<img>`; `Image.decode()` to pre-warm the next row.
- Workbox service worker, cache-first for art, `navigator.storage.persist()`. **Never incognito** — it wipes the cache every reboot. Remember Service Workers need a secure origin: serve from localhost or use a local TLS cert.
- `scroll-snap-type: y proximity` + `overscroll-behavior: contain` for the crate-flip feel, rather than trusting Linux fling physics.
- Chromium `--kiosk --app=`, not a PWA install, not Electron, not Tauri.

### 6.5 Interaction design

- **76 px (2 cm) minimum for every control.** Not 44 px — NN/g's children's guidance is roughly double WCAG's strictest level.
- **No text.** Covers plus standard transport icons, which 3-year-olds already recognise.
- **Tap and swipe only.** No pinch, no precise drag, nothing timed, no two-handed gestures, no long-press for child-facing actions (only ~20% success at this age). Add edge dead-zones.
- **Assume roughly half of taps miss.** Measured success on a static intended target for ages 4–6 is ~57%. Design so a missed tap is harmless and a retry is instant.
- **The only verbs are browse, play/pause, volume.** No delete, no settings, no queue. Undo is not a concept this user has, so nothing irreversible may be reachable.
- **Volume as two large buttons**, never a slider, with a hard ceiling.
- **Instant on.** No splash, no loading state, no empty state.
- Lean into the skeuomorphism — the record-crate metaphor is supported by the research, not just nostalgia.

### 6.6 Hearing safety — do this, don't skip it

Set the Sonos per-product **Volume Limit**, cap volume independently in your app, and then **measure the actual SPL at the child's listening position with a meter and set the cap from that number.**

The WHO/ITU figure for children is **75 dB over 40 hours a week**, but it is derived for headphones and does not translate to a room speaker. The Sonos limit is proportional, not an SPL cap. Neither Yoto nor Tonies publishes a maximum SPL. **Measurement is the only thing here that gives you a real answer.**

### 6.7 What you are signing up for

There is **no live project to fork.** Sonos-Kids-Controller was the closest template and it is archived. Phoniebox is the closest living relative but is RFID-first and not Sonos-oriented. You are building something new, and the two clearest lessons from the survey are the ones about longevity, not features:

- **Jooki** died because its core function depended on a vendor cloud. Keep everything local.
- **Pi MusicBox** died because it was one person's turnkey image. Build on maintained libraries — Mopidy outlived it by years.

And the strongest validation: **Yoto, the market leader in "screen-free" children's audio, already ships browse-artwork-and-choose as its primary interaction.** It just renders that artwork at 16×16 pixels so it can never become video. The "screen-free is better" claim is marketing, not evidence — the one relevant controlled study found parity. Your instinct is sound. The discipline you owe the design is not avoiding pixels; it is keeping the verb list to three.
