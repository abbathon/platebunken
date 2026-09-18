# 03 — Discovery, Similarity and Content Filtering

**Research date: 2026-09-18.** Every factual claim below carries a link to a primary source
(official API docs, vendor newsroom, standards-body schema, or the actual source code).
Claims I could not verify live on this date are explicitly marked **UNVERIFIED**.

Scope: a curated music-discovery appliance for a 4-year-old. Parent seeds artists
(heavy metal, Norwegian hip-hop) → system proposes similar artists/albums into a parent
review queue → approved albums become permanent files on a NAS. Sources: Qobuz + local NAS,
playback via Music Assistant.

> **Live-test note.** Where I write "verified live", I issued the actual HTTP request from
> this machine on 2026-09-18 and am quoting the real response.

---

## 1. Similar-artist / recommendation data sources in 2026

### 1.1 Summary table

| Source | Free | Key needed | Rate limit | Licence | Metal | Norwegian rap | Verdict |
|---|---|---|---|---|---|---|---|
| **ListenBrainz Labs `similar-artists`** | Yes | **No** | 1 req/s guidance | Open data (MetaBrainz) | Very good | Fair | **Build on this** |
| **Last.fm `artist.getSimilar`** | Yes | Yes (free, self-serve) | Undisclosed | Non-commercial only, 100 MB cache cap | Excellent | Good | **Build on this** |
| **Deezer `/artist/{id}/related`** | Yes | **No** | Undocumented; no rate headers seen | Unclear/no public ToS for open endpoints | Excellent | Good | Strong free third leg |
| **MusicBrainz** | Yes | No | 1 req/s per client | CC0 core | Identity, not similarity | Identity, not similarity | Mandatory as the ID spine |
| **Qobuz (unofficial API)** | With subscription | App ID/secret (scraped) | 429 with `Retry-After` | No public API terms | Excellent | Excellent | Catalogue + availability, not discovery |
| **Spotify Web API** | — | — | — | — | — | — | **Dead for this use case** (§1.5) |
| **Discogs** | Yes | Token recommended | **25/min unauth (verified live)** | Non-commercial | Excellent (styles) | Good | Corroboration + label data |
| **AcousticBrainz** | Yes | No | — | CC0 | Frozen 2022 data | Frozen | Legacy only |
| **Music Assistant Sonic Analysis (CLAP, local)** | Yes | No | Local CPU | Open source | Audio-based | Audio-based | Best *local* similarity |

### 1.2 Last.fm — alive, open, and still the best folksonomy for metal

