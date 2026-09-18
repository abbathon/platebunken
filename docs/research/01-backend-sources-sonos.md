# Backend + Sonos research — kiosk album-cover player for a 4-year-old

Research date: **2026-09-18**. Every claim below links to a primary source. Source
code claims were verified by cloning the repository at the commit noted per section,
not from memory. Anything I could not verify with a live fetch is marked **UNVERIFIED**.

Scenario constraints assumed throughout: old Linux laptop in the living room runs the
HTML UI; music comes from a Qobuz subscription and local NAS files; playback happens on
Sonos speakers, including one in the kid's room; Sonos has no line-in, so the laptop is
a *controller*, never an audio source.

---

## 1. Music Assistant as the backend

### 1.1 What it is and how it is deployed

Music Assistant (MA) is an OSS "music library manager" that merges streaming services,
local files, radio and podcasts into one library and plays them to network speakers.
The project describes five components: server/core, music providers, player providers,
metadata providers and plugins — see the project home page
(https://www.music-assistant.io/).

Deployment, per the official install docs (https://www.music-assistant.io/installation/):

- **Recommended:** run as a Home Assistant App/add-on on Home Assistant OS.
- **Supported alternative:** a single standalone Docker container,
  image `ghcr.io/music-assistant/server`, **`--network host` is mandatory** because MA
  relies on mDNS/UPnP for local player discovery. Web UI on TCP **8095**, stream server
  on TCP **8097**.
- The docs state support is limited to those two shapes: *"Everything else is
  unsupported"* — no Kubernetes, no orchestration stacks.

For this project that means: MA can run on the same old laptop as the kiosk UI, in
Docker with host networking, with no Home Assistant needed. It does **not** need HA.

### 1.2 The public API — yes, it is documented and first-class

Verified against `music-assistant/server` at commit `4bba1b3` (dev, 2026-09-18).

MA's webserver controller registers these routes
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/webserver/controller.py):

| Route | Method | Purpose |
|---|---|---|
| `/ws` | GET | WebSocket API (commands + server-pushed events) |
| `/api` | POST | JSON-RPC-style single-shot command API |
| `/info` | GET | unauthenticated server info |
| `/api-docs`, `/api-docs/commands`, `/api-docs/commands.json` | GET | generated command reference |
| `/api-docs/schemas`, `/api-docs/schemas.json` | GET | generated model schemas |
| `/api-docs/openapi.json`, `/api-docs/swagger` | GET | **OpenAPI spec + Swagger UI** |
| `/imageproxy/<image_id>` | GET | artwork proxy (registered dynamically) |
| `/auth/login`, `/auth/me`, `/auth/authorize`, `/auth/callback` | | auth |
| `/preview` | GET | short-lived audio preview stream |

The official API page (https://www.music-assistant.io/api/) confirms the documentation
is auto-generated and served by your own server at
`http://YOUR_MA_SERVER_IP:8095/api-docs`, that requests are JSON-RPC-style POSTs to
`/api`, and that you authenticate with `Authorization: Bearer <token>`.

**This is the single most important finding for the project:** MA ships a machine-readable
OpenAPI spec of its own command surface on the box you install. You do not have to
reverse-engineer the frontend.

### 1.3 Message shape

Both transports take the same `CommandMessage`: `{"command": "...", "message_id": "...",
"args": {...}}`. The server echoes `message_id` back so a client can match replies —
stated on https://www.music-assistant.io/api/ and implemented in
`_handle_jsonrpc_api_command`
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/webserver/controller.py).
The JSON-RPC handler is forgiving if `message_id` is missing.

On WebSocket the flow is (see
https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/webserver/websocket_client.py):

1. Server sends a `ServerInfoMessage` immediately on connect.
2. Client sends the special command `auth` with `{"token": "<long-lived token>"}`.
3. On success the server replies `{"authenticated": true, "user": {...}}` **and only
   then subscribes the connection to the event stream** (`_subscribe_to_events`).
4. Events arrive unsolicited as `MassEvent` objects (`{"event": ..., "object_id": ...,
   "data": ...}`); result messages carry `message_id`.

An async-generator handler is materialised into a list before being returned, so large
listings still come back as one response.

### 1.4 Authentication

- Long-lived tokens are created with the `auth/token/create` command, or in the UI under
  Settings → Profile (https://www.music-assistant.io/api/).
- **Gotcha:** the source sets `TOKEN_LONG_LIVED_EXPIRATION = 365` days, and the
  docstring on `create_long_lived_token` says long-lived tokens *"expire after 1 year and
  do NOT auto-renew on use"*
  (https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/webserver/auth.py).
  The in-repo webserver README claims ten years
  (https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/webserver/README.md);
  **the code is authoritative and the README is stale.** Plan on rotating the kiosk's
  token once a year, or the player dies silently on a random Tuesday.
- Commands are scope-gated. Browsing/reading needs `Scope.LIBRARY_READ`; queue control
  needs `Scope.QUEUES_CONTROL`; writes need `LIBRARY_WRITE`/`LIBRARY_MANAGE`. Builtin
  roles are Admin / User / Guest / Service, and **Guest is a read-only library role** —
  relevant below.
- Guest accounts cannot hold long-lived tokens (explicit check in
  `create_long_lived_token`), so a kiosk that must survive reboots needs a non-guest
  user. Make it a dedicated low-privilege user rather than Admin.

### 1.5 The commands that matter for this app

Extracted from `@api_command(...)` decorators and `register_api_command(...)` calls in
the cloned tree. Per-media-type commands are registered dynamically in
`MediaControllerBase.__init__`
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/music/media/base.py),
so they do not appear as literal strings anywhere — worth knowing before you grep.

**Browsing / library** (all `LIBRARY_READ`):

- `music/albums/library_items`, `music/artists/library_items`, `music/tracks/library_items`,
  `music/playlists/library_items`, `music/radios/library_items`, `music/podcasts/library_items`,
  `music/audiobooks/library_items` — args `favorite`, `search`, `limit` (default 500),
  `offset`, `order_by` (default `sort_name`), `provider`, `genre`, `played_only`.
- `music/albums/count`, `music/albums/get`, `music/albums/album_tracks`,
  `music/albums/album_versions`, `music/albums/get_collection`, and the same shape for
  every other media type
  (https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/music/media/albums.py).
- `music/browse` — `path` (None or `"root"` = provider list), optional `player_id`.
  Root returns one `BrowseFolder` per provider declaring `ProviderFeature.BROWSE`, with
  `path`/`uri` of the form `<instance_id>://`
  (https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/music/controller.py).
- `music/search` — `search_query`, `media_types`, `limit` (default 25), `providers`
  (instance id or domain; the special value `"library"` means the local library).
  `library_only` is deprecated in favour of `providers=["library"]`.
- `music/recently_played_items`, `music/recently_added_tracks`, `music/in_progress_items`,
  `music/item`, `music/item_by_uri`, `music/item_by_name`, `music/get_library_item`.
- `music/favorites/add_item`, `music/favorites/remove_item` (`LIBRARY_WRITE`).

**Artwork.** MA proxies and resizes images itself. `MetaDataController.post_setup()`
registers `/imageproxy/*` on **both** the webserver (8095) and the stream server (8097)
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/metadata/controller.py).
The accepted sizes are a fixed allowlist — `{0, 80, 160, 256, 512, 1024}`, where `0`
means no resize
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/metadata/constants.py).
So a cover-art grid asks for `/imageproxy/<id>?size=512` and nothing else; an arbitrary
size is rejected. Since API schema 31 the opaque `/imageproxy/<proxy_id>` form is the
canonical one (https://github.com/music-assistant/frontend/blob/main/src/helpers/utils.ts).

**Playback** (`players/cmd/*`, scope-gated):
`play`, `pause`, `play_pause`, `stop`, `next`, `previous`, `seek`, `power`, `volume_set`,
`volume_up`, `volume_down`, `volume_mute`, `group`, `group_many`, `ungroup`,
`ungroup_many`, `set_members`, `group_volume`, `group_volume_up/down/mute`, `shuffle`,
`repeat`, `select_source`, `select_sound_mode`, `set_option`, `play_announcement`.
Plus `players/all`, `players/get`, `players/get_by_name`,
`players/create_group_player`, `players/remove_group_player`,
`players/sleep_timer/set|get|clear`.

**Queue** (`player_queues/*`): `play_media`, `play`, `pause`, `play_pause`, `stop`,
`next`, `previous`, `seek`, `skip`, `shuffle`, `repeat`, `clear`, `items`,
`play_index`, `move_item`, `move_item_end`, `delete_item`, `transfer`, `all`, `get`,
`get_active_queue`, `save_as_playlist`, `set_playback_speed`, `crossfade`, `autoplay`,
`overlay`.

The one you build the whole UI around is
**`player_queues/play_media`**
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/player_queues/controller.py):

```
player_queues/play_media(
  queue_id,            # = the player_id of the target speaker
  media,               # MediaItem(s) and/or URI string(s) — a list is allowed
  option=None,         # QueueOption: play / replace / next / add ...
  radio_mode=False,    # deprecated; use a radio_playlist:// URI instead
  start_item=None,     # start an album/playlist from a given track
  sort_by=None,
  start_from_beginning=False,
  shuffle=None,        # None = follow queue setting; album/podcast turn it off
)
```

Tapping an album cover is one call: `player_queues/play_media` with the album's `uri`,
`queue_id` = the kid's-room speaker, `option="replace"`. That is the entire playback
path.

### 1.6 Is there a JS/TS client library?

