import { layout, searchBar } from "./layout.js";

export function homePage({ stats, leagues }) {
  const leagueCards = leagues
    .map(
      (l) => `<div class="col league-col">
        <div class="card league-card h-100">
          <div class="card-body">
            <h3 class="card-title h5">${l.name}</h3>
            <div class="chip-row">
              ${l.rounds.map((r) => `<a class="chip" href="/category/${r.id}">${r.name}</a>`).join("")}
            </div>
          </div>
        </div>
      </div>`
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
  <div class="row row-cols-1 row-cols-md-2 g-3">
    ${leagueCards}
  </div>
</section>`;

  return layout({ title: "Friends in the Bend Music League", body });
}
