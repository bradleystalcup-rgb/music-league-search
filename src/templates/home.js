import { layout, searchBar } from "./layout.js";

export function homePage({ stats, leagues }) {
  const leagueList = leagues
    .map(
      (l) =>
        `<li><strong>${l.name}</strong> — ${l.rounds.length} categories: ${l.rounds
          .map((r) => `<a href="/category/${r.id}">${r.name}</a>`)
          .join(", ")}</li>`
    )
    .join("\n");

  const body = `
<section class="hero">
  <h1>Search the Music League archive</h1>
  <p class="lede">${stats.submissions} submissions across ${stats.leagues} leagues and ${stats.rounds} categories. Find a song or artist below.</p>
  ${searchBar()}
</section>
<section class="leagues">
  <h2>Leagues</h2>
  <ul class="league-list">
    ${leagueList}
  </ul>
</section>`;

  return layout({ title: "Music League History", body });
}
