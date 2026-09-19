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
  *before* the child sees the result. An empty crate looks to a four-year-old exactly like
  all of his music being gone.
- **`docker compose down -v` destroys the product.** The `-v` removes that volume. There is
  no other command in this stack that matters half as much.

## 1. Prerequisites on the host

- Docker Engine with the Compose plugin.
- Network access to `ghcr.io`, and to Music Assistant on the LAN.
- If the repository is private, its GHCR package is private too:

  ```
  docker login ghcr.io -u <github-username>     # paste a PAT with read:packages
  ```

  The image contains **no credential** — §3.1 calls a publishable image the test of that, and
  the build never touches `.env` — so the package may instead be made public while the
  repository stays private. That removes this step entirely.

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
node -e 'const {DatabaseSync}=require("node:sqlite");
  new DatabaseSync("./data/platebunken.sqlite",{readOnly:true})
    .exec("VACUUM INTO \x27/tmp/platebunken.sqlite\x27")'
```

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
curl -fsS http://localhost:8080/healthz          # {"ok":true,"canPlay":true}
```

`/healthz` asks the application, not the port: a container whose socket is open but whose
store will not open must not report healthy.

## 5. Rolling forward and back

```
PLATEBUNKEN_TAG=0.1.0 docker compose up -d       # a specific release
docker compose pull && docker compose up -d      # newest release (:latest)
```

`:latest` follows the newest **semver tag**, never `main`. Pull `:main` deliberately if the
current commit is wanted.

To build on the host instead — for a day when the registry is unreachable:

```
docker compose -f compose.yml -f compose.build.yml up -d --build
```

## 6. Backups

Back up the **volume**, on the host's own schedule. There is nothing bespoke to configure, but
there is one rule: **use SQLite's own backup, not a file copy.** The database runs in WAL mode
and a plain `cp` of a live database is missing whatever is still in the `-wal` sidecar.

```
docker exec platebunken node -e \
  'new (require("node:sqlite").DatabaseSync)("/data/platebunken.sqlite",{readOnly:true})
     .exec("VACUUM INTO \x27/tmp/backup.sqlite\x27")'
docker cp platebunken:/tmp/backup.sqlite ./platebunken-$(date +%F).sqlite
```

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
- **One album is released each morning at 06:00 local**, at most one a day, from whatever has
  been approved. `/admin` can push a release immediately when that is wanted.
- **The curation worker is not scheduled.** It is `npm run curate -- --write` and runs from a
  checkout, not from the container. Running it daily from cron on the host is reasonable; it
  is deliberately not automatic inside the image, because nothing it produces reaches the
  child without a person approving it first anyway.
