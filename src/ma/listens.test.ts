/**
 * The listen tracker.
 *
 * This decides which track played, for how long, and — the one that matters — whether the
 * child chose it or it merely came next. The favourite marks on the number line are derived
 * from that distinction and from nothing else, so a bug here does not throw: it quietly
 * changes which records a four-year-old is told he loves.
 *
 * Every case below is driven through the public interface with hand-built queue payloads
 * shaped like the ones observed on the wire from MA 2.9.9. No speaker, no database, no clock.
 *
 *   node --test src/ma/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createListenTracker, isComplete, type Listen } from "./listens.ts";
import type { PlayerQueue, QueueItem } from "./types.ts";

const QUEUE = "q-kid-room";

function item(n: number, opts: { id?: string; duration?: number | null; resolved?: boolean } = {}): QueueItem {
  const resolved = opts.resolved ?? true;
  return {
    queue_item_id: opts.id ?? `item-${n}`,
    name: `Test Artist - Track ${n}`,
    duration: opts.duration === undefined ? 200 : opts.duration,
    index: n - 1,
    media_item: resolved
      ? {
          item_id: `t${n}`,
          uri: `qobuz://track/${n}`,
          name: `Track ${n}`,
          track_number: n,
          album: { item_id: "a1", name: "Test Album", uri: "qobuz://album/a1" },
          artists: [{ item_id: "ar1", name: "Test Artist" }],
          metadata: {},
        }
      : null,
  };
}

function queue(current: QueueItem | null, state: PlayerQueue["state"] = "playing"): PlayerQueue {
  return {
    queue_id: QUEUE,
    display_name: "KID_ROOM",
    active: true,
    available: true,
    items: 10,
    state,
    current_index: current?.index ?? null,
    index_in_buffer: null,
    elapsed_time: 0,
    elapsed_time_last_updated: 0,
    current_item: current,
    next_item: null,
    flow_mode: false,
    shuffle_enabled: false,
    repeat_mode: "off",
  };
}

/** A tracker with a clock the test drives by hand. */
function harness() {
  const listens: Listen[] = [];
  let clock = 1_700_000_000_000;
  const tracker = createListenTracker({
    queueId: QUEUE,
    onListen: (l) => listens.push(l),
    now: () => clock,
  });
  return {
    tracker,
    listens,
    advance(seconds: number) { clock += seconds * 1000; },
  };
}

test("the track the child pressed is deliberate; the one that follows it is not", () => {
  // This is the whole reason the module exists. schema.ts v3 spells out why the two must not
  // be folded together: a track that played because it came next is not a track he loves.
  const h = harness();

  h.tracker.expectDeliberate();          // the server is about to issue play
  h.tracker.observe(queue(item(3)));     // track 3 starts
  h.advance(200);
  h.tracker.observe(queue(item(4)));     // track 4 follows on its own

  assert.equal(h.listens.length, 1);
  assert.equal(h.listens[0].trackNumber, 3);
  assert.equal(h.listens[0].deliberate, true);

  h.advance(200);
  h.tracker.observe(queue(null, "idle"));
  assert.equal(h.listens.length, 2);
  assert.equal(h.listens[1].trackNumber, 4);
  assert.equal(h.listens[1].deliberate, false, "track 4 arrived by autoplay and must say so");
});

test("arming is spent by one track only", () => {
  // Otherwise a single press would mark the entire rest of the record as chosen.
  const h = harness();
  h.tracker.expectDeliberate();
  h.tracker.observe(queue(item(1)));
  h.advance(200);
  h.tracker.observe(queue(item(2)));
  h.advance(200);
  h.tracker.observe(queue(item(3)));

  assert.deepEqual(h.listens.map((l) => l.deliberate), [true, false]);
});

test("the same change arriving twice does not produce two listens", () => {
  // MA sends one clear as BOTH queue_updated and queue_items_updated, carrying identical
  // payloads. Observed on the wire. A subscriber that is not idempotent double-counts every
  // single track, which would roughly halve the play threshold for a favourite.
  const h = harness();
  h.tracker.expectDeliberate();
  h.tracker.observe(queue(item(1)));
  h.tracker.observe(queue(item(1)));
  h.tracker.observe(queue(item(1)));
  h.advance(200);
  h.tracker.observe(queue(item(2)));

  assert.equal(h.listens.length, 1);
  assert.equal(h.listens[0].deliberate, true, "the repeats must not have spent the arming");
});

test("paused time is not heard time", () => {
  const h = harness();
  h.tracker.observe(queue(item(1)));
  h.advance(30);
  h.tracker.observe(queue(item(1), "paused"));
  h.advance(3600);                                  // the record sat paused for an hour
  h.tracker.observe(queue(item(1), "playing"));
  h.advance(30);
  h.tracker.observe(queue(null, "idle"));

  assert.equal(h.listens[0].heardSec, 60);
  assert.equal(h.listens[0].completed, false, "60s of a 200s track is not a listen");
});

