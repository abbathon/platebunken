/**
 * ListenBrainz submission.
 *
 * Two things are being defended here. One is the wire shape, because a listen submitted wrong
 * is written to a permanent, public, CC0 record that cannot be quietly corrected. The other is
 * that a failure to scrobble never reaches the child: the network this talks to is the one
 * thing in the product nobody in the house controls.
 *
 * No network. `fetch` and the clock are both injected.
 *
 *   node --test src/server/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createScrobbler, bodyFor, submittable, USER_AGENT, MAX_PENDING } from "./scrobble.ts";
import type { Listen } from "../ma/listens.ts";

function listen(over: Partial<Listen> = {}): Listen {
  return {
    albumUri: "qobuz://album/a1",
    trackUri: "qobuz://track/1",
    name: "Test Artist - A Song",
    trackName: "A Song",
    albumName: "Test Album",
    trackNumber: 1,
    artist: "Test Artist",
    durationSec: 240,
    startedAt: new Date("2026-09-19T18:30:00Z"),
    heardSec: 200,
    completed: true,
    deliberate: true,
    ...over,
  };
}

/** A fetch that records calls and answers with whatever the test queued. */
function fakeFetch(responses: { status: number; headers?: Record<string, string> }[] = []) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const impl = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i++, responses.length - 1)] ?? { status: 200 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k: string) => r.headers?.[k] ?? null },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const harness = (responses?: { status: number; headers?: Record<string, string> }[]) => {
  const f = fakeFetch(responses);
  const logs: string[] = [];
  const scrobbler = createScrobbler({
    token: "test-token",
    fetchImpl: f.impl,
    sleep: async () => {},          // no real waiting in tests
    now: () => 1_000_000,           // frozen: spacing is exercised separately
    onLog: (m) => logs.push(m),
  });
  return { scrobbler, calls: f.calls, logs };
};

test("the payload matches the documented submit-listens shape", () => {
  const body = bodyFor(listen());
  assert.equal(body.listen_type, "single");
  assert.equal(body.payload.length, 1);

  const p = body.payload[0];
  // Seconds, and the moment playback STARTED. 2026-09-19T18:30:00Z.
  assert.equal(p.listened_at, 1789842600);
  assert.equal(p.track_metadata.artist_name, "Test Artist");
  assert.equal(p.track_metadata.track_name, "A Song");
  assert.equal(p.track_metadata.release_name, "Test Album");
  assert.equal(p.track_metadata.additional_info.duration_ms, 240_000);
  assert.equal(p.track_metadata.additional_info.submission_client, "platebunken");
});

test("the real track name is sent, never the display string split on a hyphen", () => {
  // "AC/DC - Back in Black" is fine; "Emerson, Lake - Palmer" is what splitting produces for
  // any artist with a hyphen in the name. The resolved fields exist so this never happens.
  const body = bodyFor(listen({
    name: "Nine Inch Nails - Somewhat Damaged",
    artist: "Nine Inch Nails",
    trackName: "Somewhat Damaged",
  }));
  assert.equal(body.payload[0].track_metadata.artist_name, "Nine Inch Nails");
  assert.equal(body.payload[0].track_metadata.track_name, "Somewhat Damaged");
});

test("a field MA did not resolve is omitted, never sent empty", () => {
  // The API docs: "If you do not have the data for any of the following fields, omit the key
  // entirely." An empty release_name is a wrong answer written permanently.
  const body = bodyFor(listen({ albumName: null, durationSec: null }));
  assert.equal("release_name" in body.payload[0].track_metadata, false);
  assert.equal("duration_ms" in body.payload[0].track_metadata.additional_info, false);
});

test("only listens that met the threshold and have real names are submittable", () => {
  assert.equal(submittable(listen()), true);
  assert.equal(submittable(listen({ completed: false })), false, "a skip is not a listen");
  assert.equal(submittable(listen({ artist: null })), false, "no artist, no submission");
  assert.equal(submittable(listen({ trackName: null })), false, "no title, no submission");
});

test("an auto-advanced listen is still submitted", async () => {
  // Scrobbling answers *what was heard*. The favourite marks answer *what he chose*. Dropping
  // autoplay here would under-report the listening to keep a distinction that lives elsewhere.
  const h = harness();
  h.scrobbler.submit(listen({ deliberate: false }));
  await h.scrobbler.settle();
  assert.equal(h.calls.length, 1);
});

