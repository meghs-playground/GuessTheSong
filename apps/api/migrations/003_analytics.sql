-- Migration 003: Analytics events tracking
-- Stores pageviews, active users, game sessions, guesses, completions

CREATE TABLE IF NOT EXISTS analytics_events (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  visitor_id  TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('page_view', 'heartbeat', 'game_start', 'guess', 'game_finish')),
  path        TEXT NOT NULL DEFAULT '/',
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for fast aggregation
CREATE INDEX IF NOT EXISTS analytics_created_at_idx ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_event_type_idx ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_visitor_id_idx ON analytics_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_session_id_idx ON analytics_events (session_id);
