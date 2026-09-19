import { layout, searchBar } from "./layout.js";

export function homePage({ stats, leagues }) {
  const leagueCards = leagues
    .map(
      (l) => `<li class="league-card">
        <h3>${l.name}</h3>
        <div class="chip-row">
          ${l.rounds.map((r) => `<a class="chip" href="/category/${r.id}">${r.name}</a>`).join("")}
        </div>
      </li>`
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
    ${leagueCards}
  </ul>
</section>`;

  return layout({ title: "Music League History", body });
}
