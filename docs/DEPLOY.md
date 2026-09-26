# Deploying platebunken-server

The image is published to GHCR by `.github/workflows/image.yml` on every push to `main` and
every `v*` tag. The Docker host **pulls** it; it does not build. ARCHITECTURE.md §3.1: *the
image is the deployment — rebuild from a tag, roll back to a tag.*

**No real hostname, address, token or player id appears in this file.** They live in `.env`
and in `ansible/group_vars/kiosk.yml`, both gitignored. This repository may be made public.

---

## 0. The thing to get right first

**The crate is not in the image. The crate is the volume.**

`platebunken-crate` holds which albums the child owns and — far more importantly — which
**position** each one sits in. Those positions are append-only, the database refuses to
renumber them, and they are the only index a pre-reader has into his own music. Everything
else in the stack is rebuilt from the image in thirty seconds. This is not.

Two consequences, both of which have to be handled deliberately:

- **A fresh deploy starts empty.** If a store already exists elsewhere — on the machine the
  project was developed on, or on a previous host — it must be copied into the volume
  *before* the child sees the result (§3). An empty crate looks to a four-year-old exactly
  like all of his music being gone.

  If there is no store anywhere, the crate is built from the parent's seed playlist, once,
  against the volume:

  ```
  docker compose exec platebunken pb seed            # dry run, writes nothing
  docker compose exec platebunken pb seed --write
  ```

  It reads the playlist twice and refuses to seed if the two reads disagree, because a
  provider playlist can answer partially while Music Assistant is still syncing it and the
  order it writes is **permanent** — positions are append-only and the database will not
  renumber them. Run the dry run first and look at the order it reports.
- **`docker compose down -v` destroys the product.** The `-v` removes that volume. There is
  no other command in this stack that matters half as much.

## 1. Prerequisites on the host

- Docker Engine with the Compose plugin.
- Network access to `ghcr.io`, and to Music Assistant on the LAN.

**No `docker login` is needed.** The GHCR package is public, so the pull is anonymous —
verified by pulling `0.2.2` with an empty Docker credential store. The image contains no
credential of any kind; §3.1 calls a publishable image the test of that, and the build never
touches `.env`.

Note that package visibility is **separate from repository visibility** and is not inherited.
Making the repo public left the package private, and the only symptom was a `denied` on pull
for everyone except the account that published it. It is changed in the UI only — there is no
REST endpoint — under the package's own settings, Danger Zone.

## 2. Files on the host

Only two are needed. The image carries the application.

```
/opt/platebunken/
  compose.yml      # copied from this repo
  .env             # NEVER from this repo. Real values. chmod 600.
```

`.env` is built from `.env.example`, which documents every key. The ones without a sensible
default are `MA_HOST`, `MA_TOKEN`, `PLAYER_ID_PRIMARY`, `SEED_PLAYLIST_ID`, and — if
scrobbling is wanted — `LISTENBRAINZ_TOKEN`.

**Check the host port is free before you start anything:**

```
curl -sS -o /dev/null -w '%{http_code}\n' http://HOST:8080/
```

An empty answer is what you want. Anything else means something already holds 8080, and
`up -d` will fail with *port is already allocated* — that is not hypothetical, it is what the
first host this was deployed to did. Set `PLATEBUNKEN_PORT` to a free port; the container
always listens on 8080 internally, so only the host side moves, and the reverse proxy, the DNS
record and `kiosk_url` must all use the same number.

**`VOLUME_CEILING` is a hearing-safety limit**, not a preference. PRODUCT.md requires it to
come from an SPL measurement at the child's pillow rather than from the default.

**`TZ` must be the household's timezone.** The new shelf is released once a day at 06:00
*local*, and "the new shelf arrives in the morning" is a statement about the child's morning.
A container defaults to UTC.

## 3. Carry the existing store across, if there is one

Do this **before** the first start, so the container never comes up on an empty crate.

