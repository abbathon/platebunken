/**
 * The cover cache, and the app shell.
 *
 * Hand-written rather than generated. Workbox would pull a build step and a dependency tree
 * into a project that has neither on the server side, for about sixty lines of cache logic that
 * are easier to read than to configure.
 *
 * Two jobs, and they are not the same job:
 *
 *  1. **Covers, cache-first, forever.** Without this, warm covers live only in Chromium's own
 *     disk cache, which is evictable — and a held-down arrow key outruns the network, so an
 *     evicted cover is a black square where a sleeve should be. `/imageproxy/<id>` names one
 *     image and Music Assistant never reissues an id for a different one, so cache-first with
 *     no revalidation is correct rather than merely convenient.
 *
 *  2. **The app shell, so an unreachable server is not a blank browser error.** The page and
 *     the API come from the same origin (ARCHITECTURE.md §3.1), which means a server that is
 *     down is not a page with no data — it is no page at all, and Chromium renders its own
 *     white English error screen at a four-year-old. The kiosk launcher waits for /healthz
 *     before opening the browser, which covers boot; this covers the other half, where the page
 *     is already open and something reloads it. The shell then loads, the crate fetch fails,
 *     and §10's sleepy state does its job.
 *
 * **This requires a secure origin.** Over plain http from another host there is no service
 * worker at all — see §3.1 and `kiosk_treat_as_secure_origin` in the Ansible kiosk role. On
 * localhost it registers normally, which is why development behaves like the kiosk and not
 * like the broken middle case.
 */
const SHELL = "platebunken-shell-v1";
const COVERS = "platebunken-covers-v1";

/** Never cached: these are the live state of the crate and of the speaker. */
const NEVER = ["/api/", "/healthz"];

self.addEventListener("install", (e) => {
  // The shell is whatever the page needs to boot. index.html is fetched fresh here rather than
  // trusted from the HTTP cache, because a stale shell is a deploy that never lands.
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.add(new Request("/", { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== COVERS).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/**
 * Precache the build's own assets, named by the page.
 *
 * The asset filenames are fingerprinted and change with every build, so this worker cannot
 * know them and there is no manifest to read. The page does know them — they are its own
 * <script> and <link> elements — so it posts the list once it has a controller.
 *
 * Without this the shell was the document alone, and an offline reload only worked because
 * Chromium still had the assets in its ordinary HTTP cache. That cache is evictable, so it
 * worked by luck, and the failure would have looked like the kiosk booting to a blank page
 * months later with nothing in the log.
 */
self.addEventListener("message", (e) => {
  const urls = e.data && e.data.type === "precache" ? e.data.urls : null;
  if (!Array.isArray(urls) || urls.length === 0) return;
  e.waitUntil(
    caches.open(SHELL).then(async (cache) => {
      const have = new Set((await cache.keys()).map((r) => r.url));
      await Promise.all(urls
        .filter((u) => !have.has(u))
        // Individually, not cache.addAll: addAll rejects the whole batch if any one request
        // fails, and one missing font must not cost the entire shell.
        .map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    }),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((p) => url.pathname.startsWith(p))) return;

  // Covers: cache-first, and a hit never touches the network.
  if (url.pathname.startsWith("/imageproxy/")) {
    e.respondWith(
      caches.open(COVERS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // Only ever cache a real image. A 502 from a restarting Music Assistant cached
        // cache-first would be a permanently broken sleeve.
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Fingerprinted build assets: cache-first, since the name changes when the bytes do.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
    e.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // The document: network-first, so a deploy lands on the next load — falling back to the
  // cached shell only when the server cannot be reached at all.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put("/", res.clone()));
          return res;
        })
        .catch(() => caches.open(SHELL).then((c) => c.match("/")).then((hit) => hit ?? Response.error())),
    );
  }
});