test("the required headers are present on every call", async () => {
  const h = harness();
  h.scrobbler.submit(listen());
  await h.scrobbler.settle();

  const headers = h.calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Token test-token");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["User-Agent"], USER_AGENT, "the docs require a real User-Agent");
  assert.match(USER_AGENT, /^platebunken\//);
});

test("the User-Agent carries no household detail", () => {
  // It is public on every single request. No hostname, no room, no name.
  assert.doesNotMatch(USER_AGENT, /\d+\.\d+\.\d+\.\d+|\.lan|\.local/i);
});

test("no token means nothing is sent and nothing throws", async () => {
  const f = fakeFetch();
  const scrobbler = createScrobbler({ token: "", fetchImpl: f.impl, sleep: async () => {} });
  assert.equal(scrobbler.enabled, false);
  scrobbler.submit(listen());
  await scrobbler.settle();
  assert.equal(f.calls.length, 0, "an unconfigured scrobbler is silent, not broken");
  assert.equal(scrobbler.pending, 0);
});

test("a 401 is dropped rather than retried forever", async () => {
  // Hammering an endpoint with a bad credential is how a client gets banned. The only person
  // who can fix it reads the log.
  const h = harness([{ status: 401 }]);
  h.scrobbler.submit(listen());
  await h.scrobbler.settle();

  assert.equal(h.calls.length, 1);
  assert.equal(h.scrobbler.pending, 0);
  assert.ok(h.logs.some((l) => l.includes("401")), "the parent must be told");
});

test("a 400 is dropped: a payload this client built wrong will not fix itself", async () => {
  const h = harness([{ status: 400 }]);
  h.scrobbler.submit(listen());
  await h.scrobbler.settle();
  assert.equal(h.scrobbler.pending, 0);
  assert.equal(h.calls.length, 1);
});

test("an unreachable network keeps the listen instead of losing it", async () => {
  const failing = (async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as unknown as typeof fetch;
  const logs: string[] = [];
  const scrobbler = createScrobbler({
    token: "t", fetchImpl: failing, sleep: async () => {}, now: () => 1_000_000, onLog: (m) => logs.push(m),
  });

  scrobbler.submit(listen());
  await scrobbler.settle();

  assert.equal(scrobbler.pending, 1, "held for the next attempt, not dropped");
  assert.ok(logs.some((l) => l.includes("unreachable")));
});

test("a held listen goes out when the next one arrives", async () => {
  // The drain stops rather than spinning; a bedroom speaker restarts it within minutes.
  let fail = true;
  const calls: number[] = [];
  const impl = (async () => {
    calls.push(1);
    if (fail) throw new Error("down");
    return { ok: true, status: 200, headers: { get: () => null } } as unknown as Response;
  }) as unknown as typeof fetch;

  const scrobbler = createScrobbler({ token: "t", fetchImpl: impl, sleep: async () => {}, now: () => 1_000_000, onLog: () => {} });

  scrobbler.submit(listen());
  await scrobbler.settle();
  assert.equal(scrobbler.pending, 1);

  fail = false;
  scrobbler.submit(listen({ trackName: "Second" }));
  await scrobbler.settle();
  assert.equal(scrobbler.pending, 0, "both went out once the network came back");
});

test("a 429 is honoured and the listen is kept", async () => {
  const waits: number[] = [];
  const f = fakeFetch([{ status: 429, headers: { "X-RateLimit-Reset-In": "7" } }]);
  const scrobbler = createScrobbler({
    token: "t", fetchImpl: f.impl, now: () => 1_000_000, onLog: () => {},
    sleep: async (ms) => { waits.push(ms); },
  });

  scrobbler.submit(listen());
  await scrobbler.settle();

  assert.ok(waits.includes(7000), "the server's own reset window is obeyed");
  assert.equal(scrobbler.pending, 1, "kept, not dropped");
});

test("the backlog is bounded and drops the oldest first", async () => {
  // A container that grows until it is killed is a worse failure than a lost scrobble.
  const failing = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
  const scrobbler = createScrobbler({ token: "t", fetchImpl: failing, sleep: async () => {}, now: () => 1_000_000, onLog: () => {} });

  for (let i = 0; i < MAX_PENDING + 25; i++) {
    scrobbler.submit(listen({ trackName: `Track ${i}` }));
    await scrobbler.settle();
  }
  assert.equal(scrobbler.pending, MAX_PENDING);
});

test("submission is serial and spaced by at least a second", async () => {
  // "Never make more than ONE call per second" — the API docs, verbatim.
  const f = fakeFetch();
  let clock = 0;
  const scrobbler = createScrobbler({
    token: "t", fetchImpl: f.impl, now: () => clock,
    sleep: async (ms) => { clock += ms; },
    onLog: () => {},
  });

  scrobbler.submit(listen({ trackName: "One" }));
  scrobbler.submit(listen({ trackName: "Two" }));
  scrobbler.submit(listen({ trackName: "Three" }));
  await scrobbler.settle();

  assert.equal(f.calls.length, 3);
  assert.ok(clock >= 2200, `three calls must span at least two gaps, got ${clock}ms`);
});
