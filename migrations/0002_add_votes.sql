-- Individual votes cast on a submission (points + optional comment), so a
-- submission's vote total can be expanded to show who voted and why.

CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  voter_id INTEGER REFERENCES users(id),
  points INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT
);

CREATE INDEX idx_votes_submission ON votes (submission_id);
CREATE INDEX idx_votes_voter ON votes (voter_id);
