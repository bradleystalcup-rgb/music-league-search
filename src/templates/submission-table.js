import { escapeHtml } from "./layout.js";

// Renders a table of submission rows produced by the shared SUBMISSION_SELECT
// query in src/db.js. `columns` controls which columns show (all shown by
// default); use it to hide a column on pages where it's redundant (e.g. hide
// "Artist" on an artist detail page).
export function submissionTable(submissions, { hide = [] } = {}) {
  if (submissions.length === 0) {
    return `<p class="empty">No submissions found.</p>`;
  }

  const cols = [
    { key: "song", label: "Song" },
    { key: "artist", label: "Artist" },
    { key: "category", label: "Category" },
    { key: "league", label: "League" },
    { key: "submitter", label: "Submitted by" },
    { key: "votes", label: "Votes" },
  ].filter((c) => !hide.includes(c.key));

  const rows = submissions
    .map((s) => {
      const cells = {
        song: `<a href="https://open.spotify.com/track/${encodeURIComponent(spotifyId(s.spotify_uri))}" target="_blank" rel="noopener">${escapeHtml(
          s.title
        )}</a>`,
        artist: `<a href="/artist/${encodeURIComponent(s.artist_slug)}">${escapeHtml(s.artist)}</a>`,
        category: `<a href="/category/${s.round_id}">${escapeHtml(s.round_name)}</a>`,
        league: escapeHtml(s.league_name),
        submitter: s.user_slug
          ? `<a href="/user/${encodeURIComponent(s.user_slug)}">${escapeHtml(s.user_name)}</a>`
          : `<span class="muted">unknown</span>`,
        votes: `<span class="vote-total">${s.vote_total}</span>`,
      };
      return `<tr>${cols.map((c) => `<td data-label="${c.label}">${cells[c.key]}</td>`).join("")}</tr>`;
    })
    .join("\n");

  return `<table class="submissions">
    <thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function spotifyId(uri) {
  if (!uri) return "";
  const parts = String(uri).split(":");
  return parts[parts.length - 1] || "";
}
