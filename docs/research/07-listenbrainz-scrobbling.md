# ListenBrainz scrobbling — privacy, and the submission contract

Verified **2026-09-19**. Supersedes nothing; extends `03-discovery-and-filtering.md` §1.3,
which covered the *Labs* similarity API and the 401 on the main API but not submission.

---

## 1. The privacy question, answered

Handoff 4 flagged this as **UNVERIFIED** and blocking: *"I believe ListenBrainz listen history
is public by default … and I did not confirm whether private listens are offered."*

**Confirmed, and the answer is stronger than a default.**

> **ListenBrainz has no private listens, has never had them, and it is a deliberate design
> decision rather than a missing feature.**

From the MetaBrainz community thread
([Any plans to give ListenBrainz users control over their listen data privacy?](https://community.metabrainz.org/t/any-plans-to-give-listenbrainz-users-control-over-their-listen-data-privacy/421566)),
**rob** — the project lead — explaining why the system was built without them: last.fm's
founder *"really regretted ever allowing private data"*, calling separate code paths for it
*"a giant pain to maintain"*, and *"the vast majority of people were fine with their scrobbles
being public."* He notes private listens remain theoretically possible but *"the demand … has
been quite low so far, so we have not focused on it."*

Consequences that follow, and all three are permanent:

- Listens are **CC0**, published in **weekly public data dumps**, and available through the
  public API on any user's profile.
- There is **no hidden or private mode to switch on.** Not a setting we failed to find.
- Deletion is possible after the fact, but a dump already published cannot be recalled.

### The decision taken

Put to the operator with the above on the table. Their instruction, verbatim: *"Just use a
generic user, don't reference it in github."*

So: submission goes to a **generic household account**, never one identifying the child, and
**the account is named nowhere in this repository.** The repo may be made public; naming the
account in it would relink exactly what the generic account exists to separate.

Two things this does and does not buy:

- ✅ **It breaks the link from the public repo to the listen history.** What remains public is
  a pseudonymous account playing metal records.
- ❌ **It does not make the listens private.** They are public, permanent and CC0. The
  behavioural pattern — a small set of albums, evenings, a child's bedtime — is still
  published, just not attributed.

Practical consequence for whoever creates the account: **do not name it `platebunken`**, or
after anything else that appears in this public repository, or the separation is defeated by
the account name itself. There is deliberately no `LISTENBRAINZ_USER` setting: the API
identifies the account by the token alone, so the server never needs to know the name.

## 2. What is submitted, and what is refused

| | |
|---|---|
| Deliberate listens | ✅ submitted |
| Auto-advanced listens | ✅ submitted |
| Skipped tracks | ❌ below threshold |
| Tracks MA never resolved | ❌ no real artist/title to send |
| **Loved feedback** | ❌ **never, by design** |

Scrobbling answers *what was heard*; the favourite marks answer *what he chose*. Both are
derived from the same `Listen` stream and `listens.ts` keeps them distinct so each can be right.

`POST /1/feedback/recording-feedback` exists and this product will not call it. Nothing here
lets the child declare a favourite — favourites are **derived from play counts** — so submitting
one would put a synthetic opinion in someone else's name on a permanently public account. That
is the fifth thing the product refuses to do.

## 3. The submission contract — verified live

`POST https://api.listenbrainz.org/1/submit-listens`

Probed with **no token** on 2026-09-19 (nothing was submitted):

```
HTTP 401
{"code":401,"error":"You need to provide an Authorization header."}
```

Note this is a *different* 401 body from the one in `03` §1.3 — that endpoint returns the
"bad actors and AI scrapers" message. Both are real; they come from different guards.

**Rate-limit headers, observed on that same response:**

```
x-ratelimit-limit: 30      x-ratelimit-remaining: 29
x-ratelimit-reset-in: 2    x-ratelimit-reset: <unix seconds>
```

So the real budget is ~30 requests per short window — far more generous than the documented
rule. The client still spaces calls at **1.1 s** because the docs say clients must *"never make
more than ONE call per second"*, and a household appliance has no reason to test the edge.
`X-RateLimit-Reset-In` is the header the retry path reads; it is confirmed present.

**Headers required:** `Authorization: Token <token>`, `Content-Type: application/json`, and a
real `User-Agent`.

**Payload** ([JSON docs](https://listenbrainz.readthedocs.io/en/latest/users/json.html)):

```json
{ "listen_type": "single",
  "payload": [{
    "listened_at": 1789842600,
    "track_metadata": {
      "artist_name": "…", "track_name": "…", "release_name": "…",
      "additional_info": { "duration_ms": 240000,
                           "media_player": "Music Assistant",
                           "submission_client": "platebunken" } } }] }
```

- `listen_type` is `single` | `playing_now` | `import`. This client sends **`single`** only.
  `playing_now` is not sent: it is traffic for a screen nobody is looking at.
- `listened_at` is **unix seconds, at the moment playback STARTED**, and is omitted for
  `playing_now`. The **server's** clock is used — the Docker host has WAN and NTP; the kiosk's
  clock is not synced and is deliberately not in this path.
- Only `artist_name` and `track_name` are required, and both **"must be simple strings."**
  They come from the resolved media item, never from splitting MA's `"Artist - Title"` display
  string — that is wrong for any artist with a hyphen in the name.
- *"If you do not have the data for any of the following fields, omit the key entirely."*
  Omission, never an empty string: a wrong value here is written permanently and publicly.
- Limits: 10,240 bytes per listen, 10,240,000 per payload, 1,000 listens per request.

**The submission threshold is the API's own, not ours.** The docs: submit when *"the user has
listened to half the track or 4 minutes of the track, whichever is lower."* That is exactly
what `isComplete()` in `src/ma/listens.ts` implements, and the constants there were chosen
before this page was read — they agree.

## 4. Status

Built and tested; `src/server/scrobble.ts`, 15 tests in `scrobble.test.ts`.

**Not enabled.** `LISTENBRAINZ_TOKEN` is empty, and an empty token disables submission entirely
— silent, not broken. It stays that way until the operator creates the account and fills it in.

**Not yet verified end to end**, because that requires both a token and a record actually
playing, and nothing in this project has ever made a sound. The first real submission should be
watched: confirm a 200, then confirm the listen appears on the account with the right artist,
title and timestamp.