test("a track played through is complete; a track skipped early is not", () => {
  const h = harness();
  h.tracker.observe(queue(item(1)));                // 200s track
  h.advance(150);
  h.tracker.observe(queue(item(2)));
  h.advance(5);                                     // skipped after five seconds
  h.tracker.observe(queue(null, "idle"));

  assert.equal(h.listens[0].completed, true);
  assert.equal(h.listens[1].completed, false);
  assert.equal(h.listens[1].heardSec, 5, "a skip is still recorded, just not as complete");
});

test("the completion rule matches the scrobbling convention", () => {
  assert.equal(isComplete(100, 200), true, "half the track");
  assert.equal(isComplete(99, 200), false);
  assert.equal(isComplete(240, 3600), true, "four minutes is enough however long the track is");
  assert.equal(isComplete(239, 3600), false);
  assert.equal(isComplete(20, 20), false, "tracks under 30s never count");
  assert.equal(isComplete(300, null), true, "unknown length still passes on four minutes");
  assert.equal(isComplete(100, null), false, "unknown length cannot be judged by share");
});

test("an unresolved queue item yields a listen with null identity, not a guessed one", () => {
  // A provider hiccup can leave a display name and no media item. Inventing track 1 here
  // would invent a favourite nobody played — the exact failure schema.ts v3 warns about.
  const h = harness();
  h.tracker.observe(queue(item(1, { resolved: false })));
  h.advance(200);
  h.tracker.observe(queue(null, "idle"));

  assert.equal(h.listens[0].trackUri, null);
  assert.equal(h.listens[0].albumUri, null);
  assert.equal(h.listens[0].trackNumber, null, "null is not zero and not one");
  assert.equal(h.listens[0].name, "Test Artist - Track 1", "the display name survives");
});

test("a late-resolving media item is picked up before the listen closes", () => {
  // MA often sends the item first and fills in media_item on the next payload.
  const h = harness();
  h.tracker.observe(queue(item(5, { resolved: false })));
  h.tracker.observe(queue(item(5, { resolved: true })));
  h.advance(200);
  h.tracker.observe(queue(null, "idle"));

  assert.equal(h.listens[0].trackUri, "qobuz://track/5");
  assert.equal(h.listens[0].trackNumber, 5);
});

test("the speaker being taken away closes the open listen rather than losing it", () => {
  // §10: grouped away, or claimed by another source. From here they are one event — the
  // queue simply stops having a current item.
  const h = harness();
  h.tracker.observe(queue(item(1)));
  h.advance(120);
  h.tracker.observe(queue(null, "idle"));

  assert.equal(h.listens.length, 1);
  assert.equal(h.listens[0].heardSec, 120);
});

test("another player's queue is ignored entirely", () => {
  // The household has nineteen queues. Eighteen of them are not this child's.
  const h = harness();
  const other = { ...queue(item(1)), queue_id: "someone-elses-speaker" };
  h.tracker.observe(other);
  h.advance(200);
  h.tracker.observe(other);

  assert.equal(h.listens.length, 0);
  assert.equal(h.tracker.current(), null);
});

test("current() reports what is on, not what was asked for", () => {
  const h = harness();
  assert.equal(h.tracker.current(), null);

  h.tracker.expectDeliberate();
  h.tracker.observe(queue(item(2)));
  assert.deepEqual(h.tracker.current(), {
    albumUri: "qobuz://album/a1",
    trackUri: "qobuz://track/2",
    name: "Test Artist - Track 2",
    trackName: "Track 2",
    albumName: "Test Album",
    trackNumber: 2,
    artist: "Test Artist",
    durationSec: 200,
    playing: true,
    deliberate: true,
  });

  h.advance(200);
  h.tracker.observe(queue(item(3)));
  assert.equal(h.tracker.current()?.trackNumber, 3, "track 3 is on now, whatever was pressed");
  assert.equal(h.tracker.current()?.deliberate, false);

  h.tracker.observe(queue(item(3), "paused"));
  assert.equal(h.tracker.current()?.playing, false);
});

test("flush ends an open listen so a redeploy does not swallow it", () => {
  const h = harness();
  h.tracker.observe(queue(item(1)));
  h.advance(150);
  h.tracker.flush();

  assert.equal(h.listens.length, 1);
  assert.equal(h.listens[0].completed, true);

  h.tracker.flush();
  assert.equal(h.listens.length, 1, "flushing twice must not duplicate the listen");
});

test("the queue's own duration wins over the catalogue's", () => {
  // They disagree on some providers, and what MA buffered is what actually played.
  const h = harness();
  h.tracker.observe(queue(item(1, { duration: 60 })));
  h.advance(31);
  h.tracker.observe(queue(null, "idle"));

  assert.equal(h.listens[0].durationSec, 60);
  assert.equal(h.listens[0].completed, true, "31s is past half of 60s");
});
