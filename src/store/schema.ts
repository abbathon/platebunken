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
];
