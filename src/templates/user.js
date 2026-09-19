import { layout, escapeHtml } from "./layout.js";
import { submissionTable } from "./submission-table.js";

export function userPage({ name, facts, submissions }) {
  const statCards = [
    { label: "Submissions", value: facts.total_submissions },
    { label: "Categories won", value: facts.categories_won },
    { label: "Leagues played", value: facts.total_leagues },
  ]
    .map(
      (s) => `<div class="col">
        <div class="card stat-card text-center h-100">
          <div class="card-body">
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${s.label}</div>
          </div>
        </div>
      </div>`
    )
    .join("");

  const body = `
<p class="breadcrumb"><a href="/">&larr; back to search</a></p>
<h1>${escapeHtml(name)}</h1>
<div class="row row-cols-3 g-3 stat-row">${statCards}</div>
${submissionTable(submissions, { hide: ["submitter"] })}`;

  return layout({ title: `${name} — Friends in the Bend Music League`, body });
}
