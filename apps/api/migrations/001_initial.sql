-- Dhun – initial schema
-- Run against Neon DB with: psql $DATABASE_URL -f migrations/001_initial.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Songs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS songs (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  canonical_title  TEXT NOT NULL,
  film             TEXT NOT NULL,
  year             SMALLINT NOT NULL,
  era              TEXT NOT NULL CHECK (era IN ('50s-70s','80s','90s','2000s','2010s','2020s')),
  artists          TEXT[] NOT NULL DEFAULT '{}',
  composer         TEXT NOT NULL DEFAULT '',
  language         TEXT NOT NULL DEFAULT 'hindi',
  source_platform  TEXT NOT NULL CHECK (source_platform IN ('itunes','deezer')),
  track_id         TEXT NOT NULL,
  preview_url      TEXT NOT NULL,
  difficulty       SMALLINT NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  popularity_score INTEGER NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source_platform, track_id)
);

-- Index for fast random-by-era picks
CREATE INDEX IF NOT EXISTS songs_era_active_idx ON songs (era, active)
  WHERE active = true;

-- Index for the worker's popularity-weighted fallback
CREATE INDEX IF NOT EXISTS songs_popularity_idx ON songs (popularity_score DESC)
  WHERE active = true;

-- ── Song aliases ──────────────────────────────────────────────────────────────
-- Stores normalized (lowercase, no diacritics) alternate spellings / Hindi titles
CREATE TABLE IF NOT EXISTS song_aliases (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  song_id  TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  alias    TEXT NOT NULL, -- already normalized

  UNIQUE (song_id, alias)
);

CREATE INDEX IF NOT EXISTS song_aliases_alias_idx ON song_aliases (alias);

-- ── Refresh tracking ─────────────────────────────────────────────────────────
-- Tracks which entries need their preview_url re-validated
CREATE TABLE IF NOT EXISTS song_refresh_queue (
  song_id     TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','failed')),
  attempts    SMALLINT NOT NULL DEFAULT 0,
  last_tried  TIMESTAMPTZ,
  next_retry  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_queue_next_idx
  ON song_refresh_queue (next_retry)
  WHERE status IN ('pending', 'failed');

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
