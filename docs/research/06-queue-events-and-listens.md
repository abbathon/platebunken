# Queue events, and what actually played

Verified live on **2026-09-19** against this household's Music Assistant — **2.9.9, API
schema 31** — not against a branch. Where this disagrees with `01-backend-sources-sonos.md`,
this document wins: 01 was written against `dev` at schema 77, which is far ahead of any
released version.

Everything below was confirmed **without playing anything**, for the reason given in §4.

---

## 1. The server's own API docs do not publish event names

`/api-docs/` on the running server serves:

| Path | Contents | Useful for |
|---|---|---|
| `commands.json` | every command, its parameters, return type, required role | ✅ authoritative |
| `schemas.json` | every model, including `PlayerQueue` and `QueueItem` | ✅ authoritative |
| `openapi.json` | the same, as OpenAPI | ✅ |
| `events.json` | **404** | — |

There is **no `EventType` enum to curl.** This is the gap that makes event names the one part
of this integration that cannot be verified by reading the server, and it is why the existing
`player_updated` handling in `src/ma/client.ts` was never written down as verified either.

The enum published in `music-assistant/models` on `main` lists `queue_added`, `queue_updated`,
`queue_items_updated`, `queue_time_updated`, `media_item_played` and `playlog_updated`. Treat
that list as a **hypothesis about a future version**, not as this server's behaviour.

## 2. What this server actually emits — confirmed

| Event | Confirmed | `object_id` | Payload |
|---|---|---|---|
| `queue_updated` | ✅ observed | the `queue_id` | the **entire** `PlayerQueue` |
| `queue_items_updated` | ✅ observed | the `queue_id` | the **entire** `PlayerQueue` |
| `queue_time_updated` | ❌ not observed | — | needs playback to confirm |
| `media_item_played` | ❌ not observed | — | needs playback to confirm |
| `playlog_updated` | ❌ not observed | — | needs playback to confirm |

Two facts that shape the client:

- **The payload is the whole object, never a delta.** A subscriber replaces; it never merges.
- **One change emits both names.** A single `player_queues/clear` produced
  `queue_items_updated` *then* `queue_updated`, four seconds apart, carrying identical
  payloads. **Any subscriber must be idempotent.** One that is not double-counts every track,
  which would halve the effective play threshold for a favourite.

`src/ma/listens.test.ts` defends that idempotence explicitly.

### The two unconfirmed ones matter

`media_item_played` and `playlog_updated` suggest **MA may already keep its own play log.** If
it does, some of `src/ma/listens.ts` is re-deriving what the server would hand over. Check this
the first time a record actually plays, before building anything further on top of the tracker:
log every event name seen during one album, then compare.

## 3. The fields that carry the answer

From `player_queues/all` on this server, for a queue that had been playing (reformatted;
ids, names and room labels replaced):

```json
{
  "queue_id": "<player id>", "display_name": "<room>",
  "state": "idle", "items": 1, "current_index": 0,
  "elapsed_time": 206.13,
  "current_item": {
    "queue_item_id": "<queue item id>",
    "name": "<Artist> - <Title>",
    "index": 0, "duration": 230,
    "media_item": {
      "uri": "qobuz://track/<id>",
      "track_number": 1,
      "album": { "uri": "qobuz://album/<id>" }
    }
  }
}
```

- `current_item.media_item` is where **all identity lives**: `uri`, `track_number`,
  `album.uri`, `artists[]`. It is the only thing worth logging.
- `current_item.name` is a **display string**, `"Artist - Title"`. It is not parseable: an
  artist with a hyphen in the name splits wrong. Never derive identity from it.
- `media_item` can be **null** while the item still has a name — and it is often absent on the
  first payload and filled in on the next. The tracker keeps the freshest copy for this reason,
  and reports `trackNumber: null` rather than guessing 1. `schema.ts` migration v3 says why
  guessing is worse than not knowing.
- `duration` appears on both the QueueItem and the media item and they **disagree on some
  providers**. The queue's is what MA buffered, so the queue's is the truth.
- `elapsed_time` is **seconds**, and is a snapshot taken at `elapsed_time_last_updated` (unix
  seconds). **It does not tick.** Nothing can read it as a live position without adding the
  wall-clock time since that stamp — and it resets on a track change, so it is the wrong basis
  for "how much of this track was heard". The tracker measures that itself, from time spent in
  `playing`, which is independent of how often MA sends events.

## 4. How to confirm event behaviour without making a sound

This matters: the device is in a child's bedroom, and the obvious way to test a music system
is the one way that is not available most of the day.

**`player_queues/clear` on an already-empty, already-idle queue emits both queue events and
cannot produce audio.** Pre-check `state === "idle" && items === 0 && !current_item`, then send
it. `scripts/` does not carry this; it was a scratch probe, and it is written down here instead
so the next person does not reach for `smoke -- --play` at nine in the evening.

What this technique **cannot** confirm is anything that only happens during playback: track
transitions, `queue_time_updated`, and whether auto-advance is distinguishable in practice.
Those wait for the first real record.

## 5. What is built on this

`src/ma/client.ts` maintains a queue map from these events and hydrates it once at connect
(`player_queues/all` — a one-shot read, not a poll; a reconnect would otherwise believe nothing
is playing until the next event).

`src/ma/listens.ts` turns the raw stream into `Listen` records: what played, for how long,
whether it finished, and **whether the child chose it or it merely came next**. That last
distinction is the whole basis of the favourite marks, and the attribution comes from the fact
that this server issued the play command — not from a timing window against what the page said.

Listens are currently **logged, not stored.** See the comment on `onListen` in
`src/server/speaker.ts` for what the switchover requires and why it waits for evidence.
