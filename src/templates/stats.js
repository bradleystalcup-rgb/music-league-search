import { layout, escapeHtml } from "./layout.js";
import { submissionTable, voteClass } from "./submission-table.js";

export function statsPage({
  stats,
  pointsLeaders,
  wordLeaders,
  categoryWinLeaders,
  topArtists,
  topSongs,
  worstSongs,
  leagueStandings,
  repeatSongs,
  commentVerbosity,
  playerRatings,
  categoryRatings,
  roundsMissed,
  votesForfeited,
  correctGuesses,
}) {
  const statCards = [
    { label: "Leagues", value: stats.leagues },
    { label: "Categories", value: stats.rounds },
    { label: "Submissions", value: stats.submissions },
    { label: "Unique songs", value: stats.songs },
    { label: "Unique artists", value: stats.artists },
    { label: "Votes cast", value: stats.votes_cast },
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
<section class="hero hero-compact">
  <h1>Archive stats</h1>
  <p class="lede">Fun numbers from every league so far.</p>
</section>
<div class="row row-cols-2 row-cols-md-3 g-3 stat-row">${statCards}</div>

<h2 class="stats-group-title">Rankings</h2>

${leagueStandingsSection(leagueStandings)}

<section class="chart-section">
  <h3>Category wins</h3>
  <p class="lede">Rounds won per person (ties count as a win for everyone tied at the top), across every league.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-wins"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Most points earned (lifetime)</h3>
  <p class="lede">Total vote points a person's submissions have racked up, across every league.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-points"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Player rating</h3>
  <p class="lede">Average share of each league's total points earned, across every league played, rescaled 0&ndash;100 so the top player sits at 100.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-rating"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Player rating (category)</h3>
  <p class="lede">Same idea, but for category wins: average share of each league's rounds won, across every league played, rescaled 0&ndash;100 so the top player sits at 100.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-rating-category"></canvas></div></div>
</section>

<h2 class="stats-group-title">Comments</h2>

<section class="chart-section">
  <h3>Most words written</h3>
  <p class="lede">Combined word count of submission notes and vote comments &mdash; the archive's most prolific writers.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-words"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Words per vote</h3>
  <p class="lede">Vote-comment word count divided by every vote cast, including silent ones &mdash; overall chattiness while voting.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-words-per-vote"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Words per comment</h3>
  <p class="lede">How long a person's vote comment runs, on average, when they actually leave one (5+ comments to qualify).</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-words-per-comment"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Votes without comments</h3>
  <p class="lede">How many of a person's votes were cast silently, with no comment attached.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-silent-votes"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Correct guesses</h3>
  <p class="lede">A vote comment that names the actual submitter counts as calling it.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-guesses"></canvas></div></div>
</section>

<h2 class="stats-group-title">Other stats</h2>

<section class="chart-section">
  <h3>Rounds missed</h3>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-rounds-missed"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Votes forfeited</h3>
  <p class="lede">Points a person's own submission earned in a round where they themselves cast zero votes &mdash; taking votes without reciprocating.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-forfeited"></canvas></div></div>
</section>

<section class="chart-section">
  <h3>Most submitted artists</h3>
  <p class="lede">Artists that show up again and again across every league.</p>
  <div class="card chart-wrap"><div class="card-body"><canvas id="chart-artists"></canvas></div></div>
</section>

${repeatSongsSection(repeatSongs)}

<section>
  <h3>Top songs of all time</h3>
  ${submissionTable(topSongs)}
</section>

<section>
  <h3>Rock bottom</h3>
  <p class="lede">The lowest-scoring submissions in archive history.</p>
  ${submissionTable(worstSongs)}
</section>

<script src="/vendor/chartjs/chart.umd.min.js"></script>
<script>
(function () {
  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue('--ink').trim();
  const muted = style.getPropertyValue('--muted').trim();
  const line = style.getPropertyValue('--line').trim();

  Chart.defaults.color = muted;
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";

  function horizontalBar(canvasId, labels, data, color, { decimals = 0, extra = null, extraLabel = '' } = {}) {
    const el = document.getElementById(canvasId);
    if (!el || labels.length === 0) return;
    new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: color, borderRadius: 6, maxBarThickness: 28 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.parsed.x.toFixed(decimals);
                if (!extra) return value;
                return \`\${value} (\${extra[ctx.dataIndex].toFixed(1)}\${extraLabel})\`;
              },
            },
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: line }, ticks: { precision: decimals } },
          y: { grid: { display: false }, ticks: { color: ink, font: { weight: '500' } } },
        },
      },
    });
  }

  const winsData = ${escapeScript(JSON.stringify(categoryWinLeaders))};
  horizontalBar('chart-wins', winsData.map((d) => d.name), winsData.map((d) => d.wins), '#476c87');

  const pointsData = ${escapeScript(JSON.stringify(pointsLeaders))};
  horizontalBar('chart-points', pointsData.map((d) => d.name), pointsData.map((d) => d.total_points), '#5c7f49');

  const ratingData = ${escapeScript(JSON.stringify(playerRatings))};
  horizontalBar('chart-rating', ratingData.map((d) => d.name), ratingData.map((d) => d.rating), '#5c7f49', {
    decimals: 1,
    extra: ratingData.map((d) => d.raw_rating),
    extraLabel: '% avg share of league points',
  });

  const categoryRatingData = ${escapeScript(JSON.stringify(categoryRatings))};
  horizontalBar('chart-rating-category', categoryRatingData.map((d) => d.name), categoryRatingData.map((d) => d.rating), '#5c7f49', {
    decimals: 1,
    extra: categoryRatingData.map((d) => d.raw_rating),
    extraLabel: '% avg share of league categories won',
  });

  const wordData = ${escapeScript(JSON.stringify(wordLeaders))};
  horizontalBar('chart-words', wordData.map((d) => d.name), wordData.map((d) => d.total_words), '#8f5c85');

  const perVoteData = ${escapeScript(JSON.stringify(commentVerbosity.perVote))};
  horizontalBar('chart-words-per-vote', perVoteData.map((d) => d.name), perVoteData.map((d) => d.words_per_vote), '#8f5c85', { decimals: 1 });

  const perCommentData = ${escapeScript(JSON.stringify(commentVerbosity.perComment))};
  horizontalBar('chart-words-per-comment', perCommentData.map((d) => d.name), perCommentData.map((d) => d.words_per_comment), '#8f5c85', { decimals: 1 });

  const silentData = ${escapeScript(JSON.stringify(commentVerbosity.silent))};
  horizontalBar('chart-silent-votes', silentData.map((d) => d.name), silentData.map((d) => d.silent_votes), '#8f5c85');

  const guessesData = ${escapeScript(JSON.stringify(correctGuesses))};
  horizontalBar('chart-guesses', guessesData.map((d) => d.name), guessesData.map((d) => d.correct_guesses), '#8f5c85');

  const roundsMissedData = ${escapeScript(JSON.stringify(roundsMissed))};
  horizontalBar('chart-rounds-missed', roundsMissedData.map((d) => d.name), roundsMissedData.map((d) => d.rounds_missed), '#5c86a3');

  const forfeitedData = ${escapeScript(JSON.stringify(votesForfeited))};
  horizontalBar('chart-forfeited', forfeitedData.map((d) => d.name), forfeitedData.map((d) => d.forfeited_votes), '#5c86a3');

  const artistData = ${escapeScript(JSON.stringify(topArtists))};
  horizontalBar('chart-artists', artistData.map((d) => d.artist), artistData.map((d) => d.submission_count), '#5c86a3');
})();
</script>`;

  return layout({ title: "Archive Stats — Friends in the Bend Music League", body });
}

// Prevents a title/name containing "</script>" from breaking out of the
// inline <script> block when the JSON is embedded directly in the page.
function escapeScript(json) {
  return json.replace(/</g, "\\u003c");
}

function leagueStandingsSection(leagueStandings) {
  if (!leagueStandings || leagueStandings.length === 0) return "";

  const rows = leagueStandings
    .map(
      (l) => `<tr>
        <td class="repeat-song-title"><a href="/league/${l.id}">${escapeHtml(l.name)}</a></td>
        <td>${standingCell(l.first)}</td>
        <td>${standingCell(l.second)}</td>
        <td>${standingCell(l.third)}</td>
        <td>${standingCell(l.last)}</td>
      </tr>`
    )
    .join("");

  return `<section class="chart-section">
    <h3>League champion history</h3>
    <p class="lede">Standings by total points earned across each league's rounds. Last place only shown for leagues with more than three players.</p>
    <div class="table-responsive">
      <table class="table table-hover align-middle submissions">
        <thead><tr><th>League</th><th>&#129351; 1st</th><th>&#129352; 2nd</th><th>&#129353; 3rd</th><th>Last</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function standingCell(entry) {
  if (!entry) return `<span class="muted">&mdash;</span>`;
  return `<a href="/user/${encodeURIComponent(entry.slug)}">${escapeHtml(entry.name)}</a> <span class="muted">(${entry.total_points})</span>`;
}

function repeatSongsSection(repeatSongs) {
  if (!repeatSongs || repeatSongs.length === 0) return "";

  const maxOccurrences = Math.max(...repeatSongs.map((s) => s.occurrences.length));
  const occurrenceHeaders = Array.from({ length: maxOccurrences }, (_, i) => `<th>${ordinal(i + 1)}</th>`).join("");

  const rows = repeatSongs
    .map((song) => {
      const cells = Array.from({ length: maxOccurrences }, (_, i) => {
        const o = song.occurrences[i];
        if (!o) return `<td></td>`;
        return `<td><a class="repeat-occurrence" href="/category/${o.round_id}" title="${escapeHtml(o.league_name)} · ${escapeHtml(o.round_name)}">
          <span class="badge rounded-pill ${voteClass(o.vote_total)}">${o.vote_total}</span>
        </a></td>`;
      }).join("");

      return `<tr>
        <td class="repeat-song-title">${escapeHtml(song.title)} <span class="muted">&mdash; <a href="/artist/${encodeURIComponent(song.artist_slug)}">${escapeHtml(song.artist)}</a></span></td>
        ${cells}
      </tr>`;
    })
    .join("");

  return `<section class="chart-section">
    <h3>Repeat songs</h3>
    <p class="lede">Songs submitted more than once &mdash; vote total each time, earliest to latest, left to right.</p>
    <div class="table-responsive">
      <table class="table table-hover align-middle submissions repeat-songs-table">
        <thead><tr><th>Song</th>${occurrenceHeaders}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function ordinal(n) {
  const suffixes = { 1: "st", 2: "nd", 3: "rd" };
  return `${n}${suffixes[n] || "th"}`;
}
