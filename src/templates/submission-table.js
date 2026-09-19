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
        votes: voteDetails(s),
      };
      return `<tr>${cols.map((c) => `<td data-label="${c.label}">${cells[c.key]}</td>`).join("")}</tr>`;
    })
    .join("\n");

  return `<div class="table-responsive">
    <table class="table table-hover align-middle submissions">
      <thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function voteClass(total) {
  if (total > 0) return "text-bg-success";
  if (total < 0) return "text-bg-danger";
  return "text-bg-secondary";
}

// The vote pill is a <details>/<summary> so clicking it expands the
// submitter's note plus each voter's points and comment — no client JS needed.
function voteDetails(s) {
  const pill = `<span class="badge rounded-pill vote-total ${voteClass(s.vote_total)}">${s.vote_total}</span>`;
  const votes = s.votes || [];
  const hasComments = Boolean(s.comment) || votes.some((v) => v.comment);
  if (!hasComments && votes.length === 0) {
    return pill;
  }

  const note = s.comment ? `<p class="submitter-note"><strong>${escapeHtml(s.user_name || "Submitter")}:</strong> ${escapeHtml(s.comment)}</p>` : "";

  const voteItems = votes.length
    ? `<ul class="vote-list">${votes
        .map((v) => {
          const voter = v.voter_slug
            ? `<a href="/user/${encodeURIComponent(v.voter_slug)}">${escapeHtml(v.voter_name)}</a>`
            : `<span class="muted">${escapeHtml(v.voter_name || "unknown")}</span>`;
          const comment = v.comment ? ` &mdash; <span class="vote-comment">${escapeHtml(v.comment)}</span>` : "";
          return `<li>${voter} <span class="vote-points">+${v.points}</span>${comment}</li>`;
        })
        .join("")}</ul>`
    : `<p class="empty">No votes recorded.</p>`;

  return `<details class="vote-details">
    <summary>${pill}</summary>
    <div class="vote-panel">${note}${voteItems}</div>
  </details>`;
}

function spotifyId(uri) {
  if (!uri) return "";
  const parts = String(uri).split(":");
  return parts[parts.length - 1] || "";
}
