-- Music League history schema.
--
-- A "league" is one season (one exported competition). Each league has
-- several "rounds" — a themed round is what the site calls a "category"
-- (e.g. "Apocalypse"). Every round has song "submissions" from users, and
-- each submission's vote_total is the sum of points it received in that
-- round. The same song (by Spotify URI) may be submitted more than once
-- across different rounds/leagues — each occurrence is its own submission
-- row so history isn't lost.

CREATE TABLE leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  started_at TEXT
);

-- Competitor IDs are per-league in the raw export, so users are merged
-- across leagues by display name.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  name TEXT NOT NULL,
  description TEXT,
  playlist_url TEXT,
  created_at TEXT
);

CREATE TABLE songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spotify_uri TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  artist_slug TEXT NOT NULL,
  album TEXT
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  song_id INTEGER NOT NULL REFERENCES songs(id),
  submitter_id INTEGER REFERENCES users(id),
  comment TEXT,
  created_at TEXT,
  vote_total INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_rounds_league ON rounds (league_id);
CREATE INDEX idx_songs_artist_slug ON songs (artist_slug);
CREATE INDEX idx_songs_title ON songs (title COLLATE NOCASE);
CREATE INDEX idx_submissions_round ON submissions (round_id);
CREATE INDEX idx_submissions_song ON submissions (song_id);
CREATE INDEX idx_submissions_submitter ON submissions (submitter_id);
CREATE INDEX idx_submissions_vote_total ON submissions (vote_total DESC);
