import { layout, escapeHtml } from "./layout.js";
import { submissionTable } from "./submission-table.js";

export function categoryPage({ round, submissions }) {
  const body = `
<p class="breadcrumb"><a href="/">&larr; back to search</a></p>
<h1>${escapeHtml(round.name)}</h1>
<p class="lede">${escapeHtml(round.league_name)}${round.description ? ` &middot; ${escapeHtml(round.description)}` : ""}</p>
${round.playlist_url ? `<p><a href="${escapeHtml(round.playlist_url)}" target="_blank" rel="noopener">Open playlist on Spotify &rarr;</a></p>` : ""}
${submissionTable(submissions, { hide: ["category", "league"] })}`;

  return layout({ title: `${round.name} — Friends in the Bend Music League`, body });
}
