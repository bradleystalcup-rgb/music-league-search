// Query layer around the D1 tables built by seed/build-seed.mjs.
// See migrations/0001_init.sql for the schema.

const SUBMISSION_SELECT = `
  SELECT
    sub.id AS submission_id,
    sub.comment,
    sub.created_at,
    sub.vote_total,
    song.id AS song_id,
    song.title,
    song.artist,
    song.artist_slug,
    song.album,
    song.spotify_uri,
    round.id AS round_id,
    round.name AS round_name,
    league.id AS league_id,
    league.name AS league_name,
    user.id AS user_id,
    user.name AS user_name,
    user.slug AS user_slug
  FROM submissions sub
  JOIN songs song ON song.id = sub.song_id
  JOIN rounds round ON round.id = sub.round_id
  JOIN leagues league ON league.id = round.league_id
  LEFT JOIN users user ON user.id = sub.submitter_id
`;

// Splits the query into words and requires every word to appear somewhere
// in the song title or artist name — a simple, dependency-free stand-in
// for fuzzy matching that tolerates partial/out-of-order terms.
export async function searchSubmissions(db, query, { limit = 200 } = {}) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (words.length === 0) return [];

  const conditions = words.map(() => "(song.title LIKE ? ESCAPE '\\' OR song.artist LIKE ? ESCAPE '\\')").join(" AND ");
  const params = [];
  for (const w of words) {
    const like = `%${escapeLike(w)}%`;
    params.push(like, like);
  }

  const sql = `${SUBMISSION_SELECT} WHERE ${conditions} ORDER BY sub.vote_total DESC, sub.created_at ASC LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...params, limit)
    .all();
  return results;
}

function escapeLike(word) {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function getArtistBySlug(db, slug) {
  const song = await db.prepare("SELECT artist, artist_slug FROM songs WHERE artist_slug = ? LIMIT 1").bind(slug).first();
  if (!song) return null;

  const { results: submissions } = await db
    .prepare(`${SUBMISSION_SELECT} WHERE song.artist_slug = ? ORDER BY song.title COLLATE NOCASE, sub.vote_total DESC`)
    .bind(slug)
    .all();

  return { name: song.artist, submissions };
}

export async function getUserBySlug(db, slug) {
  const user = await db.prepare("SELECT id, name, slug FROM users WHERE slug = ?").bind(slug).first();
  if (!user) return null;

  const { results: submissions } = await db
    .prepare(`${SUBMISSION_SELECT} WHERE user.id = ? ORDER BY sub.created_at DESC`)
    .bind(user.id)
    .all();

  return { ...user, submissions };
}

export async function getRoundById(db, id) {
  const round = await db
    .prepare(
      `SELECT round.id, round.name, round.description, round.playlist_url, round.created_at,
              league.id AS league_id, league.name AS league_name
       FROM rounds round JOIN leagues league ON league.id = round.league_id
       WHERE round.id = ?`
    )
    .bind(id)
    .first();
  if (!round) return null;

  const { results: submissions } = await db
    .prepare(`${SUBMISSION_SELECT} WHERE round.id = ? ORDER BY sub.vote_total DESC, sub.created_at ASC`)
    .bind(id)
    .all();

  return { ...round, submissions };
}

export async function listLeaguesWithRounds(db) {
  const { results: leagues } = await db.prepare("SELECT id, name, started_at FROM leagues ORDER BY started_at ASC").all();
  const { results: rounds } = await db
    .prepare("SELECT id, league_id, name FROM rounds ORDER BY created_at ASC")
    .all();
  const roundsByLeague = new Map();
  for (const r of rounds) {
    if (!roundsByLeague.has(r.league_id)) roundsByLeague.set(r.league_id, []);
    roundsByLeague.get(r.league_id).push(r);
  }
  return leagues.map((l) => ({ ...l, rounds: roundsByLeague.get(l.id) || [] }));
}

export async function getStats(db) {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM leagues) AS leagues,
         (SELECT COUNT(*) FROM rounds) AS rounds,
         (SELECT COUNT(*) FROM submissions) AS submissions,
         (SELECT COUNT(DISTINCT song_id) FROM submissions) AS songs,
         (SELECT COUNT(*) FROM users) AS users`
    )
    .first();
  return row;
}
