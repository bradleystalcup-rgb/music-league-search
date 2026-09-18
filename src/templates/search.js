import { layout, searchBar, escapeHtml } from "./layout.js";
import { submissionTable } from "./submission-table.js";

export function searchPage({ query, results }) {
  const body = `
<section class="hero hero-compact">
  ${searchBar(query)}
</section>
${
  query
    ? `<section>
        <h2>${results.length} result${results.length === 1 ? "" : "s"} for &ldquo;${escapeHtml(query)}&rdquo;</h2>
        ${submissionTable(results)}
      </section>`
    : ""
}`;

  return layout({ title: query ? `“${query}” — Music League History` : "Search — Music League History", body });
}