On the machine that holds the store — never a plain `cp`, which on a live WAL database silently
loses everything not yet checkpointed:

```
npm run pb -- backup /tmp/platebunken.sqlite
```

It prints how many albums and candidates are in the copy it just made. Check that against what
you expect before carrying it anywhere: the failure this replaces produced a file that opened
cleanly and was simply out of date.

Copy that file to the host, then load it into the named volume:

```
docker volume create platebunken-crate
docker run --rm -v platebunken-crate:/data -v /tmp:/in alpine \
  sh -c 'cp /in/platebunken.sqlite /data/platebunken.sqlite && chown -R 1000:1000 /data'
```

`1000:1000` is the `node` user the container runs as (verified: `id node` in the image).

**`-R`, on the directory — not just the file.** Chowning only the file leaves `/data` owned by
root, and the container then fails to start with:

```
Error: attempt to write a readonly database
    at openStore (file:///app/src/store/db.ts:23)
```

which names the database and is really about the *directory*. SQLite in WAL mode creates
`platebunken.sqlite-wal` and `-shm` beside the database, so a process that cannot create files
in `/data` cannot open the store for writing even when the store file itself is writable. The
Dockerfile's own `chown -R node:node /data` only applies to a volume that is empty on first
mount; a volume pre-loaded by another container has whatever ownership that container left.

Verify before going further — it is one command and it is the difference between a working
crate and a container that restarts forever:

```
docker run --rm -v platebunken-crate:/data alpine stat -c '%u:%g %a' /data     # 1000:1000 755
```

## 4. Start it

```
docker compose pull
docker compose up -d
docker compose logs -f
```

The boot log states what is true: the store path, how many albums are in the crate, how many
are waiting to release, how many are in the review queue, and whether it can play at all.
Every line there is something that has cost time when it was wrong.

Verify:

```
curl -fsS http://localhost:${PLATEBUNKEN_PORT:-8080}/healthz     # {"ok":true,...}
```

`/healthz` asks the application, not the port: a container whose socket is open but whose
store will not open must not report healthy.

**`canPlay:false` is not a failure.** It means no player is configured — `PLAYER_ID_PRIMARY`
is empty — and the crate renders and stays silent, which is the correct state for a deployment
whose `VOLUME_CEILING` has not yet come from an SPL measurement at the pillow. `ok:true` is the
part that says the deployment works. Expect `false` until a player is deliberately chosen, and
do not go hunting for a fault that is a decision.

## 5. Rolling forward and back

**`docker compose pull && docker compose up -d` follows whatever `PLATEBUNKEN_TAG` is set to
in the host's `.env` — it does not mean "newest release" unless that key is absent or empty.**
A host's `.env` is written once and then left alone, so a tag pinned during an earlier deploy
stays pinned: `pull && up -d` against a `.env` still reading `PLATEBUNKEN_TAG=0.3.0` silently
re-pulls 0.3.0, and the operator believes they shipped whatever is newest. Check what is
pinned before relying on the comment below:

```
grep PLATEBUNKEN_TAG .env
```

To roll forward or back **for good**, edit `.env` itself, then pull and restart:

```
# .env: PLATEBUNKEN_TAG=0.4.0
docker compose pull && docker compose up -d      # follows .env's pin — remove the key entirely for :latest
```

Setting it only on the command line —

```
PLATEBUNKEN_TAG=0.4.0 docker compose up -d       # recreates the container, does NOT touch .env
```

— recreates the running container but leaves `.env` exactly as it was. The next plain
`docker compose up -d` (a reboot, a host restart, anyone re-running the documented command)
reads `.env` again and silently rolls back to whatever was pinned before. Use this form only
to try a tag briefly; write the real value to `.env` for anything meant to stick.

`:latest` follows the newest **semver tag**, never `main`, and only when `PLATEBUNKEN_TAG` is
unset. Pull `:main` deliberately if the current commit is wanted.

