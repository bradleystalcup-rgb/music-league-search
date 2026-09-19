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

// "[DELETED]" is Music League's own placeholder for a competitor whose
// account no longer exists — excluded from every person-ranking so it
// doesn't show up as a fake leaderboard entry. Every other real person is
// included, with no top-N cutoff.
const EXCLUDE_DELETED = `u.name <> '[DELETED]'`;

export async function getPointsLeaderboard(db) {
  const { results } = await db
    .prepare(
      `SELECT u.name, u.slug, COALESCE(p.total_points, 0) AS total_points
       FROM users u
       LEFT JOIN (
         SELECT submitter_id AS uid, SUM(vote_total) AS total_points
         FROM submissions
         GROUP BY submitter_id
       ) p ON p.uid = u.id
       WHERE ${EXCLUDE_DELETED}
       ORDER BY total_points DESC`
    )
    .all();
  return results;
}

export async function getWordCountLeaderboard(db) {
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
       WHERE total_words > 0 AND ${EXCLUDE_DELETED}
       ORDER BY total_words DESC`
    )
    .all();
  return results;
}

// How wordy people are specifically about their votes (not submission
// notes): words per vote cast (diluted by silent, comment-free votes —
// measures overall chattiness), words per comment actually written
// (measures how long they get *when* they bother — silence doesn't count
// against them), and how many votes they cast without ever leaving a
// comment. Everyone who's cast at least one vote is included; the
// words-per-comment ranking additionally requires 5+ comments so one long
// comment from an infrequent voter can't top the list.
export async function getCommentVerbosity(db, { minComments = 5 } = {}) {
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
       WHERE votes_cast > 0 AND ${EXCLUDE_DELETED}`
    )
    .all();

  const withRates = results.map((r) => ({
    ...r,
    words_per_vote: r.votes_cast > 0 ? round1(r.total_words / r.votes_cast) : 0,
    words_per_comment: r.comments_cast > 0 ? round1(r.total_words / r.comments_cast) : 0,
    silent_votes: r.votes_cast - r.comments_cast,
  }));

  const perVote = [...withRates].sort((a, b) => b.words_per_vote - a.words_per_vote);
  const perComment = withRates.filter((r) => r.comments_cast >= minComments).sort((a, b) => b.words_per_comment - a.words_per_comment);
  const silent = [...withRates].sort((a, b) => b.silent_votes - a.silent_votes);

  return { perVote, perComment, silent };
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
// Left-joined from users (not submissions) so someone with zero wins still
// shows up with a 0, rather than being silently absent from the chart.
export async function getCategoryWinsLeaderboard(db) {
  const { results } = await db
    .prepare(
      `SELECT u.name, u.slug, COALESCE(w.wins, 0) AS wins
       FROM users u
       LEFT JOIN (
         SELECT sub.submitter_id AS uid, COUNT(DISTINCT sub.round_id) AS wins
         FROM submissions sub
         WHERE sub.vote_total = (SELECT MAX(s2.vote_total) FROM submissions s2 WHERE s2.round_id = sub.round_id)
         GROUP BY sub.submitter_id
       ) w ON w.uid = u.id
       WHERE ${EXCLUDE_DELETED}
       ORDER BY wins DESC`
    )
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
       WHERE ${EXCLUDE_DELETED}
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

// A 0-100 rating: for each league someone plays in, what share of that
// league's total points did they personally earn (their points / everyone's
// points in that league, as a percentage)? Average that share across every
// league they're in, then rescale so the single highest average becomes
// exactly 100 and everyone else is proportional to it.
export async function getPlayerRatings(db) {
  const { results } = await db
    .prepare(
      `SELECT r.league_id, u.id AS user_id, u.name, u.slug,
              SUM(sub.vote_total) AS user_points,
              SUM(SUM(sub.vote_total)) OVER (PARTITION BY r.league_id) AS league_points
       FROM submissions sub
       JOIN rounds r ON r.id = sub.round_id
       JOIN users u ON u.id = sub.submitter_id
       WHERE ${EXCLUDE_DELETED}
       GROUP BY r.league_id, u.id`
    )
    .all();

  const sharesByUser = new Map();
  for (const row of results) {
    if (row.league_points === 0) continue; // no points awarded in this league at all — no share to speak of
    const share = (row.user_points / row.league_points) * 100;
    if (!sharesByUser.has(row.user_id)) sharesByUser.set(row.user_id, { name: row.name, slug: row.slug, shares: [] });
    sharesByUser.get(row.user_id).shares.push(share);
  }

  return normalizeRatings(sharesByUser);
}

// Shared by getPlayerRatings/getCategoryRatings: average each user's
// per-league share percentages, then rescale so the highest average is
// exactly 100 and everyone else is proportional to it.
function normalizeRatings(sharesByUser) {
  const raw = [...sharesByUser.values()].map((u) => ({
    name: u.name,
    slug: u.slug,
    raw_rating: u.shares.reduce((sum, s) => sum + s, 0) / u.shares.length,
  }));

  const maxRaw = Math.max(...raw.map((u) => u.raw_rating));
  return raw
    .map((u) => ({ ...u, rating: maxRaw > 0 ? round1((u.raw_rating / maxRaw) * 100) : 0 }))
    .sort((a, b) => b.rating - a.rating);
}

// Same idea as getPlayerRatings, but sharing categories won instead of
// points earned: for each league someone plays in, what percentage of that
// league's rounds did they win (ties count for everyone tied at the top)?
// Average across every league played, rescale so the top player is 100.
export async function getCategoryRatings(db) {
  const { results: participation } = await db
    .prepare(
      `SELECT DISTINCT r.league_id, u.id AS user_id, u.name, u.slug
       FROM submissions sub
       JOIN rounds r ON r.id = sub.round_id
       JOIN users u ON u.id = sub.submitter_id
       WHERE ${EXCLUDE_DELETED}`
    )
    .all();

  const { results: wins } = await db
    .prepare(
      `SELECT r.league_id, sub.submitter_id AS user_id, COUNT(DISTINCT sub.round_id) AS wins
       FROM submissions sub
       JOIN rounds r ON r.id = sub.round_id
       WHERE sub.vote_total = (SELECT MAX(s2.vote_total) FROM submissions s2 WHERE s2.round_id = sub.round_id)
       GROUP BY r.league_id, sub.submitter_id`
    )
    .all();
  const winsByKey = new Map(wins.map((w) => [`${w.league_id}|${w.user_id}`, w.wins]));

  const { results: leagueCategoryCounts } = await db.prepare(`SELECT league_id, COUNT(*) AS categories FROM rounds GROUP BY league_id`).all();
  const categoriesByLeague = new Map(leagueCategoryCounts.map((l) => [l.league_id, l.categories]));

  const sharesByUser = new Map();
  for (const p of participation) {
    const totalCategories = categoriesByLeague.get(p.league_id) || 0;
    if (totalCategories === 0) continue;
    const wonCategories = winsByKey.get(`${p.league_id}|${p.user_id}`) || 0;
    const share = (wonCategories / totalCategories) * 100;
    if (!sharesByUser.has(p.user_id)) sharesByUser.set(p.user_id, { name: p.name, slug: p.slug, shares: [] });
    sharesByUser.get(p.user_id).shares.push(share);
  }

  return normalizeRatings(sharesByUser);
}

// Rounds where someone was a member of that round's league (per the
// original competitors.csv roster, not just "ever submitted or voted") but
// cast zero votes — a full no-show. Grouped across every round a member
// was eligible for, so a fully-engaged member still shows up as a
// legitimate 0 rather than being absent.
export async function getRoundsMissed(db) {
  const { results } = await db
    .prepare(
      `SELECT
         u.name, u.slug,
         COUNT(*) AS eligible_rounds,
         SUM(
           CASE WHEN NOT EXISTS (
             SELECT 1 FROM votes v
             JOIN submissions sub ON sub.id = v.submission_id
             WHERE v.voter_id = lm.user_id AND sub.round_id = r.id
           ) THEN 1 ELSE 0 END
         ) AS rounds_missed
       FROM league_members lm
       JOIN rounds r ON r.league_id = lm.league_id
       JOIN users u ON u.id = lm.user_id
       WHERE ${EXCLUDE_DELETED}
       GROUP BY lm.user_id
       ORDER BY rounds_missed DESC`
    )
    .all();
  return results;
}

// The flip side of rounds missed: how many points did *their own*
// submission rack up in a round where they themselves didn't bother to
// vote? A proxy for "took votes without reciprocating".
export async function getVotesForfeited(db) {
  // A plain WHERE NOT EXISTS(...) here would filter out (member, round) rows
  // entirely for anyone who never missed a round, so they'd be absent from
  // the GROUP BY rather than showing a real 0 — same bug class as
  // getRoundsMissed avoids by putting the check in a CASE inside SUM
  // instead of filtering rows before grouping.
  const { results } = await db
    .prepare(
      `SELECT
         u.name, u.slug,
         COALESCE(SUM(
           CASE WHEN NOT EXISTS (
             SELECT 1 FROM votes v
             JOIN submissions s2 ON s2.id = v.submission_id
             WHERE v.voter_id = lm.user_id AND s2.round_id = r.id
           ) THEN sub.vote_total ELSE 0 END
         ), 0) AS forfeited_votes
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       JOIN rounds r ON r.league_id = lm.league_id
       LEFT JOIN submissions sub ON sub.round_id = r.id AND sub.submitter_id = lm.user_id
       WHERE ${EXCLUDE_DELETED}
       GROUP BY lm.user_id
       ORDER BY forfeited_votes DESC`
    )
    .all();
  return results;
}

// "Correct guesses": a vote comment that mentions the actual submitter's
// name (or, for a two-word name, just their first name) counts as
// correctly guessing whose pick it was — Music League submissions are
// anonymous until the round ends, so this is a decent proxy for "called
// it". Necessarily approximate: stylized usernames people don't spell out
// mid-sentence (e.g. "SamRobertsND") will undercount.
export async function getCorrectGuesses(db) {
  const { results: allUsers } = await db.prepare(`SELECT u.name, u.slug FROM users u WHERE ${EXCLUDE_DELETED}`).all();

  const { results: candidates } = await db
    .prepare(
      `SELECT v.comment, u_voter.name AS voter_name, u_voter.slug AS voter_slug, u_sub.name AS submitter_name
       FROM votes v
       JOIN submissions sub ON sub.id = v.submission_id
       JOIN users u_sub ON u_sub.id = sub.submitter_id
       JOIN users u_voter ON u_voter.id = v.voter_id
       WHERE v.comment IS NOT NULL AND TRIM(v.comment) <> ''
         AND u_sub.id <> u_voter.id
         AND u_sub.name <> '[DELETED]' AND u_voter.name <> '[DELETED]'`
    )
    .all();

  const guessesBySlug = new Map(allUsers.map((u) => [u.slug, { name: u.name, slug: u.slug, correct_guesses: 0 }]));
  for (const row of candidates) {
    if (nameMentioned(row.comment, row.submitter_name)) {
      guessesBySlug.get(row.voter_slug).correct_guesses += 1;
    }
  }

  return [...guessesBySlug.values()].sort((a, b) => b.correct_guesses - a.correct_guesses);
}

function nameMentioned(text, fullName) {
  const candidates = [fullName];
  const firstWord = fullName.split(/\s+/)[0];
  if (firstWord !== fullName && firstWord.length >= 3) candidates.push(firstWord);

  return candidates.some((name) => {
    const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${pattern}\\b`, "i").test(text);
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
