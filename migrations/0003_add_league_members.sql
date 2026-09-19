-- Every league's full roster (from competitors.csv), independent of
-- whether that person ever submitted or voted. Needed to tell "didn't
-- vote in this round" apart from "was never in this league at all".

CREATE TABLE league_members (
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (league_id, user_id)
);

CREATE INDEX idx_league_members_user ON league_members (user_id);
