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
  return attachVotes(db, results);
}

function escapeLike(word) {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Fetches every vote (points + optional comment) for the given submissions
// and attaches them as `submission.votes`, sorted highest points first.
// Batches the IN(...) lookup to stay under D1's bound-parameter limit.
async function attachVotes(db, submissions) {
  const ids = submissions.map((s) => s.submission_id);
  if (ids.length === 0) return submissions;

  const votesBySubmission = new Map();
  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const placeholders = batch.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT v.submission_id, v.points, v.comment, u.name AS voter_name, u.slug AS voter_slug
         FROM votes v
         LEFT JOIN users u ON u.id = v.voter_id
         WHERE v.submission_id IN (${placeholders})
         ORDER BY v.points DESC`
      )
      .bind(...batch)
      .all();
    for (const v of results) {
      if (!votesBySubmission.has(v.submission_id)) votesBySubmission.set(v.submission_id, []);
      votesBySubmission.get(v.submission_id).push(v);
    }
  }

  for (const s of submissions) {
    s.votes = votesBySubmission.get(s.submission_id) || [];
  }
  return submissions;
}

export async function getArtistBySlug(db, slug) {
  const song = await db.prepare("SELECT artist, artist_slug FROM songs WHERE artist_slug = ? LIMIT 1").bind(slug).first();
  if (!song) return null;

  const { results: submissions } = await db
    .prepare(`${SUBMISSION_SELECT} WHERE song.artist_slug = ? ORDER BY song.title COLLATE NOCASE, sub.vote_total DESC`)
    .bind(slug)
    .all();

  return { name: song.artist, submissions: await attachVotes(db, submissions) };
}

export async function getUserBySlug(db, slug) {
  const user = await db.prepare("SELECT id, name, slug FROM users WHERE slug = ?").bind(slug).first();
  if (!user) return null;

  const { results: submissions } = await db
    .prepare(`${SUBMISSION_SELECT} WHERE user.id = ? ORDER BY sub.created_at DESC`)
    .bind(user.id)
    .all();

  const facts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM submissions WHERE submitter_id = ?) AS total_submissions,
         (SELECT COUNT(DISTINCT r.league_id)
            FROM submissions sub JOIN rounds r ON r.id = sub.round_id
            WHERE sub.submitter_id = ?) AS total_leagues,
         (SELECT COUNT(DISTINCT sub.round_id)
            FROM submissions sub
            WHERE sub.submitter_id = ?
              AND sub.vote_total = (SELECT MAX(s2.vote_total) FROM submissions s2 WHERE s2.round_id = sub.round_id)
         ) AS categories_won`
    )
    .bind(user.id, user.id, user.id)
    .first();

  return { ...user, facts, submissions: await attachVotes(db, submissions) };
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

  return { ...round, submissions: await attachVotes(db, submissions) };
}

export async function getLeagueById(db, id) {
  const league = await db.prepare("SELECT id, name, started_at FROM leagues WHERE id = ?").bind(id).first();
  if (!league) return null;

  const { results: rounds } = await db
    .prepare("SELECT id, name FROM rounds WHERE league_id = ? ORDER BY created_at ASC")
    .bind(id)
    .all();

  const { results: submissions } = await db
    .prepare(`${SUBMISSION_SELECT} WHERE league.id = ? ORDER BY sub.vote_total DESC, sub.created_at ASC`)
    .bind(id)
    .all();

  return { ...league, rounds, submissions: await attachVotes(db, submissions) };
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
         (SELECT COUNT(DISTINCT artist_slug) FROM songs) AS artists,
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM votes) AS votes_cast`
    )
    .first();
  return row;
}

// SQLite has no word-count builtin: approximate it by counting spaces in a
// trimmed string (collapsing runs of whitespace to single spaces first).
const WORD_COUNT_SQL = `(LENGTH(comment) - LENGTH(REPLACE(comment, ' ', '')) + 1)`;

export async function getPointsLeaderboard(db, { limit = 10 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT u.name, u.slug, SUM(sub.vote_total) AS total_points
       FROM submissions sub JOIN users u ON u.id = sub.submitter_id
       GROUP BY u.id
       ORDER BY total_points DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();
  return results;
}

export async function getWordCountLeaderboard(db, { limit = 10 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT u.name, u.slug, COALESCE(sub_words.words, 0) + COALESCE(vote_words.words, 0) AS total_words
       FROM users u
       LEFT JOIN (
         SELECT submitter_id AS uid, SUM(${WORD_COUNT_SQL}) AS words
         FROM submissions
         WHERE comment IS NOT NULL AND TRIM(comment) <> ''
         GROUP BY submitter_id
       ) sub_words ON sub_words.uid = u.id
       LEFT JOIN (
         SELECT voter_id AS uid, SUM(${WORD_COUNT_SQL}) AS words
         FROM votes
         WHERE comment IS NOT NULL AND TRIM(comment) <> ''
         GROUP BY voter_id
       ) vote_words ON vote_words.uid = u.id
       WHERE total_words > 0
       ORDER BY total_words DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();
  return results;
}

// How wordy people are specifically about their votes (not submission
// notes): words per vote cast (diluted by silent, comment-free votes —
// measures overall chattiness) and words per comment actually written
// (measures how long they get *when* they bother — silence doesn't count
// against them). Users with fewer than 5 comments are excluded from the
// words-per-comment leaderboard so one long comment from an infrequent
// voter can't top the list.
export async function getCommentVerbosity(db, { limit = 10, minComments = 5 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT
         u.name, u.slug,
         (SELECT COUNT(*) FROM votes v2 WHERE v2.voter_id = u.id) AS votes_cast,
         COALESCE(vw.words, 0) AS total_words,
         COALESCE(vw.comments, 0) AS comments_cast
       FROM users u
       LEFT JOIN (
         SELECT voter_id AS uid, SUM(${WORD_COUNT_SQL}) AS words, COUNT(*) AS comments
         FROM votes
         WHERE comment IS NOT NULL AND TRIM(comment) <> ''
         GROUP BY voter_id
       ) vw ON vw.uid = u.id
       WHERE votes_cast > 0`
    )
    .all();

  const withRates = results.map((r) => ({
    ...r,
    words_per_vote: r.votes_cast > 0 ? round1(r.total_words / r.votes_cast) : 0,
    words_per_comment: r.comments_cast > 0 ? round1(r.total_words / r.comments_cast) : 0,
  }));

  const perVote = [...withRates].sort((a, b) => b.words_per_vote - a.words_per_vote).slice(0, limit);
  const perComment = withRates
    .filter((r) => r.comments_cast >= minComments)
    .sort((a, b) => b.words_per_comment - a.words_per_comment)
    .slice(0, limit);

  return { perVote, perComment };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export async function getTopSongs(db, { limit = 10 } = {}) {
  const { results } = await db
    .prepare(
      `${SUBMISSION_SELECT} ORDER BY sub.vote_total DESC, sub.created_at ASC LIMIT ?`
    )
    .bind(limit)
    .all();
  return attachVotes(db, results);
}

