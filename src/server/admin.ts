/**
 * The parent's review queue, at /admin.
 *
 * ARCHITECTURE.md §6: cover, artist, annotations, ✓ / ✗. Ten seconds a day, on a phone.
 *
 * **Served as one self-contained string, not built by Vite.** The child's crate is the thing
 * with a bundle, a service worker and a font pipeline; this is a page the parent opens once a
 * day on a phone with a good connection. Giving it a second Vite entry would mean a second
 * build output, a second set of fingerprinted asset names for the service worker to be told
 * about, and a config change that can break the child's crate while nobody is looking at it.
 * A string in a .ts file has none of those failure modes and ships with `COPY src/server`.
 *
 * Two deliberate constraints on the code below:
 *
 *   - **No backticks anywhere inside it.** This whole file is one template literal, and a
 *     backtick ends the string. That already cost this project a migration (see the commit
 *     for schema v3), so the rule is absolute rather than careful.
 *   - **The DOM is built with createElement and textContent, never innerHTML.** Artist and
 *     album titles arrive from Qobuz and are not this project's strings to trust. textContent
 *     makes injection impossible rather than unlikely, and costs nothing at this size.
 *
 * The page never auto-decides anything. Flags are drawn loudly and sort the queue; §5 is
 * explicit that a person decides, because the most notorious record in the genre passes every
 * automated theme filter.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>Platebunken — kø</title>
<style>
  :root {
    --bg: #14110f; --card: #1e1a17; --line: #2e2823;
    --ink: #f2ece4; --dim: #a1968a;
    --yes: #5c9c5c; --no: #4a4038; --warn: #c8913c; --hot: #b4564a;
    --radius: 14px;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 0 16px calc(32px + env(safe-area-inset-bottom));
    max-width: 640px; margin-inline: auto;
  }
  header { padding: 20px 0 12px; display: flex; align-items: baseline; gap: 10px; }
  h1 { font-size: 19px; margin: 0; letter-spacing: .01em; font-weight: 650; }
  .count { color: var(--dim); font-size: 14px; font-variant-numeric: tabular-nums; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 14px; margin-bottom: 14px;
  }
  .top { display: flex; gap: 13px; }
  .art {
    width: 96px; height: 96px; flex: none; border-radius: 9px; object-fit: cover;
    background: #2a2420; display: block;
  }
  .art.none { display: grid; place-items: center; color: var(--dim); font-size: 26px; }
  .meta { min-width: 0; flex: 1; }
  .artist { font-weight: 640; line-height: 1.25; }
  .title { color: var(--dim); line-height: 1.3; margin-top: 1px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .chip {
    font-size: 12px; padding: 2px 8px; border-radius: 999px;
    border: 1px solid var(--line); color: var(--dim); white-space: nowrap;
  }
  .chip.explicit { border-color: var(--hot); color: #e8a49a; }
  .chip.unknown { border-color: #55483c; color: #c2ae95; }
  .flags { margin-top: 11px; display: grid; gap: 7px; }
  .flag {
    border-left: 3px solid var(--warn); background: #241d13;
    padding: 7px 10px; border-radius: 0 8px 8px 0; font-size: 14px;
  }
  .flag b { color: #e8c07a; font-weight: 620; }
  .flag span { color: var(--dim); display: block; margin-top: 1px; font-size: 13px; }
  .advisory { color: var(--dim); font-size: 12px; margin-top: 6px; font-style: italic; }
  details { margin-top: 11px; }
  summary { color: var(--dim); font-size: 14px; cursor: pointer; }
  ol { margin: 8px 0 0; padding-left: 26px; color: var(--dim); font-size: 14px; }
  li { margin: 2px 0; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
  button {
    font: inherit; font-weight: 640; color: var(--ink); border: 1px solid var(--line);
    border-radius: 11px; padding: 15px 0; background: var(--no); cursor: pointer;
    min-height: 52px;
  }
  button.yes { background: var(--yes); border-color: #6cae6c; }
  button:disabled { opacity: .45; }
  button:active { transform: translateY(1px); }
  .empty { color: var(--dim); text-align: center; padding: 56px 20px; line-height: 1.6; }
  .empty b { color: var(--ink); display: block; font-size: 17px; margin-bottom: 6px; font-weight: 620; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .07em;
       color: var(--dim); margin: 30px 0 10px; font-weight: 620; }
  .row { display: flex; align-items: center; gap: 11px; padding: 9px 0;
         border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: 0; }
  .row .art { width: 40px; height: 40px; border-radius: 6px; font-size: 15px; }
  .row .meta { font-size: 14px; }
  .row .title { font-size: 13px; }
  .row button { padding: 9px 13px; font-size: 14px; min-height: 0; flex: none; }
  .err { background: #3a2220; border: 1px solid var(--hot); color: #f0c4bc;
         padding: 11px 13px; border-radius: 10px; margin-bottom: 14px; font-size: 14px; }
</style>
</head>
<body>
<header><h1>Platebunken</h1><span class="count" id="count"></span></header>
<div id="err"></div>
<main id="queue"><p class="empty">Laster…</p></main>
<section id="rejected-wrap" hidden>
  <h2>Nylig avvist</h2>
  <div id="rejected" class="card"></div>
</section>

<script>
(function () {
  "use strict";
  var queue = document.getElementById("queue");
  var rejected = document.getElementById("rejected");
  var rejectedWrap = document.getElementById("rejected-wrap");
  var countEl = document.getElementById("count");
  var errEl = document.getElementById("err");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function showError(message) {
    errEl.textContent = "";
    if (!message) return;
    errEl.appendChild(el("div", "err", message));
  }

  /** A sleeve, or a placeholder that is a shape rather than a hole. */
  function art(c, cls) {
    if (c.cover) {
      var img = document.createElement("img");
      img.className = cls;
      img.src = c.cover.sm;
      img.alt = "";
      img.loading = "lazy";
      return img;
    }
    var box = el("div", cls + " none", "\\u266a");
    return box;
  }

  function chips(c) {
    var wrap = el("div", "chips");
    if (c.year) wrap.appendChild(el("span", "chip", c.year));
    // null is UNKNOWN and unknown is never clean. The two states are drawn differently
    // on purpose: collapsing them is the mistake docs/research/03 warns about.
    if (c.explicit === true) wrap.appendChild(el("span", "chip explicit", "eksplisitt"));
    else if (c.explicit === null) wrap.appendChild(el("span", "chip unknown", "ukjent merking"));
    var src = c.source + (c.sourceDetail ? ": " + c.sourceDetail : "");
    wrap.appendChild(el("span", "chip", src));
    return wrap;
  }

  function card(c) {
    var root = el("div", "card");
    var top = el("div", "top");
    top.appendChild(art(c, "art"));

    var meta = el("div", "meta");
    meta.appendChild(el("div", "artist", c.artist));
    meta.appendChild(el("div", "title", c.title));
    meta.appendChild(chips(c));
    top.appendChild(meta);
    root.appendChild(top);

    if (c.flags && c.flags.length) {
      var flags = el("div", "flags");
      c.flags.forEach(function (f) {
        var box = el("div", "flag");
        box.appendChild(el("b", null, f.kind));
        if (f.detail) box.appendChild(el("span", null, f.detail));
        box.appendChild(el("span", null, "kilde: " + f.source));
        flags.appendChild(box);
      });
      root.appendChild(flags);
      root.appendChild(el("p", "advisory",
        "Merknader er veiledende. Ingenting avvises automatisk \\u2014 du bestemmer."));
    }

    if (c.tracks && c.tracks.length) {
      var d = document.createElement("details");
      d.appendChild(el("summary", null, c.tracks.length + " spor"));
      var ol = document.createElement("ol");
      c.tracks.forEach(function (t) {
        var li = el("li", null, t.title);
        li.value = t.n;
        ol.appendChild(li);
      });
      d.appendChild(ol);
      root.appendChild(d);
    }

    var actions = el("div", "actions");
    var no = el("button", null, "\\u2717  Nei");
    var yes = el("button", "yes", "\\u2713  Ja");
    no.addEventListener("click", function () { decide(c.uri, "rejected", root, [no, yes]); });
    yes.addEventListener("click", function () { decide(c.uri, "approved", root, [no, yes]); });
    actions.appendChild(no);
    actions.appendChild(yes);
    root.appendChild(actions);
    return root;
  }

  function rejectedRow(c) {
    var row = el("div", "row");
    row.appendChild(art(c, "art"));
    var meta = el("div", "meta");
    meta.appendChild(el("div", "artist", c.artist));
    meta.appendChild(el("div", "title", c.title));
    row.appendChild(meta);
    var again = el("button", null, "Angre");
    again.addEventListener("click", function () {
      again.disabled = true;
      send("/api/review/reopen", { uri: c.uri }, again);
    });
    row.appendChild(again);
    return row;
  }

  function decide(uri, decision, cardEl, buttons) {
    buttons.forEach(function (b) { b.disabled = true; });
    send("/api/review/decide", { uri: uri, decision: decision }, buttons[0]);
  }

  function send(path, payload, reEnable) {
    showError("");
    fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (!out.ok) {
        // Say what went wrong rather than silently reverting. A parent who believes they
        // approved something and did not is worse off than one who sees the reason.
        showError(out.error || "Noe gikk galt.");
      }
      load();
    }).catch(function (e) {
      showError("Ingen kontakt med serveren: " + e.message);
      if (reEnable) reEnable.disabled = false;
    });
  }

  function render(data) {
    queue.textContent = "";
    countEl.textContent = data.pending.length ? data.pending.length + " i k\\u00f8" : "";

    if (!data.pending.length) {
      var empty = el("p", "empty");
      empty.appendChild(el("b", null, "K\\u00f8en er tom"));
      empty.appendChild(document.createTextNode(
        "Ingenting venter p\\u00e5 deg. Nye forslag dukker opp her."));
      queue.appendChild(empty);
    } else {
      data.pending.forEach(function (c) { queue.appendChild(card(c)); });
    }

    rejected.textContent = "";
    rejectedWrap.hidden = !data.rejected.length;
    data.rejected.forEach(function (c) { rejected.appendChild(rejectedRow(c)); });
  }

  function load() {
    fetch("/api/review", { headers: { accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function (e) {
        queue.textContent = "";
        showError("Kunne ikke hente k\\u00f8en: " + e.message);
      });
  }

  load();
  // The phone is usually reopened rather than refreshed.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) load();
  });
})();
</script>
</body>
</html>`;
