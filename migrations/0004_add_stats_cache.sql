-- Precomputed payload for the /stats page (a couple dozen small queries
-- collapsed into one). Cleared and repopulated by the seed script, so it
-- never goes stale versus the data it's derived from.

CREATE TABLE stats_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