export async function getWorstSongs(db, { limit = 10 } = {}) {
  const { results } = await db
    .prepare(
      `${SUBMISSION_SELECT} ORDER BY sub.vote_total ASC, sub.created_at ASC LIMIT ?`
    )
    .bind(limit)
    .all();
  return attachVotes(db, results);
}

// Rounds won per user (ties count as a win for everyone tied at the top),
// across every league — same definition as the categories_won fun fact on
// user pages, just ranked across all users instead of scoped to one.
export async function getCategoryWinsLeaderboard(db, { limit = 10 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT u.name, u.slug, COUNT(DISTINCT sub.round_id) AS wins
       FROM submissions sub
       JOIN users u ON u.id = sub.submitter_id
       WHERE sub.vote_total = (SELECT MAX(s2.vote_total) FROM submissions s2 WHERE s2.round_id = sub.round_id)
       GROUP BY u.id
       ORDER BY wins DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();
  return results;
}

export async function getTopArtists(db, { limit = 10 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT song.artist, song.artist_slug, COUNT(*) AS submission_count
       FROM submissions sub JOIN songs song ON song.id = sub.song_id
       GROUP BY song.artist_slug
       ORDER BY submission_count DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();
  return results;
}

// Per-league standings: every participant's total points (sum of their
// submissions' vote totals in that league), ranked highest first, so the
// page can show 1st/2nd/3rd and last place for each league.
export async function getLeagueStandings(db) {
  const { results: leagues } = await db.prepare("SELECT id, name FROM leagues ORDER BY started_at ASC").all();

  const { results: standings } = await db
    .prepare(
      `SELECT r.league_id, u.name, u.slug, SUM(sub.vote_total) AS total_points
       FROM submissions sub
       JOIN rounds r ON r.id = sub.round_id
       JOIN users u ON u.id = sub.submitter_id
       GROUP BY r.league_id, u.id
       ORDER BY r.league_id, total_points DESC, u.name ASC`
    )
    .all();

  const byLeague = new Map();
  for (const row of standings) {
    if (!byLeague.has(row.league_id)) byLeague.set(row.league_id, []);
    byLeague.get(row.league_id).push(row);
  }

  return leagues.map((l) => {
    const ranked = byLeague.get(l.id) || [];
    return {
      ...l,
      first: ranked[0] || null,
      second: ranked[1] || null,
      third: ranked[2] || null,
      last: ranked.length > 3 ? ranked[ranked.length - 1] : null,
    };
  });
}

// Songs submitted more than once, each with every occurrence in
// chronological order (earliest submission first) so the "did it do
// better the second time?" story reads left to right.
export async function getRepeatSongs(db) {
  const { results } = await db
    .prepare(
      `${SUBMISSION_SELECT}
       WHERE song.id IN (SELECT song_id FROM submissions GROUP BY song_id HAVING COUNT(*) > 1)
       ORDER BY song.title COLLATE NOCASE, song.artist COLLATE NOCASE, sub.created_at ASC`
    )
    .all();

  const bySong = new Map();
  for (const row of results) {
    if (!bySong.has(row.song_id)) {
      bySong.set(row.song_id, { title: row.title, artist: row.artist, artist_slug: row.artist_slug, occurrences: [] });
    }
    bySong.get(row.song_id).occurrences.push(row);
  }
  return [...bySong.values()];
}