`artist.getSimilar` is documented and live: parameters `artist` (required unless `mbid`),
`mbid`, `limit`, `autocorrect`, and `api_key` (required), returning a match score 0–1
([Last.fm API docs](https://www.last.fm/api/show/artist.getSimilar)). `tag.getTopArtists`
sits in the same family ([API index](https://www.last.fm/api)).

Verified live on 2026-09-18: `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=Sabaton&format=json`
returns `{"message":"Invalid parameters - Your request is missing a required parameter","error":6}`
with HTTP 400 — i.e. the endpoint is routed and serving, it just wants the key. The signup
page `https://www.last.fm/api/account/create` returns HTTP 200. The API page states
["Our API is available to anyone"](https://www.last.fm/api). **Registration is open in 2026.**

Terms that matter for this project ([Last.fm API Terms of Service](https://www.last.fm/api/tos)):
- Non-commercial by default: *"Any use by You of the Last.fm Data for commercial purposes
  without obtaining a commercial use agreement constitutes a material breach."* A home
  appliance is fine.
- **Storage cap:** *"The 'Reasonable Usage Cap' is a maximum of 100 MB."* This is the real
  constraint — you may cache similarity edges for your seed artists, not mirror the graph.
- No numeric rate limit is published; the ToS only says Last.fm *"sets and enforces limits
  on use of the API to prevent abuse."* Treat it as ~1–5 req/s and cache aggressively.
- Attribution/link-back is required.

**Coverage:** Last.fm's tag pages for `black metal`, `power metal`, `norsk hiphop` and
`norwegian hip-hop` all return HTTP 200 (verified live), so Norwegian-language folksonomy
tags exist. Metal coverage is the best of any free source because Last.fm's scrobbling base
has always skewed metal-heavy.

**Music Assistant already does this for you.** MA ships a first-party metadata provider
`lastfm_recommendations` — *"Get music recommendations from Last.fm based on your listening
history"*, stage `stable`
([manifest.json](https://github.com/music-assistant/server/blob/dev/music_assistant/providers/lastfm_recommendations/manifest.json)).
Its source calls `self.api.get_similar_artists(artist.name, artist_mbid, limit)` and prefers
the MusicBrainz artist ID (`artist.get_external_id(ExternalID.MB_ARTIST)`) over the name
([\_\_init\_\_.py](https://github.com/music-assistant/server/blob/dev/music_assistant/providers/lastfm_recommendations/__init__.py)).
It takes a user-supplied `CONF_API_KEY`. So the "get similar artists" leg is a config step,
not a build step — **if** you are willing to let MA drive discovery rather than an external
queue service.

### 1.3 ListenBrainz — the best free, no-key, no-licence-drama option

Two different surfaces, and the distinction matters:

**(a) The main API (`api.listenbrainz.org`) now requires auth for the interesting endpoints.**
Verified live: `GET /1/explore/lb-radio?prompt=artist:(sabaton)&mode=easy` returns HTTP 401
with the body:

> `{"code":401,"error":"Due to bad actors and AI scrapers causing undue traffic on our sites, you need to provide an Auth token for this endpoint. Sorry for this mess."}`

`GET /1/metadata/lookup/` likewise returns `401 You need to provide an Authorization header.`
Tokens are free from a ListenBrainz account and go in `Authorization: Token <token>`; the docs
require a valid `User-Agent` and state clients must *"never make more than ONE call per second"*,
with `X-RateLimit-*` headers and 429s
([ListenBrainz API docs](https://listenbrainz.readthedocs.io/en/latest/users/api/index.html)).

**(b) The Labs datasets API (`labs.api.listenbrainz.org`) is still fully open — no key.**
It hosts `similar-artists`, `similar-recordings` and `mlhd-similar-recordings`
([Labs API index](https://labs.api.listenbrainz.org/)). Verified live on 2026-09-18:

```
GET https://labs.api.listenbrainz.org/similar-artists/json
    ?artist_mbids=39a31de6-763d-48b6-a45c-f7cfad58ffd8   # Sabaton
    &algorithm=session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30
→ 200, ~21 KB JSON
[{"artist_mbid":"3ef77bdc-...","name":"Powerwolf","score":1890,...},
 {"name":"Nightwish","score":1764,...},{"name":"HammerFall","score":1716,...},
 {"name":"Iron Maiden",...}]
```

That is a genuinely good metal neighbourhood, returned keyed by MBID, with no API key and no
non-commercial clause. Note the `algorithm` parameter is **mandatory and undocumented in prose**
— you must copy the exact algorithm string (the Labs web UI for each endpoint exposes it). Also
note the gotcha I hit: pass a wrong MBID and you get `[]`, not an error, so always resolve the
MBID through MusicBrainz first.

Licensing: ListenBrainz is a MetaBrainz project; MusicBrainz core data is CC0 and supplementary
data is CC BY-NC-SA 3.0 ([MusicBrainz data licence](https://musicbrainz.org/doc/About/Data_License)).
The exact licence string for the derived similarity dumps is **UNVERIFIED** — I could not find a
per-dataset licence statement on the Labs index page. For a household appliance this is moot.

### 1.4 MusicBrainz — identity spine, not a similarity engine

MusicBrainz gives you stable MBIDs, artist relationships, area/country, and user tags/genres.
Verified live:

```
GET /ws/2/artist/?query=artist:Sabaton&fmt=json&limit=1
→ 39a31de6-763d-48b6-a45c-f7cfad58ffd8, Sabaton, country SE,
  tags: heavy metal, swedish, metal, sweden, power metal, speed metal, history, pop metal

GET /ws/2/artist/?query=artist:Karpe AND country:NO&fmt=json
→ 7d809463-4fc4-4042-8b51-5e2e87a93dc5, Karpe, country NO, tags: rap, hip-hop
```

Two things to notice. First, `country: NO` is a **reliable, free, structured filter for
"Norwegian"** — far better than trusting a `norsk hiphop` tag. Second, the tag depth for
Norwegian rap is thin (`rap`, `hip-hop` only) compared to metal (8 tags for Sabaton). So:
**use MB for identity, nationality and disambiguation; do not expect it to rank similarity.**
Its relationship graph (member-of, collaborated-with, same-label) is useful as a *secondary*
signal — "bands sharing a member with a seed" is a high-precision, low-recall suggestion source.

Rate limit: the docs state that if your rate is too high *"all your requests will be declined
(http 503)… Currently that rate is (on average) 1 request per second"*, plus a global
service-wide cap of *"300 requests each second"*, and a mandatory contactable `User-Agent`
of the form `Application name/<version> ( contact-url )`
([Rate Limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)).

### 1.5 Spotify Web API — confirmed dead for this use case

Your recollection is correct and I verified the primary source. Spotify's post
[Introducing some changes to our Web API (2024-11-27)](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
restricts, **effective that date**:

1. Related Artists
2. Recommendations
3. Audio Features
4. Audio Analysis
5. Get Featured Playlists
6. Get Category's Playlists
7. 30-second preview URLs (in multi-get responses)
8. Algorithmic and Spotify-owned editorial playlists

The rule: *"New apps that are registered on or after today's date"* and *"existing apps that
are still in development mode without a pending extension request"* cannot access them, while
*"applications with existing extended mode Web API access that were relying on these endpoints
remain unaffected."*

**Concretely for you in 2026:** any API key you register today is a new app in development
mode. `GET /v1/recommendations` and `GET /v1/artists/{id}/related-artists` are unavailable to
it, and extended quota mode is granted to commercial integrations, not hobby projects. There is
no path. **Do not design around Spotify.** (Whether Spotify has since relaxed this is
**UNVERIFIED** — the 2024 post is still the standing published policy and I found no retraction.)

### 1.6 Qobuz — great catalogue, no usable public discovery API

There is **no public Qobuz developer API in 2026**. `https://github.com/Qobuz/api-documentation`
returns 404 (verified live). All open-source clients, Music Assistant included, use the
undocumented `api.json/0.2` endpoints with a scraped app ID and MD5-signed requests.

What Music Assistant's provider actually calls, from
[`music_assistant/providers/qobuz/__init__.py`](https://github.com/music-assistant/server/blob/dev/music_assistant/providers/qobuz/__init__.py):
`catalog/search`, `artist/get`, `album/get`, `track/get`, `playlist/*`, `favorite/*`,
`track/getFileUrl`, `track/reportStreamingStart|End`, `user/login` — against
`https://www.qobuz.com/api.json/0.2/{endpoint}` with an `X-App-Id` header, `X-User-Auth-Token`,
and for signed calls an MD5 of `endpoint + sorted params + request_ts + app_secret`. It handles
HTTP 429 with `Retry-After`. **There is no similar-artists or recommendations call in the MA
provider.**

The Qobuz *website* does have discovery: the Sabaton artist page shows a "Similar artists"
section listing 50+ bands including Blind Guardian, HammerFall, Powerwolf and Nightwish
([qobuz.com Sabaton page](https://www.qobuz.com/us-en/interpreter/sabaton/download-streaming-albums)),
so a backend capability exists. I attempted to probe endpoint names directly:
`GET /api.json/0.2/artist/getSimilarArtists?artist_id=26887` returns
`{"status":"error","code":400,"message":"Invalid or missing app_id parameter"}` — **but so does
a deliberately nonsensical endpoint name**, because the app_id check runs before routing. So the
exact endpoint name is **UNVERIFIED**. Treat Qobuz as: *catalogue lookup, availability check and
playback* — not as your recommender.

### 1.7 Deezer — the surprise winner on effort-to-quality

Verified live, no key, no auth, no registration:

```
GET https://api.deezer.com/artist/12022/related?limit=8        # Sabaton
→ Powerwolf, DragonForce, Wind Rose, Lordi, Nanowar of Steel,
  Gloryhammer, HammerFall, Alestorm
```

That is a better-shaped result for a *child-facing* metal list than either Last.fm or
ListenBrainz gave — it stays inside melodic/power metal instead of drifting toward extreme
subgenres. The same API resolves Norwegian rap fine (`/search/artist?q=Karpe` → id 14271403).
No `X-RateLimit-*` headers are returned (verified), and I could find no published rate-limit
figure — the developer portal at [developers.deezer.com/api](https://developers.deezer.com/api)
did not render endpoint docs or limits on fetch. Treat the quota as **UNVERIFIED** and
self-throttle to ~1 req/s. Deezer also gives you, in the same call chain, `explicit_lyrics`,
`label`, `genres`, `upc` and a 1000×1000 cover URL — see §4 and §5.

Caveat: Deezer is not a documented-stable contract. It has historically been open and
unannounced-breaking. Use it as a *corroborating* source, not a single point of failure.

### 1.8 AcousticBrainz, Essentia, and local audio similarity

**AcousticBrainz is frozen but, notably, still serving.** MetaBrainz announced on
2022-02-16 that *"In the next month or so we will stop accepting new data submissions to
AcousticBrainz"*, citing insufficient data quality, and planned a full site shutdown in
*"early 2023"*
([MetaBrainz blog](https://blog.metabrainz.org/2022/02/16/acousticbrainz-making-a-hard-decision-to-end-the-project/));
the project page states *"In 2022, the decision was made to stop collecting data. For now, the
website and its API will continue to be available"*
([MusicBrainz doc](https://musicbrainz.org/doc/AcousticBrainz)). The planned shutdown did **not**
happen — verified live on 2026-09-18, `GET https://acousticbrainz.org/api/v1/high-level?recording_ids=770cc467-...`
returns real Essentia 2.1-beta1 high-level features (danceability 0.91, etc.). So it works, but
the data is ≥4 years stale, will never cover a 2024–2026 metal release, and MetaBrainz
themselves say the accuracy is genre-inconsistent. **Do not build on it.**

**The right local option is already inside Music Assistant.** MA ships an `audio_analysis`
provider called *Sonic Analysis (on-device)* — *"Analyses how each track sounds to power
similarity, mood-based playlists, and other audio-aware features"*, requiring
`transformers`, `huggingface-hub`, `torchlibrosa`, and crediting
[Microsoft CLAP](https://github.com/microsoft/CLAP) and librosa
([manifest.json](https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonic_analysis/manifest.json)).
The source header reads *"On-device audio analysis: librosa scalars + Microsoft CLAP zero-shot,
one audio load per track"*, with a 7-second CLAP window at 44.1 kHz and fast/balanced/thorough
sampling modes (1–8 snippets per track)
([\_\_init\_\_.py](https://github.com/music-assistant/server/blob/dev/music_assistant/providers/sonic_analysis/__init__.py)).
The docs state *"Everything runs locally on the server — no audio is ever sent anywhere"*,
~300 MB of model files on first run, and that it powers a Sonic Similarity plugin providing
library-wide Similar Tracks and Endless Mix
([music-assistant.io](https://music-assistant.io/audio-analysis/sonic-analysis/)).

This is the answer to "purely local audio similarity" in 2026: **CLAP embeddings over your own
NAS library, computed by MA, no third party involved.** Its limitation is structural — it can
only find things *already in your library*, so it is the right tool for "play something like
this" and the wrong tool for "discover a band we don't own".

### 1.9 Discogs — metadata and label graph, not similarity

There is no similarity or recommendation endpoint. What you get is genres, styles, labels, year,
and a very deep metal release graph. Verified live with no token:

```
GET https://api.discogs.com/releases/1000
→ {"genres":["Electronic"],"styles":["Techno","Acid"],"year":1999},
  labels: [("Kreisel 99", 317)]
Response headers: x-discogs-ratelimit: 25, x-discogs-ratelimit-remaining: 21
```

**The unauthenticated rate limit is 25 requests/minute, confirmed from the live
`x-discogs-ratelimit` header.** (The documented authenticated limit of 60/min is **UNVERIFIED** —
`https://www.discogs.com/developers` and the ToS support article both return HTTP 403 to
non-browser clients, so I could not read the official text on this date.) Artist search works
unauthenticated (`/database/search?q=Sabaton&type=artist` → id 580793).

Discogs' value here is **`styles`** (its style vocabulary distinguishes "Black Metal",
"Power Metal", "Viking Metal", "Death Metal" far more precisely than MB genres) and
**label identity**, which is the input to §3's label filtering.

### 1.10 Recommendation: build on ListenBrainz Labs + Last.fm, with Deezer as a tiebreaker

1. **Primary: ListenBrainz Labs `similar-artists`.** No key, no non-commercial clause, no
   storage cap, MBID-native (so it joins cleanly to MusicBrainz and to beets), and it produced
   correct results live today. It is the only one of the four with no licensing friction.
2. **Secondary: Last.fm `artist.getSimilar`.** Best metal folksonomy, gives a 0–1 confidence
   score you can threshold, and Music Assistant already integrates it, so you get it nearly
   free. Accept the 100 MB cache cap and non-commercial terms.
3. **Tiebreaker / cold-start: Deezer `/artist/{id}/related`.** Zero integration cost. Use it to
   *rank* candidates — an artist appearing in two of three sources is a much stronger suggestion
   than one appearing in one.
4. **Always: MusicBrainz** to canonicalise every candidate to an MBID and to read `country`.
   An artist with no MBID is both unresolvable *and* a useful negative signal (§2).

Do **not** build on Spotify (blocked), AcousticBrainz (stale), or Qobuz (undocumented). Use
MA's Sonic Analysis for in-library "more like this", which is a different feature from discovery.

MA's provider base class already defines the right seams —
`get_similar_tracks(prov_track_id, limit)`, `get_similar_artists(prov_artist_id, limit)`,
`get_dynamic_radio_tracks(...)`, `get_recommendations()` and `get_recommendation_items(...)`
([models/music_provider.py](https://github.com/music-assistant/server/blob/dev/music_assistant/models/music_provider.py)) —
so if you ever want your curation logic to *live inside* MA rather than beside it, write a
custom provider implementing these. My recommendation is the opposite: keep the review queue
outside MA, and let MA see only approved content.

---

## 2. Detecting and excluding AI-generated music

Short version: **there is now a real metadata standard and a real detector, but neither is
available to you through a public API.** You will be doing heuristics plus a human gate.

### 2.1 The metadata standard exists: DDEX `ContainsAI` (verified in the schema)

This is the most important finding in this section, and it is fully verified against the
schema itself rather than press coverage.

DDEX's current Allowed Value Sets is **version 012, XSD published 16 September 2026**
([DDEX knowledge base — Current allowed value sets](https://kb.ddex.net/reference-material/current-allowed-value-sets/)).
Fetching [`http://ddex.net/xml/allowed-value-sets/allowed-value-sets.xsd`](http://ddex.net/xml/allowed-value-sets/allowed-value-sets.xsd)
and grepping it live gives:

```xml
<xs:simpleType name="ContainsAI">
  <xs:documentation source="ddex:Definition">A Type of contribution made by ArtificialIntelligence.</xs:documentation>
  <xs:restriction base="xs:string">
    <xs:enumeration value="All">    <!-- All content was created using GenerativeAI.        -->
    <xs:enumeration value="None">   <!-- No content was created using GenerativeAI.         -->
    <xs:enumeration value="Partly"> <!-- Part of the content was created using GenerativeAI. -->
  </xs:restriction>
</xs:simpleType>
```

And in [`http://ddex.net/xml/ern/432/release-notification.xsd`](http://ddex.net/xml/ern/432/release-notification.xsd)
(ERN 4.3.2), `ContainsAI` is an optional element on **Release**, **SoundRecording**, **Image**,
**Text** and **Video** — e.g. *"A Type of the SoundRecording indicating the contribution of
GenerativeAI"* — plus an `AiContribution` element of the same type on Contributor, documented as
*"A Type indicating the contribution of GenerativeAI. This element defaults to All if
SpecialContributor is Gener[ativeAI]…"*.

So: **AI disclosure is a real, shipped DDEX field as of 2026, at Release and per-Resource
granularity, with three values.** Governance-wise DDEX lists an *"Artificial Intelligence Ad hoc
Group (AI)"* whose mandate is *"To investigate the metadata requirements for the communication of
AI-generated music"* ([DDEX Working Groups](https://ddex.net/about-ddex/working-groups/)).
Notably, ddex.net's own press page carries **no** AI announcement, and a site search for
"artificial intelligence" returns only the working-groups page — the standard shipped quietly
inside an AVS version bump.

**The catch:** ERN is a label→DSP delivery format. `ContainsAI` travels from distributor to
Spotify/Qobuz/Deezer. It is **not** re-exposed in any consumer API. There is no ISRC-level
AI marker — ISRC is an identifier, not a content descriptor, and I found no AI extension to it
(**UNVERIFIED** that none exists, but nothing in the DDEX AVS or ERN suggests one).

### 2.2 What the DSPs actually do

**Deezer is far ahead of everyone and is the only useful primary source.**

- Deezer's detection tool launched **January 2025**; it *"tagged 13.4 million AI-generated
  tracks"* in 2025; by June 2026 it was seeing **~90,000 AI-generated tracks daily, over 50% of
  all uploads**; AI music is **1–3% of total streams**; and **up to 85% of AI-track streams were
  fraudulent** in 2025
  ([Deezer newsroom, 2026-07-21](https://newsroom-deezer.com/2026/07/ai-music-exceeds-50-percent-daily-uploads-deezer/)).
  Earlier milestone: 44% of new uploads
  ([2026-04-20](https://newsroom-deezer.com/2026/04/ai-generated-tracks-represent-44-of-new-uploaded-music/)).
- What it detects: tracks from **Suno and Udio** specifically, extensible to *"practically any
  other similar tool"* given training examples (same source).
- What Deezer does: **tags AI music in-app**; flagged tracks are *"automatically removed from
  algorithmic recommendations and are not included in editorial playlists"*; AI tracks used for
  streaming fraud, and unstreamed ones older than 6 months, get taken down.
- Since **January 2026 Deezer licenses the detection technology to the music industry**
  ([business.deezer.com/ai-detection](https://business.deezer.com/ai-detection/)).
- There is a **free public tool**: the [Deezer AI Music Detector](https://www.deezer.com/explore/ai-music-detector/),
  which scans *your playlists* across 20+ platforms including Spotify and Apple Music, claims
  99.8% accuracy, and needs no Deezer subscription
  ([2026-06-11](https://newsroom-deezer.com/2026/06/check-ai-generated-music-in-playlists-with-deezer-detector/)).

**Is the Deezer AI flag in the public API? No — and I verified this the hard way.** A live
`GET https://api.deezer.com/album/965592431` returns `explicit_lyrics`,
`explicit_content_lyrics`, `explicit_content_cover`, `label`, `genres`, `upc`, `cover_xl` — and
**no AI field**. The press materials describe an in-app tag and a B2B licence; none mentions
programmatic exposure. So the detector is reachable only as a human-driven website.

**Spotify** announced on **2025-09-25** support for *"the new industry standard for AI
disclosures in music credits, developed through DDEX"*, covering *"AI-generated vocals,
instrumentation, or post-production"*, shown in Song Credits in the mobile app, alongside a music
spam filter (*"over 75 million spammy tracks"* removed in the prior year) and a rule that
*"vocal impersonation is only allowed in music on Spotify when the impersonated artist has
authorized the usage"*
([Spotify Newsroom](https://newsroom.spotify.com/2025-09-25/spotify-strengthens-ai-protections/)).
On **2026-08-11** Spotify added an **"AI Persona" badge** for profiles that *"appear to represent
photorealistic AI-generated identities"*, applied by self-disclosure or Spotify review, shown in
profile banners, search results and track rows — and crucially, *"Spotify will not include AI
Personas in any editorial or algorithmic recommendations"*
([Spotify Newsroom](https://newsroom.spotify.com/2026-08-11/ai-persona-badges-transparency/)).
Neither announcement mentions Web API exposure, and since §1.5 locks you out of Spotify's API
anyway, this is background context, not an integration.

**Qobuz:** I found **no** Qobuz statement on AI-generated music and **no** AI field in the
`api.json/0.2` objects that Music Assistant parses — the provider maps `label`, `released_at`,
`copyright`, `description`, `parental_warning` and images, and nothing AI-related
([MA qobuz provider](https://github.com/music-assistant/server/blob/dev/music_assistant/providers/qobuz/__init__.py)).
**UNVERIFIED** whether Qobuz filters AI content editorially; their curated, hi-res-focused
catalogue is structurally less exposed to upload spam than an open distributor pipeline.

### 2.3 Open-source detectors

**SONICS** is the credible one: *"SONICS: Synthetic Or Not — Identifying Counterfeit Songs"*,
**ICLR 2025 poster**, [github.com/awsaf49/sonics](https://github.com/awsaf49/sonics),
paper [arXiv:2408.14080](https://arxiv.org/abs/2408.14080). It ships a dataset of *"over 97k
songs (4,751 hours) with over 49k synthetic songs from popular platforms like Suno and Udio"*,
a novel `SpecTTTra` architecture for long-range temporal modelling, **MIT licence** (verified:
`LICENSE` is "MIT License, Copyright (c) 2023 awsaf49"), pip-installable inference
(`pip install git+https://github.com/awsaf49/sonics.git`), pretrained
[models on Hugging Face](https://huggingface.co/collections/awsaf49/sonics-spectttra-67bb6517b3920fd18e409013)
and a [live demo Space](https://huggingface.co/spaces/awsaf49/sonics-fake-song-detection).

Deezer's own research is public and worth reading before trusting any of this:
*"AI-Generated Music Detection and its Challenges"* (Afchar, Meseguer-Brocal, Hennequin,
**ICASSP 2025**, [link](https://research.deezer.com/publication/2025/04/10/ICASSP-Afchar.html)),
*"A Fourier Explanation of AI-music Artifacts"* (**ISMIR 2025**,
[link](https://research.deezer.com/publication/2025/06/22/ismir-dafchar.html)),
*"AI-Generated Song Detection via Lyrics Transcripts"* (**ISMIR 2025**,
[link](https://research.deezer.com/publication/2025/06/22/ismir-mfrohmann.html)) and
*"Double Entendre: Robust Audio-Based AI-Generated Lyrics Detection via Multi-View Fusion"*
(**ACL 2025**, [link](https://research.deezer.com/publication/2025/06/22/acl-mfrohmann.html)).
The titles alone tell you the honest state of the art: detection works well **in-distribution**
(Suno/Udio-era artefacts) and degrades against new generators and against re-encoded audio.

**Practical verdict:** running SONICS locally on a candidate album is genuinely feasible on a
NAS-class box and is a reasonable *third* filter. It is not a reasonable *first* filter, because
you would have to download the audio before you can score it, which inverts the pipeline.

### 2.4 The heuristics that actually work

Given no API flag, rank candidates by "evidence of physical existence". Every one of these is
cheap and checkable with APIs already in your stack:

| Signal | How to check | Strength |
|---|---|---|
| **No MusicBrainz artist entry** | `/ws/2/artist/?query=…` returns nothing | Very strong. MB is editor-curated; slop artists rarely get entered. |
| **No Discogs releases** | `api.discogs.com/database/search?type=artist` then `/artists/{id}/releases` | Very strong — Discogs is physical-release-centric. |
| **No MB `country` / no area** | MB artist `country` field absent | Moderate |
| **Release cadence** | MB release-group dates: >1 album/month is not a band | Strong |
| **Label is a self-distribution shell** | Deezer/Qobuz `label` field = artist name, or a known aggregator | Moderate |
| **No live history** | Songkick/Setlist.fm has no gigs (**UNVERIFIED**: I did not test their APIs on this date) | Moderate |
| **Not in Encyclopaedia Metallum** | see §3 | Strong *for metal specifically* |
| **Label allowlist** | Nuclear Blast, Napalm, Century Media, Nordic Records, NorthSide, Tee Productions, etc. | Strongest, and trivially cheap |

**Be honest about what this buys you.** A label allowlist plus "must have an MBID and ≥2
Discogs releases" will eliminate essentially 100% of Suno/Udio slop, because that content is
uploaded through aggregators and never reaches a curated database. It will also eliminate
legitimate bedroom artists and brand-new releases — which, for a 4-year-old's library, is a
completely acceptable trade. **Your discovery source is a seed list of established bands; you do
not need the long tail.** Make the filter aggressive and let the parent override.

One thing that is *not* achievable: detecting AI-*assisted* production (AI mastering, AI-assisted
vocals) in commercially released music. DDEX's `Partly` value exists precisely because that is a
spectrum, and none of it surfaces to you. Don't try.

### 2.5 Cover art as a signal — skip it

"Stock-looking cover art" is tempting and I would not build it. Metal cover art is *already*
uncanny, airbrushed and dragon-heavy; the false-positive rate against legitimate power metal
would be absurd. If you want an image signal, the DDEX schema is telling: ERN 4.3.2 carries
`ContainsAI` on **Image** resources separately from SoundRecording — the industry itself treats
them as independent facts. You have access to neither.

---
## 3. Filtering racist / NSBM content

This is the section where the answer is least convenient: **there is no dataset to download.**
There is, however, one database with exactly the right data model, and it is queryable today.

### 3.1 Encyclopaedia Metallum has a `Themes` field, and it is the whole ballgame

Metal Archives renders `Themes:` as a first-class field on every band page. Verified live
2026-09-18: [Sabaton](https://www.metal-archives.com/bands/Sabaton/484) →
`Themes: Military history, War, Metal`; [Darkthrone](https://www.metal-archives.com/bands/Darkthrone/146) →
`Themes: Anti-religion, Satan, Occultism, Death, Rebellion, Metal`.

**There is no official API** — `/api`, `/api/v1/bands`, `/developers` and `/content/api` all
404. Neither the [FAQ](https://www.metal-archives.com/content/faq) nor the
[Rules & Guidelines](https://www.metal-archives.com/content/rules) mention "API", "scrape",
"crawl", "bot" or "automated". The FAQ's only relevant statement is
*"There is no copyright on publicly available information, and that's all we're reprinting."*
[robots.txt](https://www.metal-archives.com/robots.txt) blocks only `/affiliate/`, `/history/`,
`/report/`, `/forum/`, `/users/`, sets **`Crawl-delay: 3`**, and bans `dotbot`/`SemrushBot`.
`/search/` and `/bands/` are permitted.

The site's DataTables-backed advanced search returns clean JSON and accepts a `themes` filter.
**I re-ran this myself to confirm the subagent's numbers:**

```
GET https://www.metal-archives.com/search/ajax-advanced/searching/bands/
      ?bandName=&themes=National+Socialism&sEcho=1&iDisplayStart=0&iDisplayLength=200
→ iTotalRecords: 1256
```

Live counts on 2026-09-18: `National Socialism` **1256**, `Nationalism` 542, `Fascism` 513,
`Anti-fascism` 472, `Racism` 256, `White supremacy` 69, `Nazism` 50, `Aryan` 20,
`Anti-racism` 65. The endpoint also accepts **`bandLabelName`**, so a label → roster expansion
is a single request (`bandLabelName=Darker+Than+Black` → 102 bands).

**Critically: NSBM is not a genre on Metal Archives.** `genre=NSBM` → 0 results;
`genre=National Socialist Black Metal` → 0. (`genre=RAC` → 289; RAC = Rock Against Communism,
which *is* a real MA genre tag.) **Ideology lives in `Themes`, never in `Genre`.** Any design
that filters on genre strings catches nothing.

**Client libraries — don't trust them blindly.**
[lcharlick/python-metallum](https://github.com/lcharlick/python-metallum) (34★, MIT, last push
2024-04-20) maps search params correctly but its `band.themes` property is **broken against the
current site**: it looks up the `<dt>` label `'Lyrical themes:'` with an exact match, and MA now
renders `Themes:`, so it returns `['']`. Alternatives:
[kokodio/metallum](https://github.com/kokodio/metallum) (69★, MIT, 2026-08-23),
[Loki-Afro/metalarchives](https://github.com/Loki-Afro/metalarchives) (47★, 2023-11-14),
[lukjak/enmet](https://github.com/lukjak/enmet) (27★, no licence, 2025-02-19, has disk caching).
**Call the JSON endpoint directly with a 3-second delay.**

### 3.2 Citable watchdog and press sources

**SPLC is the strongest source and actually publishes names.**
[Active Racist Music Groups](https://www.splcenter.org/resources/reports/active-racist-music-groups/)
(Intelligence Report #157, 2015-03-03) names Tightrope, Heritage Connection, Get Some 88,
MSR Productions, **Label 56**, NSM88 Records, **Micetrap Distribution**, ISD Records, Poker Face,
Desastrious Records and Stahlhelm Records with locations. The current
[Hate Music extremist file](https://www.splcenter.org/resources/extremist-files/hate-music/)
adds KEP Productions, BeaSSt Productions, Tinnitus Records, United Riot Records, DNVF Records,
Brotherhood of Light Recordings, ISD Records/NS88 Video, Vinlandic Werwolf Distribution and
Winter Solace Productions. On **Resistance Records**, SPLC's
[1999 report](https://www.splcenter.org/resources/reports/national-alliance-leader-william-pierce-hopes-acquire-hate-label-resistance-records/)
calls it *"the nation's powerhouse distributor of racist rock"* (~50,000 CDs/year, bought by
neo-Nazi William Pierce for ~$250,000). SPLC also published
[Listening in on the NSBM Scene](https://www.splcenter.org/resources/reports/listening-national-socialist-black-metal-scene/)
(2000-12-06), naming Burzum and Absurd.

**Platform precedent.** SPLC's
[iTunes Dumps Hate Music, but Spotify and Amazon Still Selling](https://www.splcenter.org/resources/reports/itunes-dumps-hate-music-spotify-and-amazon-still-selling/)
(2015-03-09) reports iTunes removed 21 bands, naming Skrewdriver, Absurd, Bilskirnir, Arghoslent
and the Klansmen — and notes Spotify relied on **Germany's federal index of media harmful to
young persons** rather than SPLC's list.
[Digital Music News (2017-08-16)](https://www.digitalmusicnews.com/2017/08/16/spotify-remove-neo-nazi/)
covers Spotify removing many of 37 named bands within 24 hours.

**That German index is the only official, legally maintained list.** The
[BzKJ](https://www.bzkj.de/bzkj/indizierung/wie-laeuft-ein-indizierungsverfahren-ab/listenfuehrung)
maintains the *Liste jugendgefährdender Medien* under the JuSchG, split since 2021 into public
and non-public divisions, with a provider [Listenabfrage](https://www.bzkj.de/bzkj/service/formulare/listenabfrage)
form. Non-public entries are confidential by design → lookup, not bulk download.

**Investigative journalism.**
[Vice, 2024-02-12](https://www.vice.com/en/article/neo-nazi-music-shows-return-to-europe/)
documents the Call of Terror and Hot Shower festivals, calling Graveland
*"one of the stars of the international NSBM-scene"*, plus SPQR, Kataxu, Vothana, Walsung and
Seigneur Voland. [Bellingcat, 2020-01-02](https://www.bellingcat.com/news/2020/01/02/dispatches-from-asgardsrei-ukraines-annual-neo-nazi-music-festival/)
documents the Asgardsrei festival in Kyiv, naming Goatmoon, M8L8TH, Wodulf, Seigneur Voland,
Selbstmord and Sokyra Peruna, and the **Militant Zone** label run by Alexey Levkin.

**ADL** carries [Blood & Honour](https://www.adl.org/resources/hate-symbol/blood-honour) in its
Hate Symbols database but has no band-roster resource (several plausible URLs 404). ADL is for
symbols, not artists.

**Nordic sources are a gap.** [Antirasistisk Senter](https://antirasistisk.no) has no NSBM or
black-metal content (searched via its WordPress API). expo.se is Cloudflare-blocked —
**UNVERIFIED**. Teitelbaum's *Lions of the North* (OUP) — **UNVERIFIED** (blocked). The
New Yorker's "Heavy Metal Confronts Its Nazi Problem" and Rolling Stone's Vikernes piece both
returned 403/paywall — **UNVERIFIED**, though both are cited in the
[Wikipedia NSBM article](https://en.wikipedia.org/wiki/National_Socialist_black_metal), which is
the best free bibliography available.

### 3.3 Reusable blocklists: none exist. Plainly.

A systematic GitHub API sweep across `nsbm`, `nazi bands list`, `hate music dataset`,
`white power music`, `hatecore`, `antifascist list` and `extremist music` returned **nothing
usable**: `antifascist list` → 0 repos; `nsbm` → 969 repos, all of which are
[NSBM Green University](https://github.com/WasathTheekshana/nsbm-past-papers) in Sri Lanka.
**There is no maintained, licensed, machine-readable hate-music blocklist on GitHub.** That is
not an oversight — nobody wants to host a defamation surface.

The closest structural analogue that *does* exist is the AI-music blocklist ecosystem:
[Spotify-AI-Band-Blocker](https://github.com/Reginald-Gillespie/Spotify-AI-Band-Blocker)
(73★, MIT, 2026-07-29) and
[eye-wave/spotify-ai-blocklist](https://github.com/eye-wave/spotify-ai-blocklist)
(14★, GPL-3.0, 2026-08-03). Copy their *format* (JSON, one entry per artist, with a source URL
per entry); their content is irrelevant to you. RateYourMusic and Reddit NSBM lists are
unversioned, uncited folklore — **do not ingest them.**

### 3.4 Label-level filtering: the mechanism is trivial, the evidence is the hard part

Mechanism is a solved problem three ways: MA's `bandLabelName`;
[MusicBrainz WS/2](https://musicbrainz.org/doc/MusicBrainz_API), where Label is one of the core
entities with `label-rels`; and the Discogs API (`GET /labels/{id}` → `releases_url`, verified
live, 25 req/min unauthenticated).

**Labels documented by reputable sources:** Resistance Records, Label 56, Micetrap
Distribution, ISD Records, NSM88 Records, MSR Productions, Tightrope, Stahlhelm Records (all
SPLC, cited above), and Militant Zone (Bellingcat).

**Labels I could NOT verify and which must not be encoded:** Darker Than Black Records,
Drakkar Productions, Werewolf Records — **UNVERIFIED**; no reputable-source accusation
retrievable in this session. And **Nordvis: no source of any kind implicates it.** It is a
mainstream Swedish folk/black-metal label; blocking it would be a textbook defamatory false
positive. Treat its appearance in the brief as an unsupported rumour and drop it.

Rule for the data file: **every label entry carries a citation URL. No citation, no entry.**

### 3.5 Why the human gate is non-negotiable — with receipts

These are reproduced failures, not hypotheticals:

1. **The theme search is substring-matched and inverts meaning.** `themes=Fascism` → 513 bands;
   `themes=Anti-fascism` → 472. The overwhelming majority of the "Fascism" hits are *antifascist*
   bands. Same trap for `Racism` (256) vs `Anti-racism` (65). A naive `if "fascism" in themes`
   blocks the antifascists and misses almost nothing else.
2. **The canonical Nazi is not flagged.** Verified live:
   [Burzum](https://www.metal-archives.com/bands/Burzum/88) →
   `Themes: Mythology, Folklore, Odalism, Darkness, Philosophy, Mysticism`. Varg Vikernes — the
   most-cited figure in every source in §3.2 — sails through a themes filter. "Odalism" is his
   own coinage and returns 2 bands sitewide. Euphemism defeats keyword matching entirely.
3. **Bands get misidentified.** The 2017 Spotify sweep drew pushback over Swiss band **Bölzer**,
   whose mixed-race singer Okoi Jones denied white-supremacist connections
   ([DMN](https://www.digitalmusicnews.com/2017/08/16/spotify-remove-neo-nazi/)).
4. **One member ≠ the band.** Watain guitarist Set Teitan stepped down after Nazi-salute photos
   surfaced, while frontman Erik Danielsson had long been on record against the genre's
   far-right flirtations
   ([Exclaim!, 2018-03-29](http://exclaim.ca/music/article/watain_stand_for_black_metal_against_the_genres_nazi_flirtations)).
   The same catalogue is a different decision in 2017 and 2019.
5. **Church-burning ≠ racism.** SPLC itself draws this line, in
   [Hatewatch, 2019-04-12](https://www.splcenter.org/resources/hatewatch/suspect-church-burnings-influenced-black-metal-music-police-say-not-all-black-metal-same/):
   *"NSBM is far from the most visible strand of black metal (the genre also features
   contemporary bands that are explicitly antiracist and antifascist)."* Darkthrone's themes are
   `Anti-religion, Satan, Occultism` — blasphemy, not race. Treat transgressive anti-Christian
   imagery as a racism proxy and you delete most of the genre while still missing the Nazis.
6. **Satire sits in the same field.** MA's `themes=Racism` results include a band tagged
   `Memes, Racism, Sexism` — indistinguishable from sincere ideology by string match.

### 3.6 What to build

- **Allowlist, not blocklist, as the primary mechanism.** For a 4-year-old, invert the problem:
  the child's library is an approved set that grows only by parent approval. A blocklist is an
  unbounded adversarial game against euphemism; an allowlist is bounded and fails safe. The
  blocklist exists only to *suppress noise in the suggestion queue*, not to guarantee safety.
- **MA `themes` as a pre-screen with exact-token matching.** Pull the `National Socialism` roster
  (1256 bands) once, plus `Nazism`, `White supremacy`, `Aryan`, `Antisemitism`, and the
  exact-token subsets of `Racism`/`Fascism`/`Nationalism` **after explicitly excluding**
  `Anti-racism`/`Anti-fascism`/`Anti-nationalism`. Cache locally, re-sync monthly at
  `Crawl-delay: 3`. Assume ~70% recall, not 100% (see Burzum).
- **Label expansion** seeded only from the SPLC/Bellingcat names, each with its citation URL.
- **Member-graph expansion** from MA lineups surfaced as *review hints*, never auto-blocks.
- **Only the human queue may write to the block list.** Each candidate arrives with its themes
  string, label and triggering citation. The parent clicks.
- **A one-click "blocked in error" path**, logged with a reason. You will be wrong about someone.

---

## 4. Explicit-content flags

The parent's requirement — *see* the flag rather than have it auto-block — is the right call,
because Norwegian hip-hop is flagged explicit constantly and auto-blocking would empty half the
seed list.

### 4.1 Qobuz: yes, via `parental_warning`, and Music Assistant already surfaces it

Verified in Music Assistant's Qobuz provider source
([`providers/qobuz/__init__.py`](https://github.com/music-assistant/server/blob/dev/music_assistant/providers/qobuz/__init__.py)):

```python
# _parse_album
if album_obj.get("parental_warning"):
    album.metadata.explicit = True

# _parse_track
if track_obj.get("parental_warning"):
    track.metadata.explicit = True
```

So Qobuz's `api.json/0.2` album and track objects carry a boolean `parental_warning`, and MA maps
it onto `MediaItemMetadata.explicit` at both album and track level. **This is available to you for
free via MA's own data model** — you don't need to call Qobuz yourself. (Qobuz's public web pages
do *not* render a parental-advisory badge on the artist discography view — checked on the
[Sabaton page](https://www.qobuz.com/us-en/interpreter/sabaton/download-streaming-albums) — so
the API flag is strictly better than scraping.)

### 4.2 Deezer: three separate fields, all free, no key

Verified live against a Karpe album:

```json
{"title":"OVERTIME/OVERKILL VOL. 7","explicit_lyrics":false,
 "explicit_content_lyrics":0,"explicit_content_cover":2,
 "label":"A & K","genres":{"data":[{"id":116,"name":"Rap/Hip Hop"}]},
 "upc":"820200861139",
 "cover_xl":"https://cdn-images.dzcdn.net/images/cover/.../1000x1000-000000-80-0-0.jpg"}
```

Sibling albums in the same call returned `explicit_lyrics: true`. Deezer gives you a boolean
plus two enums (lyrics **and** cover art), against a UPC you can join to your Qobuz/MB records.
**This is the best explicit metadata of any free source** and it costs one unauthenticated HTTP
call. Use it to cross-check Qobuz, and to catch the case where Qobuz's `parental_warning` is
absent on a release that other DSPs flag.

### 4.3 MusicBrainz and Discogs: neither has an explicit flag

- **MusicBrainz: no.** The [Release documentation](https://musicbrainz.org/doc/Release) contains
  no occurrence of "explicit", "parental", "advisory" or "clean version" (grepped live). A live
  `/ws/2/release/` search returns the fields `artist-credit, asin, barcode, country, date, id,
  label-info, media, release-events, release-group, status, text-representation, title,
  track-count` — no advisory field. At best you can infer from a release titled "(Clean)" or
  "(Explicit)", which is unreliable.
- **Discogs: no.** A live `GET /releases/1000` returns `genres`, `styles`, `year`, `labels` and
  no advisory field.

**Design implication:** carry `explicit` as a three-state value — `true` (Qobuz or Deezer says
so), `false` (both say no), `unknown` (neither source had the release). Show the state in the
review UI. Never auto-block on it; a 4-year-old's Karpe album is exactly the case the parent
wants to decide personally.

---

## 5. Getting approved albums onto the NAS as permanent files

### 5.1 Qobuz as a store — yes, DRM-free, but no automation and no permanence guarantee

Qobuz sells permanent downloads independently of streaming: *"No, you do not need to have a
subscription to download music"*
([help article 10171](https://help.qobuz.com/en/articles/10171-do-you-need-a-subscription-to-be-able-to-download-albums-tracks)).
Formats, verbatim from
[help article 10167](https://help.qobuz.com/en/articles/10167-what-are-the-different-audio-formats-available-for-download):
*"24-Bit up to 192 kHz Quality: WAV, AIFF, ALAC, FLAC … 16-Bit/44.1 kHz Lossless … 320kbps/128kbps
Lossy Quality: MP3, AAC"*, plus DSD64–DSD512 and DXD 24/352.8. Crucially:
***"All the files purchased on Qobuz are guaranteed without DRM."***

Two caveats that matter for an archive:
- **Re-download is a courtesy, not a right.** The [ToS](https://www.qobuz.com/us-en/legal/terms)
  §3: *"From the withdrawal date, the musical recordings already acquired by the Customer shall
  no longer be available for downloading onto their Listening Devices."* The help centre agrees:
  *"The albums may no longer be available for download, which is why we recommend to users to
  make a backup of their purchase"*
  ([article 10166](https://help.qobuz.com/en/articles/10166-can-i-re-download-my-purchases)).
- **The browser ZIP route drops artwork.** *"Bonus content and album covers are not included in
  the ZIP file"*
  ([article 369150](https://help.qobuz.com/en/articles/369150-download-full-albums-without-qobuz-downloader)).
  Use the Qobuz Downloader desktop app, or plan to source art separately (§5.4).

**No official API, no purchase automation.** `developer.qobuz.com` and `api.qobuz.com` do not
resolve; `qobuz.com/api` 404s; `github.com/Qobuz/api-documentation` 404s. `api.json/0.2` is alive
but gated on a partner-issued `app_id`. Purchases are pulled manually via the
[Qobuz Downloader](https://help.qobuz.com/en/collections/64317-qobuz-downloader) app or the
browser. **Treat "buy the album" as a human step in the pipeline.** For a household appliance
this is fine — it's one click per approved album, and the approval is already a human step.

### 5.2 The Qobuz ToS position on downloading streamed content — stated factually

The [Qobuz ToS](https://www.qobuz.com/us-en/legal/terms) contains three relevant clauses:

- **Streaming licence:** *"QOBUZ grants subscribers to its streaming service a limited,
  non-exclusive and revocable license allowing them to listen in real time, **without
  authorization to download**, in their country of residence."*
- **§21.8.3, circumvention:** *"in accordance with the legislation in force, it is strictly
  forbidden for the Customer to attempt to bypass, remove or impair the technical measures
  implemented to protect the works or any device with an equivalent purpose, with a view to using
  the music files for purposes not authorised by these GCUS, under penalty of incurring liability
  under Article L. 335-4-1 of the French Intellectual Property Code."* §17(e) separately bans
  reverse-engineering the Qobuz applications.
- **Purchased files, by contrast:** *"The playing, transfer and burning of downloaded music files
  are free and unlimited, and subject to strictly private use."*

That last sentence is your licence to put **purchases** on a NAS. The first two are the position
on ripping the **stream**. Those are the facts; the call is yours.

### 5.3 streamrip / qobuz-dl status — your recollection is correct

- **streamrip** ([nathom/streamrip](https://github.com/nathom/streamrip)) — **not archived, not
  DMCA'd, but dormant.** Last `dev` commit **2026-04-21**; latest GitHub release **v2.2.0
  (2026-03-12)**; PyPI still serves **2.1.0 from 2025-03-10**, so `pip install streamrip` gets a
  build predating the break by 16 months. 267 open issues.
- **[Issue #1012](https://github.com/nathom/streamrip/issues/1012) is real and still open.**
  *"[BUG] Qobuz: every album download crashes with KeyError 'tracks'; playlists silently download
  0 tracks (server-side API change, ~2026-07-18)"*, filed **2026-07-18**. Root cause: Qobuz's
  `album/get` stopped returning inline `tracks`; `extra=tracks` now returns HTTP 400; a new
  `extra=track_ids` replaces it. Affects v2.1.0 and dev.
- **The fix exists and is unmerged.** PR **#1013** *"adapt to album/get and playlist/get no longer
  returning inline tracks"* opened 2026-07-18, **still open after two months**. Other live Qobuz
  bugs: #954 (login `AuthenticationError`), #1031 (stale app_id/secret), #1037.
- **Forks:** `hank-bond/streamrip` (23★, updated 2026-06-16) is the liveliest but **predates the
  break** and contains no track_ids fix.
- **qobuz-dl** ([vitiko98/qobuz-dl](https://github.com/vitiko98/qobuz-dl)) — not archived but
  functionally abandoned: last code commit **2023-08-21**, last PyPI release **0.9.9.10
  (2023-03-26)**. Its README's *"just works™ (2025)"* claim is stale.

Both tools operate on the **streaming** endpoints — precisely what §5.2's clauses address.

### 5.4 Legitimate acquisition paths, ranked

1. **Bandcamp — the right primary source for both your genres.** Formats, verbatim:
   *"MP3 V0, MP3 320, FLAC, AAC, Ogg Vorbis, ALAC, WAV, AIFF"*
   ([help, updated 2026-06-12](https://get.bandcamp.help/en/articles/15263234-in-which-formats-can-i-download-my-purchases)),
   with [indefinite re-download](https://get.bandcamp.help/en/articles/15263192-can-i-re-download-my-purchases)
   — better permanence than Qobuz. The [API](https://bandcamp.com/developer) still exists but is
   OAuth2 for *"labels and merchandise fulfillment partners"* (Account, Sales Report, Merch
   Orders) — **no catalogue or download endpoints**, useless for automation. Post-Epic ownership:
   **UNVERIFIED** (bandcamp.com/about states no parent company).
2. **Qobuz store** for major-label titles Bandcamp lacks — FLAC to 24/192, DRM-free, but back up
   immediately (§5.1).
3. **CD + rip** — the only path for out-of-print Norwegian rap, and the highest-integrity one.
   [whipper](https://github.com/whipper-team/whipper) is maintained (1,658 commits on `develop`),
   uses cd-paranoia and *"verifies rip accuracy using the AccurateRip database"*; XLD (macOS) and
   EAC (Windows) are equivalents. AccurateRip gives bit-exact provenance no store offers.
4. **7digital no longer exists as a consumer store.** [docs.7digital.com](https://docs.7digital.com)
   301-redirects to [docs.massivemusic.com](https://docs.massivemusic.com/), which states
   *"MassiveMusic previously traded as 7digital and all API endpoints operate under 7digital
   domains."* Strictly B2B; its [supported formats](https://docs.massivemusic.com/docs/supported-formats.md)
   do go to FLAC 24/192 but only under a commercial licensor agreement. `www.7digital.com` returns
   CloudFront 403 — **UNVERIFIED** whether any consumer storefront remains.
5. **Presto Music, HDtracks, Bleep — UNVERIFIED.** All Cloudflare/JS-shell blocked; format
   matrices could not be read. Presto is classical-weighted and a poor fit regardless.

### 5.5 Tagging, organising, and the cover art (which is the actual product)

**beets.** [fetchart](https://beets.readthedocs.io/en/stable/plugins/fetchart.html) queries by
default `filesystem coverart itunes amazon albumart`, with Wikipedia, Google, fanart.tv, Last.fm
and Spotify available. The option that matters is **`minwidth`** — *"Only images with a width
bigger or equal to minwidth are considered as valid album art candidates"* — a genuine hard
floor. Also `enforce_ratio`, `max_filesize`, `cover_names`, `art_filename`. Leave `maxwidth`
unset (it downscales). [embedart](https://beets.readthedocs.io/en/stable/plugins/embedart.html)
writes the image into tags (`quality` — docs suggest *"65–75 is usually a good starting point"*).
**There is no Qobuz plugin for beets**; autotagger sources are chroma, deezer, discogs,
fromfilename, musicbrainz, spotify, tidal
([plugin index](https://beets.readthedocs.io/en/stable/plugins/index.html)).

**Cover Art Archive** ([API docs](https://musicbrainz.org/doc/Cover_Art_Archive/API)) serves
`/release/{mbid}/front` (original) plus `-250`, `-500`, `-1200` thumbnails, with
*"no rate limiting rules in place"*. Licensing is weak: the
[CAA policy](https://musicbrainz.org/doc/Cover_Art_Archive) grants nothing —
*"These covers are being collected for archival purposes… Use the images at your own risk."*
Fine for a private NAS; not a redistribution licence.

**Measured reality — what resolution you can actually get** (all fetched live 2026-09-18):

| Source | URL pattern | Measured sizes |
|---|---|---|
| **Bandcamp** | `f4.bcbits.com/img/a{id}_{n}.jpg` | **`_0` = untouched original**: Enslaved 3000×3000 (10.3 MB). `_10` = 1200×1200, `_16`/`_5` = 700×700 |
| **Qobuz CDN** | `static.qobuz.com/images/covers/{xx}/{yy}/{barcode}_{size}.jpg` | sizes 50,68,100,150,230,300,600, **`_org`**, **`_max`**. `_org` measured: 1400², 1425², 1500², 3000². `_max` = same pixels, recompressed (4.19 MB `_org` vs 1.49 MB `_max`) |
| **Cover Art Archive** | `/release/{mbid}/front` | **High variance**: Karpe *Omar Sheriff* 3000×3000; Metallica *Master of Puppets* **2500×2200 (not square!)**; Gojira *Magma* 1425²; Mastodon *Crack the Skye* 800²; Enslaved *Axioma Ethica Odini* **300×300**; Kvelertak and Iron Maiden *Powerslave* — **no front cover at all** |
| **Deezer CDN** | `cdn-images.dzcdn.net/images/cover/{hash}/{W}x{H}-000000-80-0-0.jpg` | 1000×1000 served; 1400×1400 served (upscaled); requesting 1800 returns a **1200×1200** image; 3000 → HTTP 403. **Real ceiling ≈ 1200 px** |
| **fanart.tv** | — | **UNVERIFIED** (Cloudflare-blocked), though confirmed as a live MA provider |

The industry ceiling is corroborated by MassiveMusic's
[image sizes doc](https://docs.massivemusic.com/reference/image-sizes.md): sizes run to 1400 and
3000 px, and *"1400px and 3000px images are only being stored or generated when licensors send
these sizes (or higher) to us."*

**Music Assistant's artwork priority is documented**
([music-assistant.io/metadata/artwork](https://music-assistant.io/metadata/artwork/)):
*"Folder images next to the album or artist (`cover.jpg`, `folder.jpg`, `artist.jpg`)"* →
embedded front-cover tags → music provider → online providers (Fanart.tv, TheAudioDB).
Thumbnails are disk-cached, default 500 MB. The server ships `musicbrainz`, `fanarttv`,
`coverartarchive`, `itunes_artwork` and `local_audio` providers
([providers dir](https://github.com/music-assistant/server/tree/dev/music_assistant/providers)).
The [Qobuz provider docs](https://music-assistant.io/music-providers/qobuz/) cover streaming to
FLAC 24/192 only — **no download integration**.

**Target: 1400×1400 minimum, 3000×3000 ideal.** Set `fetchart.minwidth: 1000` as a hard floor
(your stated 1000 px goal is comfortably achievable), leave `maxwidth` unset, and set
`enforce_ratio: no` — *Master of Puppets* is genuinely 2500×2200 and you do not want it rejected.
Preference order: art shipped with the purchase → Bandcamp `_0` → Qobuz `_org` → CAA front →
Deezer `cover_xl`. Write it as **`cover.jpg` beside the album** (MA's first lookup, above
embedded tags) *and* embed it with `quality: 75` for dumb players.

---

## Recommended pipeline

From "the child likes Sabaton" to "a vetted album on the NAS with a 1000 px cover".

### Step 0 — Seed normalisation
Parent's playlist → for each artist, **MusicBrainz** `GET /ws/2/artist/?query=artist:<name>&fmt=json`
→ store the MBID, `country`, and tags. 1 req/s, contactable User-Agent
([rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)). *Everything
downstream is keyed on MBID.*
→ Sabaton = `39a31de6-763d-48b6-a45c-f7cfad58ffd8`.

### Step 1 — Candidate generation (three sources, union with vote counting)
1. **ListenBrainz Labs** `GET labs.api.listenbrainz.org/similar-artists/json?artist_mbids=<mbid>&algorithm=session_based_days_7500_...`
   — no key, MBID in, MBID out, scored. *Primary.*
2. **Last.fm** `artist.getSimilar` with `mbid=<mbid>` — 0–1 match score. Free key from
   [last.fm/api/account/create](https://www.last.fm/api/account/create). Respect the 100 MB cache
   cap. *Or simply enable MA's `lastfm_recommendations` provider and read its output.*
3. **Deezer** `GET api.deezer.com/artist/{id}/related` — no key; resolve the Deezer ID via
   `/search/artist?q=<name>` first.

Score each candidate by **how many of the three sources returned it**, weighted by each source's
own score. A 3/3 hit (Powerwolf and HammerFall were, today, returned by all three for Sabaton) is
a near-automatic queue entry; a 1/3 hit is a long-tail suggestion.

### Step 2 — Resolve and enrich
MusicBrainz (MBID, `country`, tags, release-groups) → Discogs (`styles`, label; 25 req/min
unauthenticated) → Qobuz `catalog/search` + `artist/get` (is it actually streamable?) →
Deezer `/artist/{id}/albums` (`explicit_lyrics`, `label`, `upc`).

### Step 3 — Automated rejection filters (fail-closed, all reversible by the parent)
| Filter | Source | Action |
|---|---|---|
| **AI-slop screen** | No MBID **or** zero Discogs releases **or** >1 release/month cadence | Reject silently |
| **Label allowlist** | Qobuz/Deezer `label` field | Boost if on allowlist; flag if label == artist name |
| **NSBM screen** | MA `themes` roster cache (§3.6), exact-token, anti-* excluded | **Flag for review with the triggering theme string — never silently reject** |
| **Label blocklist** | SPLC/Bellingcat-cited labels only, each with a citation URL | Flag for review with the citation |
| **Explicit** | Qobuz `parental_warning` (via MA) ∪ Deezer `explicit_lyrics` | **Display only. Never blocks.** |

### Step 4 — Parent review queue
One card per candidate album: artist, album, year, cover thumbnail, **MB tags + Discogs styles**,
**MA themes string**, **label**, **explicit: true/false/unknown**, and the three similarity
scores with the seed artist that produced it. Buttons: **Approve / Reject / Block artist /
Block label**. Only this queue may write to the block list. Log every block with a reason and
make un-blocking one click.

### Step 5 — Acquire (human, one click per album)
Bandcamp first (FLAC, permanent re-download, best metal + Norwegian indie coverage) → Qobuz
store second (FLAC 24/192, DRM-free, **back up immediately**) → CD + whipper/AccurateRip for
out-of-print. Do **not** wire streamrip into this: Qobuz broke its `album/get` on 2026-07-18
([#1012](https://github.com/nathom/streamrip/issues/1012)), the fix has sat unmerged in
[#1013](https://github.com/nathom/streamrip/pulls?q=is%3Apr+qobuz) for two months, the last
commit was April 2026 — and §5.2 is the ToS position.

### Step 6 — Ingest and tag
`beet import` with the **musicbrainz** autotagger (MBID already known from step 0 →
`beet import --set mb_albumid=<mbid>`), then `fetchart` with `minwidth: 1000`,
`maxwidth` unset, `enforce_ratio: no`, `art_filename: cover`, then `embedart` with `quality: 75`.
Art preference: purchase-bundled → Bandcamp `_0` (up to 3000²) → Qobuz `_org` (1400–3000²) →
CAA `/front` → Deezer `cover_xl` (1000²). Write to `/nas/music/<Artist>/<Album> (<Year>)/`.

### Step 7 — Expose to the child
Music Assistant's **filesystem_local** provider points at the NAS path. The **Qobuz provider is
not exposed to the child's player** — it exists only for the parent's discovery/preview step.
Optionally enable **Sonic Analysis** so "more like this" works entirely offline over the approved
library, via local CLAP embeddings, with no external call and therefore no way for unvetted
content to reach the child.

### The one-line summary
**ListenBrainz Labs + Last.fm + Deezer generate candidates → MusicBrainz canonicalises →
Metal Archives `themes` and a cited label blocklist flag them → the parent decides →
Bandcamp/Qobuz store sells the files → beets tags them with a ≥1000 px cover → Music Assistant
plays only what is on the NAS.** The machine never decides what the child hears; it only decides
what the parent has to look at.
