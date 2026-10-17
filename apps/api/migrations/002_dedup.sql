-- Migration 002: deduplicate songs with the same canonical title
-- Keeps the entry with the most popularity_score (or earliest created_at on tie),
-- merges aliases onto the survivor, deactivates/deletes duplicates.
-- Run once: psql $DATABASE_URL -f migrations/002_dedup.sql

BEGIN;

-- 1. For each group of same canonical_title, pick the survivor (highest popularity)
CREATE TEMP TABLE survivors AS
SELECT DISTINCT ON (LOWER(canonical_title))
  id AS survivor_id,
  LOWER(canonical_title) AS norm_title
FROM songs
WHERE active = true
ORDER BY LOWER(canonical_title), popularity_score DESC, created_at ASC;

-- 2. Find all duplicate IDs (same norm title, not the survivor)
CREATE TEMP TABLE duplicates AS
SELECT s.id AS dup_id, sv.survivor_id
FROM songs s
JOIN survivors sv ON LOWER(s.canonical_title) = sv.norm_title
WHERE s.id != sv.survivor_id AND s.active = true;

-- 3. Migrate aliases from duplicates to survivors (ignore conflicts)
INSERT INTO song_aliases (song_id, alias)
SELECT d.survivor_id, sa.alias
FROM duplicates d
JOIN song_aliases sa ON sa.song_id = d.dup_id
ON CONFLICT (song_id, alias) DO NOTHING;

-- 4. Also add the duplicate's own title as an alias on the survivor
INSERT INTO song_aliases (song_id, alias)
SELECT d.survivor_id, LOWER(REGEXP_REPLACE(s.canonical_title, '[^a-zA-Z0-9 ]', '', 'g'))
FROM duplicates d
JOIN songs s ON s.id = d.dup_id
ON CONFLICT (song_id, alias) DO NOTHING;

-- 5. Deactivate duplicates
UPDATE songs SET active = false
WHERE id IN (SELECT dup_id FROM duplicates);

-- 6. Report
SELECT
  (SELECT COUNT(*) FROM duplicates) AS deactivated,
  (SELECT COUNT(*) FROM survivors)  AS survivors;

COMMIT;