**No official one.** `music-assistant/client` (https://github.com/music-assistant/client,
https://pypi.org/project/music-assistant-client/) is **Python**, not JavaScript — worth
stating plainly because the name invites the wrong assumption.

The practical TS reference is the frontend's own API plugin:
`src/plugins/api/index.ts` (~3 800 lines) plus `src/plugins/api/interfaces.ts`
(~2 000 lines of typed models)
(https://github.com/music-assistant/frontend/tree/main/src/plugins/api). It is a Vue
app, `package.json` is `{"name": "frontend", "version": "0.0.0"}` — **not published to
npm**, so you cannot `npm install` it; you would vendor or re-implement. It handles URL
normalisation (`http(s)://` ↔ `ws(s)://`, appends `/ws`), the `auth` handshake,
`sendCommand` with a pending-command map keyed on `message_id`, reconnection with
`_failPendingCommands()`, and typed helpers like `playerCommand(player_id, cmd, args)`
→ `players/cmd/<cmd>` and `queueCommand(queue_id, cmd, args)` → `player_queues/<cmd>`.

For a kiosk app, ~150 lines of hand-written TS against the OpenAPI spec is a better
trade than vendoring a Vue-coupled 6 000-line module.

### 1.7 How stable is the API across versions?

MA versions the API explicitly
(https://github.com/music-assistant/server/blob/dev/music_assistant/constants.py):

```python
API_SCHEMA_VERSION: Final[int] = 77   # bump for new/non-breaking changes
MIN_SCHEMA_VERSION: Final[int] = 28   # bump only for BREAKING changes
```

The in-source comment on `MIN_SCHEMA_VERSION` is the stability contract:

> *"Only bump when there are breaking changes to existing API commands or models, such
> as removing fields or changing field types. Note that doing so will break
> compatibility with all clients in the field (including Home Assistant) that have not
> yet been updated to the new API schema version, so only bump this when absolutely
> necessary."*

Read that as: 77 feature bumps have shipped against a floor that has stayed at 28. There
is also a first-class deprecation mechanism — `register_api_command(..., alias=True)`
keeps old command names alive (e.g. `music/albums/get_album` is retained as an alias for
`music/albums/get`)
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/music/media/base.py).

**Verdict: the API is stable enough to build on.** The realistic risks are (a) new
*optional* fields appearing in models — harmless if you parse leniently, and (b) the
`ServerInfoMessage` schema version being below what your client assumes. Check
`schema_version` from `/info` at startup and fail loudly.

---

## 2. Music Assistant → Sonos

### 2.1 Two providers, both stable, S1 and S2 are separate

There is **one provider per Sonos generation**, both marked `"stage": "stable"`:

- **`sonos`** — "SONOS", S2 firmware. Depends on `aiosonos==0.1.13`, which is MA's own
  library. mDNS discovery on `_sonos._tcp.local.`
  (https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/manifest.json).
- **`sonos_s1`** — "SONOS S1", for Series-1 devices on the S1 app. Depends on
  `soco==0.31.2` + `defusedxml`, i.e. the classic UPnP/SOAP path
  (https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos_s1/manifest.json).

The docs confirm the split and one hard limitation: *"Sonos devices from the same series
(S1 or S2) will play in sync when grouped"* but *"S1 and S2 devices cannot be grouped
together in the same Sync Group"*
(https://www.music-assistant.io/player-support/sonos/).

### 2.2 How it actually talks to the speaker — not UPnP, not the cloud

The S2 provider's module docstring says it plainly: *"Based on the aiosonos library,
which leverages the new websockets API of the Sonos S2 firmware"*
(https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/provider.py).

In `aiosonos` (https://github.com/music-assistant/aiosonos):

- Discovery/info: `GET https://<player_ip>:1443/api/v1/players/local/info`
  (https://github.com/music-assistant/aiosonos/blob/main/aiosonos/utils.py).
- The response carries a `websocketUrl`, and the client connects to that local
  WebSocket (https://github.com/music-assistant/aiosonos/blob/main/aiosonos/client.py).
- TLS is deliberately unverified — `check_hostname = False`, `verify_mode = CERT_NONE`
  — because the speaker presents a self-signed certificate.
- **Every request carries `X-Sonos-Api-Key: 123e4567-e89b-12d3-a456-426655440000`**, a
  constant in the source
  (https://github.com/music-assistant/aiosonos/blob/main/aiosonos/const.py). That is a
  placeholder UUID, not a registered developer key. **The Sonos *local* websocket API
  accepts it, so no Sonos developer account, OAuth flow or internet connection is
  needed for local control.** This is the crux of why the whole architecture works
  offline.
- Commands are `{namespace: "<ns>:1", command: "...", cmdId: "<uuid>"}` over the socket
  (https://github.com/music-assistant/aiosonos/blob/main/aiosonos/api/websockets.py).
  Namespaces implemented: `playback`, `playbackMetadata`, `playbackSession`, `groups`,
  `groupVolume`, `playerVolume`, `audioClip`, `homeTheater`
  (https://github.com/music-assistant/aiosonos/tree/main/aiosonos/api/namespaces), all
  cross-referenced in-source to `https://docs.sonos.com/reference`.
- The library's own comment notes the websocket API runs *locally on every Sonos
  speaker* and that the cloud API is a separate REST surface sharing the same object
  model (https://github.com/music-assistant/aiosonos/blob/main/aiosonos/api/websockets.py).

So: **local websocket control API, no cloud, no UPnP for S2, no AirPlay shim, no
Snapcast.** S1 falls back to SoCo/UPnP.

### 2.3 Does MA proxy the audio? Yes — and it does something clever

MA does **not** hand Sonos a Qobuz URL. It impersonates a Sonos **Cloud Queue** server.

`SonosPlayerProvider.handle_async_init()` registers a dynamic route
`/sonos_queue/*` on MA's stream server, and `play_media` tells the speaker to load a
cloud queue at `{stream_server_base_url}/sonos_queue/{player_id}/v2.3/` via
`playbackSession.loadCloudQueue`
(https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/player.py,
https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/provider.py,
https://github.com/music-assistant/aiosonos/blob/main/aiosonos/group.py which cites
https://docs.sonos.com/reference/playbacksession-loadcloudqueue-sessionid).

The speaker then calls back into MA for `itemWindow`, `version`, `context` and
`timePlayed`. Each queue item MA serves looks like:

```json
{"id": "<wire item id>",
 "track": {"type": "track", "mediaUrl": "<MA stream server URL>",
           "contentType": "...", "service": {"name": "Music Assistant", "id": "mass"},
           "name": ..., "imageUrl": ..., "durationMillis": ...,
           "artist": {...}, "album": {...}}}
```

(`_parse_sonos_queue_item`, https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/provider.py)

Consequences, all of them load-bearing for this project:

- **The Sonos speaker pulls audio over HTTP from Music Assistant.** For both Qobuz and
  NAS files. MA decrypts/fetches from Qobuz, or reads the NAS file, and re-serves it.
  MA is in the audio path; if the laptop sleeps, music stops.
- The speaker reports playback position back to MA (`timePlayed`), so the UI gets a real
  progress bar, and it reports errors, which MA logs — including the telltale
  "stream server refused the item / 404" burst when the queue moved on.
- Because it's a real Sonos queue and not a "radio stream" hack, **next/previous,
  seeking, metadata and cover art on the Sonos app all work**, and
  `PlayerFeature.GAPLESS_PLAYBACK` is declared in the base feature set
  (https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/const.py).
  The window is `PREVIOUS_ITEMS = 1` / `UPCOMING_ITEMS = 10`.
- Announcements take a different path: MA notes Sonos treats `play_stream_url`
  announcements as "duration-less radio streams and will retry/loop them", so
  announcements go through a one-item cloud queue instead.

### 2.4 Transcoding, and what happens to a 192 kHz Qobuz stream

Sonos hardware limits are hard-coded in the player's config entries with a comment
spelling it out: *"Sonos takes 44.1/48 kHz, and the older NON_HIRES_MODELS are limited
to 16 bit"*
(https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/player.py):

```python
supported_sample_rates=[44100, 48000],
supported_bit_depths=[16, 24] if hi_res else [16],
safe_max_sample_rate=48000,
safe_max_bit_depth=24 if hi_res else 16,
```

`NON_HIRES_MODELS = ("Play:1", "Play:3", "Connect", "Connect:Amp", "Table lamp")`
(https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/const.py).

MA's Qobuz provider can fetch up to **FLAC 192 kHz / 24-bit**
(https://www.music-assistant.io/music-providers/qobuz/). **Therefore MA resamples every
hi-res Qobuz track down to 48 kHz before the Sonos pulls it.** That is CPU work on the
old laptop, per stream. For a 4-year-old's speaker this is an argument to set the Qobuz
provider's quality to *CD Quality 44.1 kHz/16 bit* (`quality` option value `6`, per
https://github.com/music-assistant/server/blob/dev/music_assistant/providers/qobuz/strings.json)
and skip the resampling entirely.

### 2.5 Known limitations (all from primary sources)

- **Crossfade is broken on lossless output.** Official docs: *"Sonos firmware changes
  has resulted in crossfade not working when the output codec is lossless (i.e. FLAC or
  WAV)."* Workarounds given: disable crossfade, use MP3 output, or use AirPlay mode
  (https://www.music-assistant.io/player-support/sonos/).
- **Older models misbehave.** Connect Amp and Play:1 have playback failures where
  enabling Queue Flow Mode helps (same page). Play:1 and Play:3 are also in
  `UNSUPPORTED_MODELS_NATIVE_ANNOUNCEMENTS`.
- **Pause is worked around, not used.** In-source comment: *"Sonos seems to be bugged
  when playing our queue tracks and we send pause, it can't resume the current track and
  simply aborts/skips it, so we stop the player instead"*
  (https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/player.py).
  Practical effect: "pause" on a kid's UI is really stop+resume-from-position. Mostly
  invisible, occasionally audible as a gap.
- **Synced members refuse commands.** If a speaker is passive (synced to another), MA
  raises `PlayerCommandFailed` with `player_synced_cannot_play` rather than silently
  doing nothing — your UI must handle this, see §6.
- **S1/S2 cannot be grouped together** (docs, above).
- AirPlay is available as an alternative output protocol for Sonos speakers that support
  AirPlay 1/RAOP, and MA notes other Sonos players can still be synced to an
  AirPlay-driven one using the native Sonos protocol (docs, above). Useful fallback if
  the cloud-queue path misbehaves on an old model.

### 2.6 The risk that actually matters: Sonos can switch this off

Sonos' own documentation says the thing MA depends on is not a released feature:

> **"The Control API on the LAN is not available for wide release."**
> — https://docs.sonos.com/docs/connected-home-architecture (updated 2026-04-16)

And since the July 2025 firmware (85.0-66270), **both** local paths sit behind a
user-visible toggle in the Sonos app under Account -> Legal and Privacy ->
Privacy & Security -> Connection Security
(https://support.sonos.com/en-us/article/adjust-connection-security-settings):

> ***Authentication**: This applies to third-party integrations that use Sonos cloud and
> Local Area Network (LAN) APIs, requiring them to authenticate... **The default setting
> for Authentication is OFF.***
>
> ***UPnP**: This pertains to integrations that utilize the **unsupported UPnP
> protocol**... **The default setting for UPnP is ON.***

Read carefully, that says: the LAN API MA talks to is one switch away from requiring real
authentication, and MA currently authenticates with a placeholder UUID (§2.2). Sonos also
now calls UPnP — the S1 provider's entire transport — *"the unsupported UPnP protocol"*.

This is not hypothetical. In late 2025 the UPnP default appeared to flip off and broke
Home Assistant for many users with `403 Forbidden` on
`http://<ip>:1400/DeviceProperties/Control`
(https://github.com/home-assistant/core/issues/151258). HA's docs PR merged 2025-12-09
states outright: *"A recent change to the Sonos firmware is causing UPnP to be disabled
by default causing the integration to fail"*
(https://github.com/home-assistant/home-assistant.io/pull/42467).

**Counterweight:** 2026 has been quiet. The full set of `integration: sonos` issues filed
in HA since 2026-01-01 (35 of them) contains zero reports of authentication, tokens or
lost local control, and MA merged a dozen Sonos improvements in September 2026 alone
(e.g. https://github.com/music-assistant/server/pull/6278,
https://github.com/music-assistant/server/pull/6247). There were **zero open Sonos issues
on the MA tracker** when checked on 2026-09-18.

**What to do about it:** budget for the possibility, don't design around it. Keep the MA
container easy to update (it ships nightlies), and know the fallback ladder: native S2
provider -> AirPlay output on an AirPlay-2-capable speaker -> S1/UPnP. Check the kid's
speaker against Sonos' AirPlay 2 list
(https://support.sonos.com/en-us/article/stream-airplay-audio-to-sonos) **before buying
into this plan** — Play:1, Play:3, Play:5 Gen 1, Connect and Connect:Amp are *not* on it,
which removes the fallback entirely for those models.

---

## 3. Qobuz

### 3.1 There is no public Qobuz API, and there has not been one for years

Checked live on 2026-09-18:

| Check | Result |
|---|---|
| `https://www.qobuz.com/api` | HTTP 404 |
| `developer.qobuz.com` | DNS does not resolve |
| `api.qobuz.com` | DNS does not resolve |
| `https://github.com/Qobuz/api-documentation` | HTTP 404 |
| https://github.com/orgs/Qobuz/repositories | 9 repos, none API-related |
| `https://www.qobuz.com/api.json/0.2/` | HTTP 400 — **the undocumented endpoint is alive** |
| https://www.qobuz.com/robots.txt | contains `Disallow: /api.json/` for `User-agent: *` |

The Wayback CDX trail
(https://web.archive.org/cdx/search/cdx?url=github.com/Qobuz/api-documentation&output=text&fl=timestamp,statuscode)
shows `200` on 2018-06-11 and `404` by 2020-03-17, 404 ever since. The last archived copy
(https://web.archive.org/web/20180611030533/https://github.com/Qobuz/api-documentation)
was titled *"Qobuz Official API documentation"*, last commit January 2018, and said:

> *"In order to use our API, you need to authenticate your application by sending an
> application ID parameter expressed as app_id… Please contact api@qobuz.com to request
> your application credentials (app_id and app_secret values)."*

So the once-public program is gone. **There is no developer portal and no self-serve
partner API in 2026.** The only surviving official artifact on a Qobuz-controlled host is
the Terms of Use PDF (below); the sibling documentation PDFs now return 403 per-object.

A staleness tell: that live ToU PDF's footer still reads *"Qobuz SARL … RCS de Paris n°
499 971 414"*, while the operating entity today is XANDRIE SA, RCS Bobigny
(https://www.qobuz.com/us-en/legal/mentions). The API terms have not been touched across
a corporate change — consistent with an abandoned program. Whether `api@qobuz.com` still
receives mail is **UNVERIFIED**.

**Qobuz Connect is explicitly closed.** Launched 2025-05-15
(https://community.qobuz.com/press-en/qobuz-launches-qobuz-connect-a-feature-that-simplifies-and-enhances-the-listening-experience),
and the help centre answers the question directly
(https://help.qobuz.com/en/articles/313603-can-qobuz-connect-be-used-via-a-third-party-app):

> **"Only Qobuz apps can control devices via Qobuz Connect. Third-party apps are not supported."**

The integrated-brand list (~80 brands, updated 2026-04-03,
https://help.qobuz.com/en/articles/314578-list-of-brands-integrated-into-qobuz-connect)
**does not include Sonos.** It is also local-network only. Hardware vendors integrate via
StreamUnlimited's commercial SDK — a third-party source, not Qobuz
(https://www.streamunlimited.com/qobuz-connect/). Music Assistant has **no**
`qobuz_connect` provider, and given the above, one is not implementable.

### 3.2 What the terms actually say

**(a) API Terms of Use** — https://static.qobuz.com/apps/api/QobuzAPI-TermsofUse.pdf
(live, "Effective as from 1st September 2011", French law, Paris courts). The clauses
that bite:

> *"The application ID and the Application secret shall not in any circumstance be
> shared, whether voluntarily or no, to a third party."*
>
> Restriction (i): *"accessing or giving access to the Service or Content in any other
> way than through the API in accordance with the Terms of Use"*
>
> Restriction (x): *"indexing in any way the full or part of the Service or collect
> information about Users"*
>
> *"You agree that your Application must prominently display the following: 'This
> application uses the Qobuz API but is not certified by Qobuz.'"*

**(b) Consumer terms (GCUS)** — https://www.qobuz.com/us-en/legal/terms (publisher
XANDRIE SA; governing French original at https://www.qobuz.com/fr-fr/legal/terms). No
effective date is printed on the page (**UNVERIFIED**). Notable findings:

- **There is no clause naming third-party clients or software**, and **no general
  anti-scraping or anti-robot clause.** The only automation clause is
  stream-manipulation-specific (§7, artificially inflating stream counts "either manually
  or via an automated process").
- The anti-harvesting hook lives elsewhere — the legal-notices page asserts the French
  *sui generis* database right: *"any extraction or reuse of this database … is
  forbidden"* (https://www.qobuz.com/us-en/legal/mentions).
- Four separate clauses forbid circumventing technical protection measures (§7, §12, §17,
  §21.8.3), and §7 forbids reverse-engineering *"the QOBUZ Applications"* — a term defined
  as software Qobuz supplies to the customer, so nominally scoped to their own apps.
- **The practical constraint for a household server is concurrency**: §7 — *"QOBUZ is
  only accessible from one (1) Listening Device at a time"* except Duo (2) and Family (6),
  per §21.3.3 / §21.4.3 / §21.6.3 / §21.7.3.

**Net reading — and be clear this is a reading, not legal advice.** A
username/password client such as Music Assistant does not circumvent TPM and does not
reverse-engineer Qobuz's apps, so under the *consumer* terms it sits in a grey zone. What
plainly breaches the *API* ToU is using an `app_id`/`app_secret` you were not issued
(sharing is forbidden "in any circumstance") and restriction (i). **Risk in practice: your
account, not a lawsuit.** No evidence of Qobuz banning accounts over third-party clients
was found in either direction — **UNVERIFIED**. The realistic failure is Qobuz rotating or
throttling the shared credentials and the integration breaking for everyone at once.

### 3.3 Music Assistant's Qobuz provider

Verified in source at https://github.com/music-assistant/server/tree/dev/music_assistant/providers/qobuz
(commit `4bba1b3`, 2026-09-18). `manifest.json`: `"stage": "stable"`,
`"multi_instance": true`, no external requirements.

- **Auth:** `POST` to `https://www.qobuz.com/api.json/0.2/user/login` with
  `X-App-Id: app_var("qobuz_app_id")`, username and an MD5 of the password, yielding a
  `user_auth_token`. Signed requests append `request_ts` and
  `request_sig = md5(signing_data + request_ts + app_secret)`. This is the undocumented
  `api.json/0.2` surface the archived 2018 docs described.
- **Credentials are bundled.** `helpers/app_vars.py` is unusually candid
  (https://github.com/music-assistant/server/blob/dev/music_assistant/helpers/app_vars.py):
  *"this is NOT a security boundary… these are shared API credentials registered to the
  Music Assistant open-source project… They are rate-limited and shared across the whole
  Music Assistant community, so when they get abused the upstream provider throttles or
  revokes them and Music Assistant breaks for thousands of real users… Registering your
  own credentials is free - please do that instead."*
  **You can substitute your own** via the `MASS_APP_VAR_QOBUZ_APP_ID` /
  `MASS_APP_VAR_QOBUZ_APP_SECRET` environment variables. (Note the tension: one shared
  `app_id` for thousands of users is exactly what the API ToU's non-sharing clause
  forbids.)
- **MA labels it unofficial in the UI.** The provider prepends
  `CONF_ENTRY_UNOFFICIAL_PROVIDER`
  (https://github.com/music-assistant/server/blob/dev/music_assistant/constants.py), whose
  alert text reads: *"This is an unofficial integration that is not affiliated with,
  supported by, or endorsed by the music service. It relies on interfaces that are not
  officially supported and may stop working at any time. Use of this provider may also be
  subject to the service's terms of use."*
- **Rate limiting:** a *class-level* `ThrottlerManager(rate_limit=2, period=1)` — 2 req/s
  shared across every configured Qobuz account. Handles 429 (honouring `Retry-After`),
  502/503 and 404. Playback reporting bypasses the throttle.
- **Features:** library artists/albums/tracks/playlists with edit, playlist create,
  `BROWSE`, `SEARCH`, artist albums, artist top tracks, lookup by ISRC/UPC. **No**
  recommendations, lyrics or similar-artist. Search results cache for 14 days.
- **Quality:** options are `27` (192 kHz/24-bit), `7` (96/24), `6` (CD 44.1/16), `5`
  (MP3 320) (https://github.com/music-assistant/server/blob/dev/music_assistant/providers/qobuz/strings.json).
  `get_stream_details` walks *down* the ladder `[27, 7, 6, 5]` from your maximum, with the
  comment *"it seems that simply requesting for highest available quality does not work"*.
  Returns `StreamType.HTTP` pointing at the Qobuz CDN directly, `can_seek=True`.
- **Two warts worth knowing:** username and password are currently sent as **query
  parameters** on `user/login` (there is an in-code TODO to move them to the POST body),
  and MA deliberately skips `raise_for_status` so exception messages don't leak that URL.
  MA also sends `track/reportStreamingStart` / `reportStreamingEnd` telemetry.

### 3.4 The big question: can Sonos pull Qobuz itself?

**Short answer: not in any way that is useful for this project, and the quality ceiling
makes the point moot anyway.**

**How native Sonos+Qobuz works.** Sonos' own docs describe the split
(https://docs.sonos.com/docs/how-sonos-works, https://docs.sonos.com/docs/components-and-interfaces):

> *"The Sonos app is not smart, the player is. The Sonos app acts as a remote control. It
> sends browse and metadata requests to music and content services and transport control
> commands to the player."*
>
> *"Players are SMAPI clients that request playback information from your SMAPI service…
> once a player gets a URI for content, it is a Media client that connects directly to the
> Media server to stream the content."*

So yes — with native Qobuz the **speaker** pulls audio from Qobuz's cloud, and the
**controller** performs browse/search against Qobuz's SMAPI endpoint.

**Qobuz is a registered Sonos content service.** A captured `ListAvailableServices`
response, committed as a test fixture
(https://github.com/svrooij/node-sonos-ts/blob/master/src/tests/services/responses/music-services.ListAvailableServices.xml),
contains:

```xml
<Service Id="31" Name="Qobuz" Version="1.1"
         Uri="http://www.qobuz.com/api.xml/0.3/sonos"
         SecureUri="https://www.qobuz.com/api.xml/0.3/sonos"
         ContainerType="MService" Capabilities="10835">
  <Policy Auth="AppLink" PollInterval="120"/>
  ...
</Service>
```

All three Qobuz URLs were verified live today: the SMAPI endpoint returns an HTTP 500 SOAP
fault (*"Bad Request"* — i.e. the service is running and answering SOAP);
`https://www.qobuz.com/sonos/0.3/presentationmap.xml` and
`.../stringtables.xml` both return 200. Derived identifiers: service `Id` 31, `ServiceType`
= `Id*256+7` = **7943**, `Auth="AppLink"`.

Then come four separate blockers.

**Blocker 1 — the Sonos Control API has no catalogue browse, for any service.** The
complete namespace list (https://docs.sonos.com/llms.txt) is `groups`, `playback`,
`playbackMetadata`, `playbackSession`, `playerVolume`, `groupVolume`, `homeTheater`,
`audioClip`, `favorites`, `playlists`, `musicServiceAccounts`, `households`. There is no
`getMetadata`, no `search`, no `browse`. The only sanctioned route to Qobuz content is
`favorites.loadFavorite` — and **there is no API to create a favorite**, so a human must
add each one by hand in the Sonos app, against a ceiling of *"70"*
(https://docs.sonos.com/reference/favorites-getfavorites-householdid). A fixed 70-item
user-curated shortlist is not a browsable catalogue.

**Blocker 2 — you cannot read the household's service token.** Three independent sources
say so. SoCo's `accounts.py`: the UPnP route *"returns an encrypted string, and, so far,
we cannot decrypt it"*
(https://github.com/SoCo/SoCo/blob/master/soco/music_services/accounts.py).
`music_service.py` carries *"FIXME we no longer have accounts, so for now the serial
numbers is assumed to be 0"*. And node-sonos-ts' own README asks for help:
*"Sonos controller app 'loads' credentials from somewhere, not sure where they are stored
or how to retrieve"* — with an open call for someone handy with Wireshark
(https://github.com/svrooij/node-sonos-ts/blob/master/src/musicservices/README.md).
`MusicServices.GetSessionId(ServiceId, Username)` exists on the player, but that is the
`UserId` auth path; Qobuz is `AppLink`, so it is not the route (**UNVERIFIED** whether it
works at all for Qobuz).

The workaround is to mint your *own* token by running the AppLink flow yourself — SoCo
implements `begin_authentication()` / `complete_authentication()` generically. Which leads
to:

**Blocker 3 — nobody has done it, and there is a documented one-shot hazard.** Grepping
the three major libraries for "qobuz": SoCo **0 hits**, `bencevans/node-sonos` **0 hits**,
`node-sonos-ts` **2 hits** (the test fixture and a capability table). SoCo's ShareLink
plugin supports exactly Spotify, TIDAL, Deezer and Apple Music — not Qobuz. Home
Assistant's Sonos media browser offers only the local music library and Sonos favorites.
**You would be writing the first implementation**, reverse-engineering the
`x-rincon-cpcontainer:` container prefixes and the correct `<desc id="cdudn">` token shape
for AppLink from scratch. And SoCo's `music_service.py` module docstring warns:

> *"There currently is no way to reset an authentication, at least when authentication has
> been performed for TIDAL (which uses device link authentication), after it has been done
> once for a particular household ID, it fails on subsequent attempts. What this might mean
> is that if you lose the authentication tokens for such a service, it may not be possible
> to generate new ones."*

That is documented for TIDAL/DeviceLink. Qobuz uses AppLink, a sibling flow sharing the
same completion path — so the hazard **plausibly** applies, but with zero Qobuz-specific
evidence: **UNVERIFIED**. You would be gambling your household's ability to
re-authenticate.

**Blocker 4 — it is against both parties' terms.** Sonos' Platform ToS
(https://docs.sonos.com/docs/terms-of-service): §1(c) *"You will not misrepresent yourself
or your product's identity"*, §3(c) *"Do not use your product to enable unauthorized
access to any music or audio service"*, §3(g) no reverse engineering. The SMAPI-client
route requires presenting `deviceProvider: Sonos` and a real player's serial as
`deviceId` — i.e. impersonating a Sonos controller. It also hits Qobuz API ToU restriction
(i).

### 3.5 The finding that ends the discussion: Sonos caps at 48 kHz

Qobuz's *own* Sonos string table (fetched live from
`https://www.qobuz.com/sonos/0.3/stringtables.xml`) advertises:

> *"The highest quality available on a SONOS device (16/44.1 Lossless FLAC)"*

Corroborated independently: Sonos' supported-formats page caps content-service FLAC at
*"48 kHz, 44.1 kHz, 32 kHz…"* with no 88.2/96/176.4/192
(https://docs.sonos.com/docs/supported-audio-formats, updated 2026-04-16), and MA's own
Sonos player code hard-codes `supported_sample_rates=[44100, 48000]` (§2.4).

**So Sonos cannot play Qobuz hi-res by any route — native, SMAPI, or Music Assistant.**
Going through MA costs you nothing in quality that native Sonos-Qobuz would have given
you. That single fact removes the entire reason to want the speaker to pull Qobuz
directly.

### 3.6 Other Qobuz client paths, for completeness

| Project | Status 2026-09-18 | Verdict |
|---|---|---|
| **Lyrion Qobuz plugin** (https://github.com/LMS-Community/plugin-Qobuz) | v3.7.1 released **2026-08-24**, last commit **2026-09-16**, 6 open issues. Credentials **bundled** in `install.xml` as a hex `<aid>`, not scraped. Supports full hi-res (quality `27`). | **The best-maintained Qobuz client.** Its `ProtocolHandler.pm` implements `canDirectStreamSong`, so an unsynced player is handed the signed Qobuz CDN URL and **pulls directly** — no server in the audio path. Caveats: **no LICENSE file** (GitHub reports `license: null`), and whether Qobuz actually *issued* those credentials is **UNVERIFIED** — it is a community plugin by long-time Slim Devices developers, with no evidence of Qobuz endorsement in the repo. |
| **streamrip** (https://github.com/nathom/streamrip) | **Qobuz is currently broken.** Issue #1012 (opened 2026-07-18, still open): every album download crashes with `KeyError: 'tracks'` because Qobuz now rejects `extra=tracks`. Fix in PR #1013 is **unmerged**. v2.2.0 was never published to PyPI (latest there is 2.1.0, 2025-03-10). | Needs a patch to work. Also a downloader, not a player. |
| **qobuz-dl** (https://github.com/vitiko98/qobuz-dl) | **Effectively dead.** Last *code* commit 2023-08-21; 2025 commits were README-only. No releases or tags. PyPI frozen at 0.9.9.10 (2023-03-26). 149 open issues including unanswered 2026 breakage reports. | Avoid. |
| **Squeezelite** (https://github.com/ralph-irving/squeezelite) | Active — last commit 2026-08-18, v2.0.0.1595. | **Touches Qobuz not at all** — `grep -i qobuz` over the C sources returns nothing. The LMS server sends a `strm 's'` command containing a ready-made raw HTTP request header and the player just opens the socket. All Qobuz auth and signing stay server-side. |

All four real Qobuz clients (qobuz-dl, streamrip, the LMS plugin, Music Assistant) use the
**identical** pattern — `X-App-Id` header, `user/login` with an MD5'd password yielding a
`user_auth_token`, and `request_ts`/`request_sig` MD5 signing. They differ only in
credential provenance: **scraped** from `play.qobuz.com`'s JS bundle (qobuz-dl, streamrip)
versus **bundled** in the distribution (LMS plugin, Music Assistant). The LMS plugin's own
code still cites `github.com/Qobuz/api-documentation#signed-requests-authentification-` —
a URL that now 404s. These projects were all built against Qobuz's once-public
documentation.

---

## 4. Alternative backends, compared

The two questions that eliminate most candidates: **(a)** can it browse a merged
Qobuz + NAS library, and **(b)** can it play to Sonos?

| Backend | (a) Merged Qobuz + NAS | (b) Sonos — how | (c) API for a custom HTML UI | (d) 2026 status |
|---|---|---|---|---|
| **Music Assistant** | **Yes** — first-party Qobuz + SMB/NFS/local providers, releases linked across sources | **Yes — native local provider** (S2 cloud-queue over local WS; S1 via SoCo/UPnP) | **Yes** — `:8095/api` + `/ws` + OpenAPI at `/api-docs`, bearer token | stable **2.10.4**, nightlies daily |
| **Home Assistant** (+ MA) | Only via MA — HA alone has no Qobuz integration | **Yes — local push**, speakers connect back on TCP 1400 | **Yes** — WS `media_player/browse_media`, `media_source/browse_media`, `call_service`; unauthenticated token-in-URL cover proxy | HA **2026.9.3** |
| **Lyrion (LMS)** | **Yes** — official Qobuz plugin declares `<onlineLibrary>true</onlineLibrary>`, imports into *My Music* alongside NAS files | **Yes — UPnP/DLNA push**, LAN-only, no cloud | **Yes** — `/jsonrpc.js` + CometD push | slimserver commit **2026-09-17**, stable 9.1.1; UPnPBridge **3.4.7 (2026-09-06)** |
| **Roon** | **Yes** — its flagship feature | **Yes — native since Feb 2017**, all models, 48 kHz/16-bit ceiling | **Weak** — beta Node/WebSocket "MOO" lib, no REST; browse module untouched since 2018 | Product **2.73 (2026-09-01)**; API libs frozen. **$14.99/mo or $829.99 lifetime**, needs SSD |
| **Navidrome + bonob** | **No** — local files only by design | bonob = SMAPI; on S2 **must be a public HTTPS endpoint on :443** | **Yes** — Subsonic/OpenSubsonic `getAlbumList2`, `getCoverArt` | Navidrome **v0.64.0 (2026-09-12)**; bonob active but fighting Sonos regressions |
| **OwnTone** | **No Qobuz at all** (Spotify + LastFM only) | **No native path** — `/stream.mp3` + SoCo DIY, or AirPlay on capable models | **Yes, cleanest REST** `:3689/api` + WS :3688, `artwork_url` with `maxwidth` | **29.3 (2026-07-22)** |
| **Mopidy** | **No** — Qobuz extension alpha, abandoned 2024-08-19, predates the Mopidy 4 Pydantic rewrite | **No native path** — `shout2send` → Icecast → SoCo | **Yes, well documented** — `/mopidy/rpc` + `/mopidy/ws`, CORS config | Core **v4.0.4 (2026-09-12)**; Qobuz corner dead |
| **MPD (+ myMPD)** | **No** — Qobuz is an *input* plugin only: `qobuz://track/<ID>`, no browse or search | **No output plugin** — `httpd` stream + SoCo hack | Raw TCP:6600; browser needs myMPD's JSON-RPC + WS bridge | MPD **0.24.15 (2026-08-27)** |
| **Plex / Plexamp** | **No Qobuz** — the integrated service is **TIDAL** | Plex-for-Sonos still live but cloud/SMAPI, needs Remote Access + NAT loopback; control only from iOS/Android + Plex Pass | Official docs disclaim community tools | commercially active |
| **Snapcast** | N/A — no library | **No.** Sonos cannot run snapclient | JSON-RPC :1780, volume/grouping only | v0.35.0 (2026-03-10) |

### Notes and corrections worth having

- **Plexamp has no Qobuz support.** https://www.plex.tv/plexamp/ markets TIDAL
  integration; Qobuz appears nowhere. Open requests remain unfulfilled
  (https://forums.plex.tv/t/qobuz-integration-with-plexamp-yes-again/844430).
- **Plex for Sonos was *not* removed.**
  https://support.plex.tv/articles/categories/plex-apps/sonos/ and
  https://support.sonos.com/en-us/services/plex are both live with no deprecation
  notice. It is nonetheless unusable here: it is a cloud/SMAPI integration requiring
  Remote Access and NAT loopback
  (https://support.plex.tv/articles/218237558-requirements-for-using-plex-for-sonos/),
  and controlling it needs Plex Pass on iOS/Android — not web. *The absence of a
  2025-26 removal announcement is **UNVERIFIED** (proving a negative).*
- **Roon's Sonos support dates from Roon 1.3, 1 February 2017**, not a recent addition
  (https://community.roonlabs.com/t/roon-1-3-is-live/19239, Roon Labs staff:
  *"Streaming to Sonos hardware is fully supported in Roon 1.3… Roon will stream
  losslessly up to the 48kHz/16bit, and will automatically downsample higher resolution
  content."*). Current KB: *"Roon should work with all Sonos hardware"*
  (https://help.roonlabs.com/portal/en/kb/articles/sonos) — including pre-AirPlay-2
  models. Kiosk-relevant: pressing transport controls in the Sonos app **stops** Roon
  rather than controlling it.
- **Lyrion is the only serious non-MA contender.** Its Qobuz plugin is genuinely
  first-party (LMS-Community org,
  https://github.com/LMS-Community/plugin-Qobuz) and uses the OnlineLibrary import
  mechanism, so one `albums` query returns Qobuz *and* NAS albums
  (https://lyrion.org/reference/music-service-plugin/). Sonos comes via philippe44's
  UPnP/DLNA Bridge, listed in the official plugin repo
  (https://raw.githubusercontent.com/LMS-Community/lms-plugin-repository/master/extensions.xml)
  with ~25 Sonos-specific CHANGELOG entries
  (https://raw.githubusercontent.com/philippe44/LMS-uPnP/master/CHANGELOG). Its
  `/jsonrpc.js` API plus CometD push is genuinely good
  (https://lyrion.org/reference/cli/using-the-cli/). **Risk:** the bridge is a
  single-maintainer C binary whose GitHub Releases tab is a decade stale — real builds
  ship from SourceForge.
- **bonob's S2 requirement is disqualifying for a kid's device.** Its own README:
  *"In May 2024 Sonos released an update to the Sonos S2 app that required bonob be
  exposed to the internet to continue to work on S2… Exposing services to the internet
  comes with additional risk, tread carefully."*
  (https://github.com/simojenki/bonob). Public HTTPS on :443 for a toddler's music
  player is the wrong trade.
- **MPD's Qobuz plugin is credential-blocked.** It needs a Qobuz `app_id`/`app_secret`,
  and MPD's docs point at `github.com/Qobuz/api-documentation`, which is **404** — the
  repo is gone. Even setting that aside, it has no browse or search: you must already
  know the numeric track ID (https://mpd.readthedocs.io/en/latest/plugins.html).
- **Snapcast is confirmed irrelevant.** Sonos firmware is closed and cannot run
  snapclient; the feature request has been open since 2020-12-27
  (https://github.com/badaix/snapcast/issues/750). Its README even describes Snapcast as
  a way to make other players behave *"Sonos-like"*.

### HA-in-front-of-MA vs MA-direct

If you already run Home Assistant, HA gives you two things MA does not:
`media_player/browse_media` over WebSocket
(https://github.com/home-assistant/core/blob/dev/homeassistant/components/media_player/__init__.py)
and — the genuinely useful one — an **unauthenticated, token-in-URL image proxy**,
`MediaPlayerImageView` with `requires_auth = False` serving
`/api/media_player_proxy/{entity_id}/browse_media/{type}/{id}?token=…`, which drops
straight into an `<img src>` cover grid with no fetch/blob dance.

But MA's own `/imageproxy/<id>?size=512` is equally `<img src>`-able, and going through
HA adds a second daemon, a second auth system, and a translation layer between MA's rich
media model and HA's flattened `media_content_id`/`media_content_type` pair. **For a
purpose-built kiosk, talk to MA directly.** Add HA only if it is already running for
other reasons. Note that a browser app on a different origin needs
`cors_allowed_origins` configured on HA's `http` integration
(https://www.home-assistant.io/integrations/http/).

---

## 5. Direct Sonos control options

Relevant even if you use Music Assistant, because MA's Sonos provider rides on one of
these paths and inherits its risks.

### 5.1 The official Sonos Control API is cloud-only for you

Sonos' own architecture page states it flatly
(https://docs.sonos.com/docs/connected-home-architecture, page `updatedAt` 2026-04-16):

> **"The Control API on the LAN is not available for wide release."**
> "Use the Control API on the cloud to communicate with a Sonos player. The Sonos cloud
> manages the communication between your integration and the player."

The public docs index (https://docs.sonos.com/llms.txt) contains **zero** pages about
local control, LAN, websockets or port 1443. Every Control API reference page embeds an
OpenAPI document titled `"Sonos Control API (cloud)"` with servers at
`api.ws.sonos.com/control/api/{version}`. `developer.sonos.com` now sits behind a
Salesforce login wall.

A registered Sonos developer asked exactly this question on 2025-07-18
(https://en.community.sonos.com/advanced-setups-229133/where-is-the-lan-api-documented-6930288)
and got the same one-line quote. The OP reported the LAN API mirrors the cloud API and
uses **client certificates**, obtained via an approval process — *forum claim, not Sonos
documentation, so* **UNVERIFIED**.

### 5.2 The Cloud Control API is unusable for a kiosk

- OAuth 2.0, registered integration at https://integration.sonos.com/integrations, and a
  redirect URL that **"must be publicly routable"** and **"must be HTTPS"**
  (https://docs.sonos.com/docs/authorize). Single scope: `playback-control-all`.
- Events require a **publicly routable HTTPS callback with a CA-signed certificate**;
  without one, subscribe returns 403 (https://docs.sonos.com/docs/subscribe).
- Rate limits: 1 000 req/min per application, and a spike arrest at >100 req in one
  second, both → HTTP 429
  (https://docs.sonos.com/docs/quotas-and-spike-arrests). Sonos *"reserve the right to
  restrict or revoke your access."*
- Everything routes through `api.ws.sonos.com`, so it **does not work without internet**
  (https://docs.sonos.com/docs/control).
- It also cannot play what you want: `loadStreamUrl` says *"you cannot use this command
  to send an on-demand track for playback"*
  (https://docs.sonos.com/reference/playbacksession-loadstreamurl-sessionid), and the
  favourites route is capped — *"The player limits the number of Sonos favorites to
  70"* (https://docs.sonos.com/reference/favorites-getfavorites-householdid). A
  browse-covers UI cannot live inside 70 favourites.

### 5.3 The local WebSocket API (port 1443) — undocumented, unauthenticated, works

Two independently maintained libraries confirm the same wire details:

- Home Assistant's `sonos-websocket` (https://github.com/jjlawren/sonos-websocket),
  pinned as `sonos-websocket==0.2.0` in HA's Sonos manifest: connects to
  `wss://{ip}:1443/websocket/api` with headers
  `X-Sonos-Api-Key: 123e4567-e89b-12d3-a456-426655440000` and
  `Sec-WebSocket-Protocol: v1.api.smartspeaker.audio`, `verify_ssl=False`.
- Music Assistant's `aiosonos` uses the **identical** placeholder key
  (https://github.com/music-assistant/aiosonos/blob/main/aiosonos/const.py).

That UUID is the canonical RFC-style placeholder — **the player does not validate it.**
No OAuth, no Sonos account, no internet.

Scoping caveat from aiosonos' docstrings: connected to a local speaker's websocket, *"the
player id can only be that from the local speaker itself"* — so you open one socket per
speaker/coordinator. Discovery without cloud: `groups:1 / getGroups` returns players with
`id`, `capabilities` and `websocketUrl`; `http://{ip}:1400/status/info` returns
playerId/groupId/householdId as JSON.

**Browser caveat:** Sonos' own JS sample-app guidance instructs apps not to send an
`Origin` header to players on the LAN, and browsers always do. **A kiosk page cannot
speak the 1443 API directly** — you need a local Node/Python process (which is exactly
what Music Assistant is). *Sourced from the now-login-walled developer.sonos.com sample
app page —* **UNVERIFIED** *by live fetch.*

### 5.4 UPnP/SOAP on port 1400 — the old reliable path

Source of truth is https://sonos.svrooij.io/ , auto-generated by scraping
`http://{ip}:1400/xml/device_description.xml`
(https://github.com/svrooij/sonos-api-docs). Its per-device "Discovery date" table shows
the latest regeneration at **2026-07-04 against firmware 95.0-77060** — so the full UPnP
surface was still present on mid-2026 S2 firmware.

Transport: `POST` to the control URL with a `soapaction` header and a SOAP envelope;
errors return HTTP 500 with `<UPnPError><errorCode>`. Discovery by SSDP M-SEARCH to
`239.255.255.250:1900` with `ST: urn:schemas-upnp-org:device:ZonePlayer:1`, or mDNS
`_sonos._tcp.local.`

| Service | Control URL |
|---|---|
| AVTransport | `http://{ip}:1400/MediaRenderer/AVTransport/Control` |
| RenderingControl | `http://{ip}:1400/MediaRenderer/RenderingControl/Control` |
| GroupRenderingControl | `http://{ip}:1400/MediaRenderer/GroupRenderingControl/Control` |
| Queue (Sonos-proprietary) | `http://{ip}:1400/MediaRenderer/Queue/Control` |
| ContentDirectory | `http://{ip}:1400/MediaServer/ContentDirectory/Control` |
| ZoneGroupTopology | `http://{ip}:1400/ZoneGroupTopology/Control` |

**Per-player volume** (`RenderingControl`, `InstanceID=0`, `Channel=Master`):
`SetVolume`, `GetVolume`, `SetRelativeVolume`, `SetMute`/`GetMute`,
`SetVolumeDB`/`GetVolumeDB`, `GetVolumeDBRange`, `RampToVolume`,
`GetOutputFixed`/`SetOutputFixed`.

**Transport and queue** (`AVTransport`): `Play`, `Pause`, `Stop`, `Next`, `Previous`,
`Seek(Unit ∈ TRACK_NR|REL_TIME|TIME_DELTA, Target)`,
`SetPlayMode(NORMAL|REPEAT_ALL|REPEAT_ONE|SHUFFLE_NOREPEAT|SHUFFLE|SHUFFLE_REPEAT_ONE)`,
`SetAVTransportURI`, `SetNextAVTransportURI`,
`AddURIToQueue(... DesiredFirstTrackNumberEnqueued, EnqueueAsNext)`,
`AddMultipleURIsToQueue`, `RemoveTrackFromQueue`, `RemoveAllTracksFromQueue`,
`ReorderTracksInQueue`, `SaveQueue`, `GetPositionInfo`, `GetTransportInfo`.

**Grouping** is done through AVTransport, not ZoneGroupTopology — which has *no*
group-mutation actions at all, only `GetZoneGroupState`/`GetZoneGroupAttributes`. What
SoCo actually does (https://github.com/SoCo/SoCo/blob/master/soco/core.py):

```python
def join(self, master):
    self.avTransport.SetAVTransportURI([
        ("InstanceID", 0), ("CurrentURI", f"x-rincon:{master.uid}"), ("CurrentURIMetaData", "")])

def unjoin(self):
    self.avTransport.BecomeCoordinatorOfStandaloneGroup([("InstanceID", 0)])
```

Play the player's own queue with `SetAVTransportURI("x-rincon-queue:{uid}#0")`; line-in is
`x-rincon-stream:{uid}`. Group volume goes to the **coordinator** via
`GroupRenderingControl.SetGroupVolume` / `SetRelativeGroupVolume` /
`SnapshotGroupVolume` — error 701 means "player isn't the coordinator".

### 5.5 Capping maximum volume: no such thing in the Sonos protocol

A grep of every generated service document
(https://github.com/svrooij/sonos-api-docs/tree/main/docs/services — all 16 services) for
`limit`, `maxvolume`, `cap` returns **zero hits**. What exists is not a cap:

- `GetVolumeDBRange` reports the hardware dB range; **there is no `SetVolumeDBRange`.**
- `SetOutputFixed` freezes volume entirely, and only on line-out devices (Port/Amp/Connect).
- `DeviceProperties.SetAutoplayVolume` sets the volume a speaker *snaps to* on
  autoplay/TV start — a starting point, not a ceiling.
- The cloud API has none either; `groupVolume/setRelativeVolume` only clamps to 0-100.

**Conclusion: the volume cap must live in your controller.** This is precisely what
Music Assistant's `max_volume` + `_enforce_volume_limits()` does (§6.2), and it is a
strong argument for using MA rather than hand-rolling SOAP: you would otherwise have to
build the clamp-and-re-clamp loop yourself.

### 5.6 node-sonos-http-api in 2026: dormant, not dead

https://github.com/jishi/node-sonos-http-api

| Metric | Value |
|---|---|
| Last commit to `master` | **2025-03-22** ("fix: Stop using keep-alive for http request") |
| Latest tag | **v1.4.3, 2017-08-06** (package.json says 1.7.0, never tagged) |
| Open issues / PRs | 176 / 22 |
| Archived? | No. 1 961 stars |
| `engines` | `"node": ">=4 <23"` — never updated for Node 23/24 |

It still works on S2: the README carries the unchanged 2020 line *"The Sonos S2 update,
released June 2020, still works with this API. However, it might break in the future if
and when Sonos decide to drop UPnP as the control protocol."* 2026 issues show people
running it. The underlying `jishi/node-sonos-discovery` is worse — roughly one commit in
six years.

More active forks: **TMA84/node-sonos-http-api** (last commit **2026-08-05**, v2.2.7 —
ESM, Node ≥18, vendored discovery, Swagger UI at `/docs`, multi-arch Docker) is the best
modernisation; also `RhombusSystems` (2026-07-29) and `norman-albusberger` (2026-07-25).

Library landscape: **SoCo** v0.31.2 (released **2026-07-29**, added Arc Ultra support) is
the healthiest; `svrooij/node-sonos-ts` is active but npm `latest` is still 2.5.0 from
2022; `bencevans/node-sonos` is mostly Dependabot.

SoCo's README carries a warning that matters: *"Sonos has changed the way music service
authentication works, and a number of streaming services currently have known issues or
cannot be used at all"* (Apple Music, Amazon, Spotify, Napster named)
(https://github.com/SoCo/SoCo/blob/master/README.rst). Transport, volume, grouping and
playing-your-own-URLs are fine; it is *streaming-service* playback over UPnP that is
fragile — which a self-hosted stream server sidesteps entirely.

### 5.7 The 2024-2026 lockdown story — read this before committing

**Sonos has never removed or authenticated the port-1400 UPnP API. But in July 2025 it
shipped user-facing kill switches, and one of them broke things.**

Firmware **85.0-66270 (2025-07-08)** release note: *"Introduction of additional security
controls"*
(https://support.sonos.com/en-us/article/release-notes-sonos-system-updates). It added
**Account → Legal and Privacy → Privacy & Security → Connection Security**. The current
support article (https://support.sonos.com/en-us/article/adjust-connection-security-settings)
reads verbatim:

> ***Authentication**: This applies to third-party integrations that use Sonos cloud and
> Local Area Network (LAN) APIs, requiring them to authenticate. This includes control
> integrations from partners like Control4 and Lutron, as well as Direct Control
> integrations and connectivity via AirPlay. **The default setting for Authentication is
> OFF.***
>
> ***UPnP**: This pertains to integrations that utilize the **unsupported UPnP
> protocol**. Note that turning this setting off will also prevent the Sonos app for
> macOS and Windows from controlling your system. **The default setting for UPnP is ON.***
>
> ***Guest access**: … **The default setting for Guest Access is ON.***

**Both of the local paths this project depends on are now behind a user-visible toggle.**
The Authentication switch explicitly names *LAN APIs* — that is the 1443 websocket MA
uses, currently accepting a placeholder key.

What actually broke, late 2025: the UPnP default appeared to flip off. Home Assistant
users hit `403 Forbidden` on `http://<ip>:1400/DeviceProperties/Control`
(https://github.com/home-assistant/core/issues/151258, 2025-08-27;
also #154877, #156328). HA's docs PR merged 2025-12-09
(https://github.com/home-assistant/home-assistant.io/pull/42467) states: **"A recent
change to the Sonos firmware is causing UPnP to be disabled by default causing the
integration to fail"**, and added a prerequisite telling users to enable it. HA then
shipped a repair issue (https://github.com/home-assistant/core/pull/159330, merged
2025-12-23) whose code comment reads *"When UPnP is disabled, Sonos returns HTTP 403
Forbidden error."*

**Discrepancy, flagged:** Sonos' support article as fetched today still says *"The default
setting for UPnP is ON."* HA says a firmware change made it default off. Which firmware,
and whether Sonos reverted, is **UNVERIFIED**. Design for both.

**2026 has been quiet.** The full label-filtered list of `integration: sonos` issues
created since 2026-01-01 (35 issues,
https://github.com/home-assistant/core/issues?q=is%3Aissue+label%3A%22integration%3A+sonos%22+created%3A%3E2026-01-01)
contains **zero** reports of authentication, tokens, 403s or loss of local control — just
ordinary bugs. SoCo's tracker since 2025-01-01 (43 items) likewise has no report of
firmware blocking port-1400 SOAP or GENA. And the **2024 app-rewrite fallout on
third-party local control appears to be nil**: the 52 Sonos-titled HA issues from
2024-05-01 to 2024-12-31 are routine, with the scariest title resolving to "host
unreachable".

Latest firmware noted: **97.1-80312 (2026-09-08)**; **94.1-76070 (2026-04-14)**
introduced a "Minimum app version requirement".

### 5.8 Playing an arbitrary HTTP URL

URI-prefix semantics, from SoCo's `play_uri` docstring
(https://github.com/SoCo/SoCo/blob/master/soco/core.py):

- **Track format** (seek, duration, next/prev): `http:`, `https:`, `x-file-cifs:`,
  `aac:`, `x-sonos-http:`.
- **Radio format** (no seek): `x-sonosapi-stream:`, `x-sonosapi-radio:`,
  `x-rincon-mp3radio:`, `hls-radio:`.
- Sonos stopped accepting ordinary `http:`/`https:` for *radio stations*; SoCo's
  `force_radio=True` just rewrites the prefix to `x-rincon-mp3radio:`. Radio URIs need at
  least a `<dc:title>` in the DIDL metadata or they will not play.

**Codecs and transport** (https://docs.sonos.com/docs/supported-audio-formats): AAC-LC /
HE-AAC, FLAC, MP3, Ogg Vorbis, WMA — **8-48 kHz, no 96/192 kHz**, over HTTP and HTTPS.
*"Sonos players support audio at any bitrate that you send."* VBR MP3 needs a Xing TOC
header or scrubbing breaks. WAV/ALAC are not in the table for direct HTTP URIs
(**UNVERIFIED**).

**HTTP server requirements** (https://docs.sonos.com/docs/playback-on-sonos) — these are
the ones people get wrong:

- Sonos uses *"repeated HTTP GET requests"* and buffers as needed rather than caching the
  whole file.
- Responses need `200`, `Content-Type`, `Accept-Ranges: bytes` and — verbatim — *"your
  service **must** return an accurate `Content-Length` HTTP header. Sonos requires this
  to support seeking."*
- **Range requests are effectively mandatory**: on seek/resume Sonos sends
  `Range: 3480315-` and expects `206 Partial Content` with `Content-Range`.
- *"Don't force needless redirects to obtain a streaming URI."*
- **Chunked transfer-encoding: UNVERIFIED** — never mentioned, and the seeking
  requirement implies a real `Content-Length`. Assume it does not work for seekable tracks.
- **HTTPS: use plain `http://` on the LAN.** HTTPS is listed, but that is for partner
  services with CA-signed certificates; a self-signed cert on your laptop will almost
  certainly fail.

The nicer path — and the one MA uses — is `playbackSession.loadCloudQueue` over the local
websocket, pointing the speaker at a Cloud Queue API endpoint you host yourself
(https://docs.sonos.com/reference/about-cloud-queue-api). Note that `app_id` is a
free-form reverse-DNS string with no registration required. One-shot overlays use
`audioClip:1 / loadAudioClip` (https://docs.sonos.com/reference/audioclip-loadaudioclip-playerid),
which ducks the music and restores volume afterwards — check
`"AUDIO_CLIP" in player["capabilities"]` first.

### 5.9 Detecting "someone grabbed the speaker" at the protocol level

**UPnP GENA**: `SUBSCRIBE` to an event URL with a `CALLBACK: <http://your-host:PORT/>`
header — the speaker must be able to reach *your* listener. SoCo uses `Second-1200` with
auto-renew.

- **`/ZoneGroupTopology/Event`** — evented: `ZoneGroupState`, `ZoneGroupID`,
  `ZoneGroupName`, `ZonePlayerUUIDsInGroup`, `MuseHouseholdId`. This is the grouping
  signal.
- **`/MediaRenderer/AVTransport/Event`** — only `LastChange` is evented; everything else
  is inside its embedded XML: `TransportState`, `AVTransportURI`,
  `EnqueuedTransportURI`, `CurrentTrackURI`, `CurrentPlayMode`, `QueueUpdateID`, and the
  two that directly answer your question — **`DirectControlClientID`** (*which* client
  took over), **`DirectControlIsSuspended`**, and **`MuseSessions`** (the LAN-API
  sessions currently held). `AVTransport.EndDirectControlSession(InstanceID)` forcibly
  reclaims.
- **`/MediaRenderer/RenderingControl/Event`** — `LastChange` carries `Volume`, `Mute`,
  `VolumeDB`. **This is the volume-cap enforcement hook.**
- **`/MediaRenderer/GroupRenderingControl/Event`** — `GroupVolume`, `GroupMute`,
  `GroupVolumeChangeable`, natively evented with no `LastChange` unwrapping.

(All from https://sonos.svrooij.io/services/ .)

**Local websocket eventing** gives a cleaner signal:
`playbackSession / sessionError`
(https://docs.sonos.com/reference/playbacksession-sessionerror) defines
**`ERROR_SESSION_EVICTED`** — *"the session ended and your app was kicked out. This can
occur if another app created a new session or if your app selected a different playback
source. Sonos delivers this error to all subscribers of the existing session."* That is
exactly the "someone grabbed the speaker" event, with an example payload of
`{"errorCode": "ERROR_SESSION_EVICTED", "reason": "Another user joined the session."}`.
Also `ERROR_SESSION_IN_PROGRESS` when you cannot establish a session because something
else is playing.

### 5.10 Home Assistant's Sonos integration uses SoCo/UPnP, not the cloud

From the manifest
(https://github.com/home-assistant/core/blob/dev/homeassistant/components/sonos/manifest.json):
`"iot_class": "local_push"`, `"requirements": ["defusedxml==0.7.1", "soco==0.31.2",
"sonos-websocket==0.2.0"]`, SSDP `ZonePlayer:1`, zeroconf `_sonos._tcp.local.` The
config flow is a bare `DiscoveryFlowHandler` with **no credential steps at all** — cloud
auth is never involved. `sonos-websocket` is used only for audio clips / announce.

GENA subscriptions cover `alarmClock, avTransport, contentDirectory, deviceProperties,
renderingControl, zoneGroupTopology` with a 1200-second timeout
(https://github.com/home-assistant/core/blob/dev/homeassistant/components/sonos/speaker.py).
Notably **`GroupRenderingControl` is not subscribed** — HA's group volume is computed,
not native, and three community PRs to add it were closed unmerged. Supported features
include `GROUPING`, `VOLUME_SET`, `PLAY_MEDIA`, `MEDIA_ANNOUNCE`, `MEDIA_ENQUEUE`,
`SEARCH_MEDIA`, `BROWSE_MEDIA`, `SEEK`, `SHUFFLE_SET`, `REPEAT_SET`. Arbitrary HTTP URLs
work: *"Direct HTTP/HTTPS links to local or remote media files can also be used if the
Sonos device can reach the URI directly."* TTS/announce requires TCP 1443 on each speaker.

---

## 6. The kid's-room speaker scenario

The problem: a UI running in the living room must make music come out of a speaker in
another room, stay correct when someone else grabs that speaker from the Sonos app, and
never get loud enough to hurt a 4-year-old.

### 6.1 Targeting a remote speaker is trivial — that's the whole point of the design

In MA, `queue_id == player_id`. Playing an album on the kid's speaker from a UI anywhere
on the LAN is a single command:

```json
{"command": "player_queues/play_media", "message_id": "1",
 "args": {"queue_id": "<kid-room player_id>", "media": "<album uri>", "option": "replace"}}
```

There is no "select output device" state to keep in sync, and nothing routes audio
through the laptop's soundcard. Enumerate speakers once with `players/all`
(https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/players/controller.py)
and hard-code the kid's `player_id` in the kiosk config.

### 6.2 Volume safety — this is a real, built-in feature, not a workaround

MA has per-player `min_volume` / `max_volume` config entries, integers 0-100, category
`player_controls`, default 0/100
(https://github.com/music-assistant/server/blob/dev/music_assistant/constants.py). They
are marked `advanced=True`, so they live under the player's advanced settings.

Critically, MA does not merely clamp *its own* commands. `_enforce_volume_limits()`
re-clamps volume that was **changed externally** — i.e. from the Sonos app, or the
buttons on the speaker itself:

> *"Clamp device volume to min/max range when changed externally. […] a device volume
> outside the configured range surfaces here as a value outside 0-100 […] correct via
> the regular volume-set path so scaling and redirection apply."*
> (https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/players/controller.py)

It is invoked from the player state-update path, so any out-of-range volume gets pulled
back automatically. Setting `max_volume` on the kid's speaker is therefore a genuine
hearing-safety cap that survives the Sonos app, not just a UI restriction. MA also
validates `min_volume <= max_volume` in `on_player_config_change` and raises
`InvalidDataError` otherwise.

**Do not rely on this as the only protection** — it is a corrective loop, not a hardware
limiter, so there is a brief window at the higher volume before it snaps back, and it
does nothing if MA is offline. Set a conservative `max_volume` *and* keep the kiosk UI's
own volume control capped lower still.

### 6.3 Detecting and recovering when someone else grabs the speaker

MA models external control as first-class state rather than as an error. On the
`PLAYER_UPDATED` event, each player carries
(https://github.com/music-assistant/frontend/blob/main/src/plugins/api/interfaces.ts):

| Field | Meaning for recovery |
|---|---|
| `active_source` | *"id of the source the player is currently playing — its own queue_id for Music Assistant playback, or an external source id"*. If it is not the player's own `queue_id`, something else owns the speaker. |
| `synced_to` | non-null ⇒ this speaker is a **passive member** of another speaker's group; it will refuse play/pause/stop. |
| `active_group` | the group player it currently belongs to. |
| `group_members` | who is grouped to it when it *is* the coordinator. |
| `powered`, `playback_state`, `volume_level` | the obvious ones. |

For a Sonos speaker, the external source ids MA can report are enumerated in
`PLAYER_SOURCE_MAP`: `line_in`, `tv`, `airplay`, `spotify`, `radio`, plus `unknown`
(https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/const.py).
`airplay`, `spotify` and `radio` are flagged `passive=True` — MA can pause/skip them but
did not start them.

The failure mode you must handle: if someone grouped the kid's speaker into the living
room from the Sonos app, `synced_to` is set, `client.player.is_passive` is true, and
`play_media` raises `PlayerCommandFailed` with translation key
`player_synced_cannot_play`
(https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/player.py).
The same guard silently ignores `stop` and `pause` with *"Player is synced to another
player."*

**The pattern that works:**

1. Keep a persistent `/ws` connection and maintain a local player-state map from
   `PLAYER_UPDATED` events. Never poll.
2. Before playing, check `synced_to`/`active_group` on the target. If it is non-null,
   call `players/cmd/ungroup` (or `players/cmd/set_members` with
   `player_ids_to_remove`) on it *first*, then `player_queues/play_media`. Ungrouping
   maps straight onto the Sonos `groups` namespace via
   `SonosGroup.modify_group_members`
   (https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonos/player.py).
3. If `active_source` is an external id (`spotify`, `airplay`, `radio`, `line_in`,
   `unknown`), just issue `play_media` anyway — it resets the Sonos session
   (`self.group_controller.active_session_id = None`) and takes the speaker back.
4. Treat `PlayerCommandFailed` as "retry once after ungrouping", not as a fatal error.
   For a 4-year-old's UI this should be silent: one retry, then a friendly "the speaker
   is busy" card.
5. MA sets a 60-second `EXTERNAL_PAUSE_IDLE_TIMEOUT` on the Sonos player
   (https://github.com/music-assistant/server/blob/dev/music_assistant/constants.py),
   after which a paused external source is no longer presented as resumable and normal
   queue handling resumes. So an abandoned Sonos-app session self-heals in a minute.
6. `player_queues/transfer(source_queue_id, target_queue_id, auto_play)` moves a whole
   queue between speakers — this is the "follow me to the bedroom" button, and
   `auto_play` defaults to whether the source was playing
   (https://github.com/music-assistant/server/blob/dev/music_assistant/controllers/player_queues/controller.py).

### 6.4 Kiosk hardening notes

- Give the kiosk its own MA user. Guest is read-only but **cannot hold a long-lived
  token** (§1.4), so create a normal user and, if you want it locked down, a custom role
  via `auth/role/create` granting only `library.read` + `queues.control` +
  `players.control`. No `library.manage`, no `users.*`, no config scopes — then a
  4-year-old mashing the screen cannot delete the library.
- The token expires in 365 days. Put a calendar reminder or have the kiosk surface a
  warning when `auth/tokens` shows the expiry approaching.
- MA's `/info` endpoint is unauthenticated and returns `schema_version` — use it as the
  kiosk's health check and version guard.
- Host networking is mandatory for the Docker container (§1.1); the Sonos speakers must
  be able to reach the laptop's stream server on TCP 8097, so don't put the laptop on a
  guest VLAN or behind a firewall that blocks inbound.
- **The laptop must stay awake.** MA is in the audio path (§2.3). Disable suspend, and
  consider that a dying laptop battery is now a music-stops-mid-song failure.

---

## 7. Recommended stack

### Primary: Music Assistant (standalone Docker) → native Sonos provider, custom HTML UI on MA's own API

```
Old Linux laptop
├── Docker: ghcr.io/music-assistant/server   (--network host, :8095 UI/API, :8097 streams)
│     ├── Qobuz provider              → quality set to "6" (CD 44.1/16)
│     ├── Filesystem SMB/NFS provider → the NAS
│     └── Sonos (S2) player provider  → local WS :1443 + self-hosted cloud queue
└── Kiosk browser, fullscreen
      └── your HTML app → ws://localhost:8095/ws  (bearer: long-lived token)
                        → http://localhost:8095/imageproxy/<id>?size=512
```

**Why this and not anything else.** It is the only stack where every requirement is a
first-party feature rather than a bridge you maintain: a genuinely merged and
de-duplicated Qobuz + NAS library (§1.5), a native LAN-local Sonos provider needing no
cloud, no port-forwarding, no public HTTPS endpoint and no Sonos developer registration
(§2.2), a documented token-authenticated API with a generated OpenAPI spec served by your
own box (§1.2), and — the one that matters most for a 4-year-old — a **per-player
`max_volume` that MA re-clamps when someone changes it externally** (§6.2). Nothing in
the Sonos protocol offers a volume cap (§5.5), so building direct-to-SOAP would mean
writing that safety loop yourself.

**Concrete setup decisions:**

1. Set the Qobuz provider's quality to **`6` (CD 44.1/16)**. Sonos cannot exceed 48 kHz
   (§2.4, §3.5), so hi-res buys nothing and costs the old laptop a resample per stream.
2. Register **your own Qobuz `app_id`/`app_secret`** and set `MASS_APP_VAR_QOBUZ_APP_ID` /
   `MASS_APP_VAR_QOBUZ_APP_SECRET` — MA's maintainers explicitly ask for this (§3.3), and
   it removes your dependence on a shared credential that could be revoked for everyone at
   once. *Caveat: with the developer program gone (§3.1), obtaining your own may no longer
   be possible.* If it isn't, accept the shared-credential risk knowingly.
3. Create a **dedicated non-Admin MA user** with a custom role granting only
   `library.read` + `queues.control` + `players.control` (§6.4). Guests cannot hold
   long-lived tokens.
4. Set `min_volume`/`max_volume` on the kid's speaker, and cap the kiosk UI's own slider
   below that.
5. **Diary note: the long-lived token expires in 365 days** (§1.4). This will otherwise
   fail silently a year from now.
6. Write ~150 lines of TypeScript against `/api-docs/openapi.json`. Do **not** vendor the
   frontend's 6 000-line Vue-coupled API plugin, and note there is **no official JS/TS
   client** — `music-assistant/client` is Python (§1.6).

**Risks, honestly stated:**

| Risk | Severity | Mitigation |
|---|---|---|
| **Sonos gates the LAN API.** Sonos says *"The Control API on the LAN is not available for wide release"*, its Platform ToS §2(b) licenses LAN APIs *"solely for internal evaluation and testing"*, and the July 2025 Connection Security "Authentication" toggle explicitly covers LAN APIs (§2.6, §5.7). MA currently authenticates with a placeholder UUID. | **High impact, unknown probability.** The single biggest risk in this plan. | Fallback ladder: native S2 → AirPlay output → S1/UPnP. **Check the kid's speaker is on Sonos' AirPlay 2 list before committing** — Play:1, Play:3, Play:5 Gen 1, Connect and Connect:Amp are not. |
| **Qobuz breaks or throttles the shared credentials.** Undocumented API, ToU breach, 2 req/s shared across all MA users (§3.2, §3.3). | Medium — historically it recovers within days. | Own credentials if obtainable; keep NAS files as the floor so the kiosk still works when Qobuz is down. |
| **MA is in the audio path** (§2.3). Laptop sleeps or dies → music stops mid-song. | Medium, certain to happen once. | Disable suspend and lid-close sleep. Prefer mains power. |
| **Cloud-queue reliability bugs.** September 2026 alone fixed "Sonos cutting out a couple of tracks in", "stale next track after you change the queue", "keep Sonos playing an album of short tracks". | Low-medium — actively fixed, zero open Sonos issues on the tracker as of 2026-09-18. | Track stable releases; MA ships nightlies. |
| **Pause is really stop+resume** on Sonos (§2.5), and **crossfade is broken on lossless output**. | Low, cosmetic. | Leave crossfade off. |
| **API drift.** `API_SCHEMA_VERSION` is 77 against a floor of 28 (§1.7). | Low. | Parse leniently; check `schema_version` from `/info` at startup and fail loudly. |

### Fallback: Lyrion Music Server + official Qobuz plugin + UPnP/DLNA Bridge

Pick this if the MA→Sonos path breaks, or if you would rather bet on a fifteen-year-old
Perl codebase than a fast-moving Python one.

- Qobuz is a **first-party plugin** in the LMS-Community org that imports into *My Music*
  alongside NAS files via the `OnlineLibrary` mechanism, so one `albums` query returns
  both (§4). It supports **full hi-res**, and its `canDirectStreamSong` hands an unsynced
  player the signed Qobuz CDN URL directly (§3.6) — no server in the audio path, which is
  strictly better than MA's architecture. (Sonos still caps at 48 kHz, so the hi-res
  advantage only materialises on non-Sonos players.)
- Sonos arrives via philippe44's **UPnP/DLNA Bridge**, listed in the official plugin
  repository with ~2 600-3 700 installations and ~25 Sonos-specific CHANGELOG entries;
  **UPnPBridge 3.4.7, 2026-09-06** (§4).
- The API is arguably nicer than MA's: JSON-RPC at `/jsonrpc.js` **plus CometD push**, so
  live now-playing without polling (https://lyrion.org/reference/cli/using-the-cli/).

**Risks:** the Sonos leg is a **single-maintainer C helper binary** whose GitHub Releases
tab has been stale since 2016 (real builds ship from SourceForge); the cover-art URL
template is not documented anywhere (**UNVERIFIED**); the Qobuz plugin has **no LICENSE
file**; and it rides UPnP — which Sonos' own support page now calls *"the unsupported UPnP
protocol"* and which already defaulted to *off* once, in late 2025 (§5.7). You would also
have to implement the per-player volume cap yourself.

### Explicitly rejected, and why

- **Sonos' own APIs as the backend.** The cloud Control API needs OAuth, a publicly
  routable HTTPS redirect and internet connectivity, `loadStreamUrl` *"cannot… send an
  on-demand track"*, and the favourites route caps at **70 items** with **no API to create
  one** (§3.4, §5.2). It cannot express "browse a library of album covers".
- **SMAPI impersonation to get native Qobuz on Sonos.** Greenfield (no OSS library
  implements Qobuz on Sonos), blocked on an encrypted service token you cannot read,
  carrying a documented one-shot-per-household re-authentication hazard, breaching both
  vendors' terms — and **capped at 48 kHz anyway**, which is exactly what MA already gives
  you (§3.4, §3.5). There is no upside.
- **Navidrome + bonob.** Requires exposing a public HTTPS:443 endpoint for S2, per bonob's
  own README (§4). Wrong trade for a child's device, and no Qobuz.
- **Plexamp, OwnTone, MPD, Mopidy.** No usable merged Qobuz browse (§4).
- **Snapcast.** Sonos cannot run a Snapcast client; the request has been open since 2020
  (§4).
- **Roon.** Works, and has since 2017 — but $14.99/month or $829.99, wants an
  Ivy-Bridge-or-newer machine with an SSD, and its third-party API is a beta-badged Node
  WebSocket library whose browse module has not been touched since 2018 (§4).

### The one thing to check before you build anything

**Which exact Sonos model is in the kid's room?** If it is a Play:1 or Play:3 it is
missing AirPlay 2 (removing the fallback), is in MA's `NON_HIRES_MODELS` list (16-bit
only), is excluded from native announcements, and appears by name in MA's documented
"may need Queue Flow Mode" workaround (§2.4, §2.5). That single fact changes how much
margin this plan has.
