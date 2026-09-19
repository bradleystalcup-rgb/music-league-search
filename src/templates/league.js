import { layout, escapeHtml } from "./layout.js";
import { submissionTable } from "./submission-table.js";

export function leaguePage({ league, submissions }) {
  const chipRow = league.rounds.map((r) => `<a class="chip" href="/category/${r.id}">${escapeHtml(r.name)}</a>`).join("");

  const body = `
<p class="breadcrumb"><a href="/">&larr; back to search</a></p>
<h1>${escapeHtml(league.name)}</h1>
<p class="lede">${league.rounds.length} categor${league.rounds.length === 1 ? "y" : "ies"} &middot; ${submissions.length} submission${submissions.length === 1 ? "" : "s"}</p>
<div class="chip-row mb-4">${chipRow}</div>
${submissionTable(submissions, { hide: ["league"] })}`;

  return layout({ title: `${league.name} — Friends in the Bend Music League`, body });
}
