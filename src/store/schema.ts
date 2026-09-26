/**
 * The approved set, as a schema.
 *
 * ARCHITECTURE.md §5 calls the approval gate "an architectural boundary, not a setting",
 * and PRODUCT.md principle 2 says nothing the child has memorised ever moves. Both are
 * enforced here, in the database, by triggers — not in application code. A rule that lives
 * only in a function is a rule a future code path can walk around.
 *
 * Migrations are ordered and applied by `PRAGMA user_version`. Never edit a shipped entry;
 * append a new one. The crate's positions are the child's only index into his music, and a
 * migration that renumbers them destroys the product for him.
 */
export const MIGRATIONS: readonly string[] = [
  /* v1 ─────────────────────────────────────────────────────────────────── */ `
  -- Who the crate is for. There is one today. There is a second child, seven years older,
  -- and retrofitting this column after positions exist would mean renumbering them — which
  -- the triggers below correctly refuse. So it exists now, unused by the UI.
  --
  -- Ids are opaque and labels come from the environment: no child's name reaches this repo.
  CREATE TABLE profile (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    created_at  TEXT NOT NULL
  ) STRICT;

  -- Everything we know about, approved or not. Not the crate.
  CREATE TABLE album (
    uri             TEXT PRIMARY KEY,   -- the MA handle we actually play
    provider        TEXT NOT NULL,
    item_id         TEXT NOT NULL,
    -- Artist and title are not decoration. A library:// uri is a row id in Music Assistant's
    -- own database; if that library is ever rebuilt, the uri is gone and only these can
    -- re-resolve the album. Losing an approved album silently is worse than any duplicate.
    artist          TEXT NOT NULL,
    title           TEXT NOT NULL,
    year            INTEGER,
    mbid            TEXT,               -- the only provider-independent identity, when known
    -- Null means no artwork, which in a cover-art interface means an invisible album.
    -- Counted, not hidden: it is what the beets pass in ARCHITECTURE.md §5 exists to fix.
    cover_proxy_id  TEXT,
    -- NULL = unknown. Absent is NOT clean (docs/research/03). The CHECK keeps the three
    -- states distinct so no one can collapse unknown into false.
    explicit        INTEGER CHECK (explicit IN (0, 1)),
    first_seen      TEXT NOT NULL
  ) STRICT;

  -- The review queue. One album can arrive from several sources; each is its own row, so a
  -- rejection from one source does not erase the fact that another source also found it.
  CREATE TABLE candidate (
    uri           TEXT NOT NULL REFERENCES album(uri),
    source        TEXT NOT NULL CHECK (source IN ('seed','similar','chart','request')),
    source_detail TEXT,
    suggested_at  TEXT NOT NULL,
    decided_at    TEXT,
    decision      TEXT CHECK (decision IN ('approved','rejected')),
    PRIMARY KEY (uri, source)
  ) STRICT;

  -- Advisory annotations. ARCHITECTURE.md §5: "Annotations are advisory. Nothing is ever
  -- auto-rejected." Burzum's Metal Archives themes read "Mythology, Folklore, Odalism" —
  -- the most notorious case in the genre passes every automated theme filter. Flags sort
  -- the queue. A person decides.
  CREATE TABLE flag (
    uri    TEXT NOT NULL REFERENCES album(uri),
    kind   TEXT NOT NULL,
    detail TEXT,
    source TEXT NOT NULL,
    PRIMARY KEY (uri, kind)
  ) STRICT;

  -- THE CRATE. Append-only, per profile.
  --
  -- position is assigned at RELEASE, not at approval, because the new shelf trickles: a
  -- dozen albums approved at once still arrive one at a time, so there is nearly always a
  -- reason to walk over and look (§4.1). Until released, position is NULL and the album is
  -- approved but not yet in the crate. Positions are 0-based; page = position / 9.
  --
  -- withdrawn_at, never DELETE. If the parent takes an album back, its slot stays empty
  -- forever rather than letting the rest of the crate flow up into it. An empty slot costs
  -- one tile. Re-flowing costs every position the child has memorised after it.
  CREATE TABLE approved (
    profile_id   TEXT NOT NULL REFERENCES profile(id),
    uri          TEXT NOT NULL REFERENCES album(uri),
    approved_at  TEXT NOT NULL,
    position     INTEGER,
    released_at  TEXT,
    withdrawn_at TEXT,
    PRIMARY KEY (profile_id, uri)
  ) STRICT;

  CREATE UNIQUE INDEX approved_position ON approved(profile_id, position);
  CREATE INDEX approved_unreleased ON approved(profile_id, approved_at) WHERE position IS NULL;
  CREATE INDEX candidate_pending ON candidate(suggested_at) WHERE decision IS NULL;

  -- Principle 2, as a constraint. A position may be filled once, from NULL, and after that
  -- it is immutable for the life of the database.
  CREATE TRIGGER approved_position_set_once
  BEFORE UPDATE OF position ON approved
  WHEN OLD.position IS NOT NULL AND (NEW.position IS NULL OR NEW.position <> OLD.position)
  BEGIN
    SELECT RAISE(ABORT, 'crate is append-only: a released position never changes');
  END;

  CREATE TRIGGER approved_identity_frozen
  BEFORE UPDATE OF profile_id, uri ON approved
  WHEN NEW.profile_id <> OLD.profile_id OR NEW.uri <> OLD.uri
  BEGIN
    SELECT RAISE(ABORT, 'crate is append-only: a slot never changes album or owner');
  END;

  CREATE TRIGGER approved_never_deleted
  BEFORE DELETE ON approved
  BEGIN
    SELECT RAISE(ABORT, 'crate is append-only: withdraw sets withdrawn_at, it does not delete');
  END;
  `,

  /* v2 ─────────────────────────────────────────────────────────────────── */ `
  -- The number line (§4.2), and the uri that starts a record part-way through.
  --
  -- These are cached from Music Assistant, not owned here. The alternative was to ask MA
  -- for an album's tracks when the child opens it, and that fails exactly when §10 says it
  -- must not: MA unreachable is supposed to mean "sleepy crate, covers from cache", and a
  -- track list fetched on open would turn it into an album that opens onto nothing.
  --
  -- Unlike a crate position, a track row is NOT append-only. A re-tag can renumber an
  -- album, and freezing the first answer would mean the number line permanently disagreeing
  -- with what actually plays. Positions are what the child memorises; track numbers belong
  -- to the record.
  CREATE TABLE track (
    album_uri TEXT NOT NULL REFERENCES album(uri) ON DELETE CASCADE,
    n         INTEGER NOT NULL,
    title     TEXT NOT NULL,
    -- play_media's documented start_item parameter. NULL falls back to playing the album and
    -- jumping, which is two commands and a brief burst of the wrong track.
    uri       TEXT,
    PRIMARY KEY (album_uri, n)
  ) STRICT;

  -- Every play, appended. The *recent* and *most-played* shelves are built from this and
  -- from nothing else — there is no separate tracking, because what he played is what he
  -- played. Before this table the two shelves lived in page memory and reset on reload,
  -- which on a kiosk that reboots nightly meant they were empty every morning.
  --
  -- A log, not a counter: a counter cannot answer "recent", and it cannot be recomputed if
  -- the shelf rules ever change. Rows are small and a four-year-old is not high-volume.
  CREATE TABLE play (
    profile_id TEXT NOT NULL REFERENCES profile(id),
    uri        TEXT NOT NULL REFERENCES album(uri),
    played_at  TEXT NOT NULL
  ) STRICT;

  CREATE INDEX play_recent ON play(profile_id, played_at DESC);
  CREATE INDEX play_album  ON play(profile_id, uri);
  `,

  /* v3 ─────────────────────────────────────────────────────────────────── */ `
  -- WHICH track he chose, not just which album.
  --
  -- Null for rows written before this column existed, and null is not zero: an unknown track
  -- must not be counted as track 1 and quietly invent a favourite nobody played.
  --
  -- This counts DELIBERATE choices only. Nothing here knows that track 2 started when track 1
  -- ended, because the server does not follow the queue yet. That turns out to be the better
  -- signal for a favourite: a track that played because it came next is not a track he loves,
  -- and a four-year-old who walks back to the screen to press 7 again is telling you something
  -- that autoplay never could. When the queue subscription lands, auto-advanced plays should
  -- be recorded DISTINCTLY rather than folded in here.
  ALTER TABLE play ADD COLUMN track_n INTEGER;

  -- Settings that outlive a reboot.
  --
  -- Until now every setting lived in page memory, so a kiosk that reboots nightly forgot the
  -- theme, the language and the numeral face every morning — and the speaker the parent chose
  -- reverted on every redeploy, which with a container is often.
  --
  -- Deliberately NOT here: VOLUME_CEILING. It is a hearing-safety limit set from an SPL
  -- measurement at the pillow (PRODUCT.md), so it belongs to the deployment and not to a
  -- screen behind a four-digit gate that stops a four-year-old and nobody else. It stays in
  -- the environment and the settings screen shows it read-only.
  --
  -- Values are JSON so a setting can be a number, a flag or an object without a second table
  -- and without every reader guessing at a string.
  CREATE TABLE setting (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;
  `,

  /* v4 ─────────────────────────────────────────────────────────────────── */ `
  -- A cache for the curation worker, and ONLY a cache.
  --
  -- Every row here can be deleted and refetched. Nothing the parent decided lives in this
  -- table, nothing the child sees depends on it, and no invariant is defended by it — which
  -- is why it is one loose key-value table rather than a modelled one. The things it holds
  -- are answers from three services that must not be asked again on every run:
  --
  --   artist_mbid  an artist name -> its MusicBrainz id. MusicBrainz asks for no more than
  --                one request per second, and the crate's artists do not change hourly.
  --   similar      an MBID -> its ListenBrainz Labs neighbours.
  --   theme_roster Encyclopaedia Metallum's band list for one theme term. MA sets
  --                Crawl-delay: 3 and the National Socialism roster alone is 1256 bands, so
  --                this is fetched monthly and read from here every run.
  --
  -- fetched_at is what makes a row refreshable; there is no TTL column because the policy
  -- belongs to the caller, and the two callers here want very different ones.
  CREATE TABLE curate_cache (
    kind       TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,   -- JSON
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (kind, key)
  ) STRICT;
  `,

  /* v5 ─────────────────────────────────────────────────────────────────── */ `
  -- A manual "like", per track, per profile. The product's original rule — no like button,
  -- ever, because a mark he could chase turns listening into a game with a score — is
  -- overridden here on purpose. This is a PREFERENCE, not a record of what happened, which is
  -- why it is deleted on toggle-off rather than append-only like play or approved: there is
  -- nothing here worth keeping evidence of once he changes his mind.
  --
  -- Profile-scoped like play, not global like track: a second child (schema v1's profile
  -- table) must get his own likes on a shared record, not his sibling's.
  CREATE TABLE manual_favourite (
    profile_id TEXT NOT NULL REFERENCES profile(id),
    album_uri  TEXT NOT NULL REFERENCES album(uri) ON DELETE CASCADE,
    track_n    INTEGER NOT NULL,
    set_at     TEXT NOT NULL,
    PRIMARY KEY (profile_id, album_uri, track_n)
  ) STRICT;

  -- The parent pre-selecting which approved album goes out NEXT — a different actor (parent,
  -- not child) and a different granularity (a whole record, not one track) from the table
  -- above. It only ever changes which unreleased row release() picks first: restricted in
  -- application code to rows where position IS NULL, because once a position is spent there
  -- is nothing left to influence, and a flag nothing reads is the toggle-that-does-nothing bug
  -- this codebase has already shipped twice.
  ALTER TABLE approved ADD COLUMN recommended INTEGER NOT NULL DEFAULT 0 CHECK (recommended IN (0,1));
  `,
];
