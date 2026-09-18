// Reads the raw Music League CSV exports under data/raw/league_* and turns
// them into a single seed/seed.sql file of INSERT statements for D1.
//
// Re-run with `npm run build:seed` any time data/raw/ changes.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "raw");
const OUT_FILE = join(__dirname, "seed.sql");

// ---- CSV parsing (RFC 4180: quoted fields, "" escapes, embedded commas/newlines) ----

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // skip, \n handles the row break
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

function parseCsvFile(path) {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function sqlStr(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInt(value) {
  return Number.isFinite(value) ? String(value) : "0";
}

function monthLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ---- Global (cross-league) lookup tables ----

let leagueSeq = 0;
let roundSeq = 0;
let userSeq = 0;
let songSeq = 0;
let submissionSeq = 0;

const userIdByName = new Map(); // name (trimmed) -> global user id
const usedUserSlugs = new Set();
const songIdByUri = new Map(); // spotify uri -> global song id
const songIdByTitleArtist = new Map(); // `${title}|${artist}` lowercased -> global song id

const leagueRows = [];
const roundRows = [];
const userRows = [];
const songRows = [];
const submissionRows = [];

function getOrCreateUser(name) {
  const key = name.trim();
  if (userIdByName.has(key)) return userIdByName.get(key);
  userSeq += 1;
  const id = userSeq;
  let slug = slugify(key);
  let uniqueSlug = slug;
  let n = 2;
  while (usedUserSlugs.has(uniqueSlug)) {
    uniqueSlug = `${slug}-${n}`;
    n += 1;
  }
  usedUserSlugs.add(uniqueSlug);
  userIdByName.set(key, id);
  userRows.push({ id, name: key, slug: uniqueSlug });
  return id;
}

function getOrCreateSong({ uri, title, artist, album }) {
  const cleanTitle = title.trim();
  const cleanArtist = artist.trim();
  if (uri && songIdByUri.has(uri)) return songIdByUri.get(uri);
  const taKey = `${cleanTitle.toLowerCase()}|${cleanArtist.toLowerCase()}`;
  if (!uri && songIdByTitleArtist.has(taKey)) return songIdByTitleArtist.get(taKey);

  songSeq += 1;
  const id = songSeq;
  songRows.push({
    id,
    uri: uri || null,
    title: cleanTitle,
    artist: cleanArtist,
    artistSlug: slugify(cleanArtist),
    album: album ? album.trim() : null,
  });
  if (uri) songIdByUri.set(uri, id);
  songIdByTitleArtist.set(taKey, id);
  return id;
}

// ---- Walk each league folder in chronological order (league_0 .. league_9) ----

const leagueDirs = readdirSync(DATA_DIR)
  .filter((d) => d.startsWith("league_"))
  .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]));

