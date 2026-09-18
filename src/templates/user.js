import { layout, escapeHtml } from "./layout.js";
import { submissionTable } from "./submission-table.js";

export function userPage({ name, submissions }) {
  const body = `
<p class="breadcrumb"><a href="/">&larr; back to search</a></p>
<h1>${escapeHtml(name)}</h1>
<p class="lede">${submissions.length} submission${submissions.length === 1 ? "" : "s"}</p>
${submissionTable(submissions, { hide: ["submitter"] })}`;

  return layout({ title: `${name} — Music League History`, body });
}