To build on the host instead — for a day when the registry is unreachable:

```
docker compose -f compose.yml -f compose.build.yml up -d --build
```

## 6. Backups

Back up the **volume**, on the host's own schedule. There is nothing bespoke to configure, but
there is one rule: **use SQLite's own backup, not a file copy.** The database runs in WAL mode
and a plain `cp` of a live database is missing whatever is still in the `-wal` sidecar. A copy
taken that way during this deployment read 16 albums and 0 pending when the real store had 46
and 30, and nothing anywhere said so.

```
docker compose exec platebunken pb backup /tmp/backup.sqlite
docker cp platebunken:/tmp/backup.sqlite ./platebunken-$(date +%F).sqlite
```

Safe while the server is running, and it prints what is in the copy so a backup nobody has
counted is not a backup nobody has checked. It refuses to write over an existing file, so a
schedule that reuses one name fails loudly rather than keeping a single rolling copy.

`/tmp` because compose mounts the container `read_only:` with a tmpfs there; `/data/...` works
too and lands in the volume you are backing up, which is usually not what you want.

## 7. Reverse proxy, if one is used

Plain HTTP on one port, one upstream, no websockets to the browser and no sticky sessions.
Two headers matter:

- The kiosk's own address must survive as `X-Forwarded-For`, or the parent's Device tab
  compares the proxy against the DHCP reservation and reports a mismatch on every correct
  deployment.
- The child's page and `/admin` are same-origin by design. Do not split them across hosts.

## 8. Point the kiosk at it

`kiosk_url` in the gitignored `ansible/group_vars/kiosk.yml` becomes the deployed address.
The launcher derives `kiosk_origin` and `kiosk_health_url` from it and **waits on `/healthz`
before opening the browser** — without that the child gets Chromium's own white English error
page, which is the worst possible failure for a pre-reader.

## 9. After the first start

- **Nothing plays until a player is configured.** `canPlay:false` in the boot log and at
  `/healthz` means `MA_HOST`, `MA_TOKEN` or `PLAYER_ID_PRIMARY` is missing. The crate still
  renders; it is silent. That is a deliberately better failure than a crate that looks broken.
- **The review queue is at `/admin`**, behind the same four digits as the settings screen
  (`GATE_PIN`). It is a child gate, not security.
- **One album is released each morning, from whatever has been approved by then, at most one a
  day.** Not "at exactly 06:00" — the gate (`trickleDue` in `src/server/trickle.ts`) is "not
  before 06:00 local, and not if something has *already* released today," checked by reading
  the newest `released_at` off the store, never by marking the day itself used. If nothing was
  waiting when 06:00 came round, the day's release is not spent — the first check afterwards
  that finds something waiting releases it then, container restart included. Two releases on
  one calendar day is what the check refuses, not "a release outside a five-minute window".
  `/admin` can push a release immediately when that is wanted.
- **The curation worker runs itself**, once a day after 03:00 local, inside the container. The
  boot log says so. It fills the review queue and **decides nothing** — the gate at /admin is
  where a person approves, and `approve()` refuses anything that skipped it, so an automatic
  curation cannot put music in front of the child.

  This was previously `npm run curate -- --write` from a checkout, and it was a bug rather than
  a choice: `scripts/` never shipped in the image, so on this deployment the queue drained as
  the parent approved and nothing could refill it. The obvious repair — ship a command — only
  makes refilling *possible*. A maintenance step that depends on someone remembering fails the
  same way, weeks later, with an empty queue and no obvious cause.

  To run one now, or to see what it would find:

  ```
  docker compose exec platebunken pb curate            # dry run, writes nothing
  docker compose exec platebunken pb curate --write
  ```

  The first `--write` run is slow on purpose: it pulls the Metal Archives theme rosters at that
  site's published 3-second crawl delay. They are cached in the store for a month afterwards.