for (const dir of leagueDirs) {
  const base = join(DATA_DIR, dir);
  const competitors = parseCsvFile(join(base, "competitors.csv"));
  const rounds = parseCsvFile(join(base, "rounds.csv"));
  const submissions = parseCsvFile(join(base, "submissions.csv"));
  const votes = parseCsvFile(join(base, "votes.csv"));

  // Local competitor id -> global user id (merges same person across leagues by name)
  const competitorIdToUserId = new Map();
  for (const c of competitors) {
    competitorIdToUserId.set(c.ID, getOrCreateUser(c.Name));
  }

  // Local round id -> global round id
  const roundIdMap = new Map();
  const sortedRounds = [...rounds].sort((a, b) => new Date(a.Created) - new Date(b.Created));
  const earliestRoundDate = sortedRounds[0]?.Created || "";

  leagueSeq += 1;
  const leagueId = leagueSeq;
  leagueRows.push({
    id: leagueId,
    name: `League ${leagueSeq} (${monthLabel(earliestRoundDate) || "undated"})`,
    startedAt: earliestRoundDate || null,
  });

  for (const r of rounds) {
    roundSeq += 1;
    const roundId = roundSeq;
    roundIdMap.set(r.ID, roundId);
    roundRows.push({
      id: roundId,
      leagueId,
      name: r.Name,
      description: r.Description || null,
      playlistUrl: r["Playlist URL"] || null,
      createdAt: r.Created || null,
    });
  }

  // spotify uri + local round id -> summed points
  const votesByRoundUri = new Map();
  for (const v of votes) {
    const key = `${v["Round ID"]}|${v["Spotify URI"]}`;
    const pts = parseInt(v["Points Assigned"], 10) || 0;
    votesByRoundUri.set(key, (votesByRoundUri.get(key) || 0) + pts);
  }

  for (const s of submissions) {
    const songId = getOrCreateSong({
      uri: s["Spotify URI"],
      title: s.Title,
      artist: s["Artist(s)"],
      album: s.Album,
    });
    const globalRoundId = roundIdMap.get(s["Round ID"]);
    const voteKey = `${s["Round ID"]}|${s["Spotify URI"]}`;
    const voteTotal = votesByRoundUri.get(voteKey) || 0;

    submissionSeq += 1;
    submissionRows.push({
      id: submissionSeq,
      roundId: globalRoundId,
      songId,
      submitterId: s["Submitter ID"] ? competitorIdToUserId.get(s["Submitter ID"]) ?? null : null,
      comment: s.Comment || null,
      createdAt: s.Created || null,
      voteTotal,
    });
  }
}

// ---- Emit SQL ----

const lines = [];
lines.push("-- Generated by seed/build-seed.mjs. Do not edit by hand — re-run the script instead.");
lines.push("DELETE FROM submissions;");
lines.push("DELETE FROM songs;");
lines.push("DELETE FROM rounds;");
lines.push("DELETE FROM users;");
lines.push("DELETE FROM leagues;");

for (const l of leagueRows) {
  lines.push(
    `INSERT INTO leagues (id, name, started_at) VALUES (${sqlInt(l.id)}, ${sqlStr(l.name)}, ${sqlStr(l.startedAt)});`
  );
}
for (const u of userRows) {
  lines.push(`INSERT INTO users (id, name, slug) VALUES (${sqlInt(u.id)}, ${sqlStr(u.name)}, ${sqlStr(u.slug)});`);
}
for (const r of roundRows) {
  lines.push(
    `INSERT INTO rounds (id, league_id, name, description, playlist_url, created_at) VALUES (${sqlInt(r.id)}, ${sqlInt(
      r.leagueId
    )}, ${sqlStr(r.name)}, ${sqlStr(r.description)}, ${sqlStr(r.playlistUrl)}, ${sqlStr(r.createdAt)});`
  );
}
for (const s of songRows) {
  lines.push(
    `INSERT INTO songs (id, spotify_uri, title, artist, artist_slug, album) VALUES (${sqlInt(s.id)}, ${sqlStr(
      s.uri
    )}, ${sqlStr(s.title)}, ${sqlStr(s.artist)}, ${sqlStr(s.artistSlug)}, ${sqlStr(s.album)});`
  );
}
for (const sub of submissionRows) {
  lines.push(
    `INSERT INTO submissions (id, round_id, song_id, submitter_id, comment, created_at, vote_total) VALUES (${sqlInt(
      sub.id
    )}, ${sqlInt(sub.roundId)}, ${sqlInt(sub.songId)}, ${sub.submitterId ? sqlInt(sub.submitterId) : "NULL"}, ${sqlStr(
      sub.comment
    )}, ${sqlStr(sub.createdAt)}, ${sqlInt(sub.voteTotal)});`
  );
}

writeFileSync(OUT_FILE, lines.join("\n") + "\n");

console.log(`Wrote ${OUT_FILE}`);
console.log(
  `${leagueRows.length} leagues, ${roundRows.length} rounds, ${userRows.length} users, ${songRows.length} songs, ${submissionRows.length} submissions`
);
