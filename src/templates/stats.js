import { layout } from "./layout.js";
import { submissionTable } from "./submission-table.js";

export function statsPage({ stats, pointsLeaders, wordLeaders, topArtists, topSongs }) {
  const statCards = [
    { label: "Leagues", value: stats.leagues },
    { label: "Categories", value: stats.rounds },
    { label: "Submissions", value: stats.submissions },
    { label: "Unique songs", value: stats.songs },
    { label: "Unique artists", value: stats.artists },
    { label: "Votes cast", value: stats.votes_cast },
  ]
    .map((s) => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`)
    .join("");

  const body = `
<p class="breadcrumb"><a href="/">&larr; back to search</a></p>
<section class="hero hero-compact">
  <h1>Archive stats</h1>
  <p class="lede">Fun numbers from every league so far.</p>
</section>
<div class="stat-row">${statCards}</div>

<section class="chart-section">
  <h2>Most points earned (lifetime)</h2>
  <p class="lede">Total vote points a person's submissions have racked up, across every league.</p>
  <div class="chart-wrap"><canvas id="chart-points"></canvas></div>
</section>

<section class="chart-section">
  <h2>Most words written</h2>
  <p class="lede">Combined word count of submission notes and vote comments &mdash; the archive's most prolific writers.</p>
  <div class="chart-wrap"><canvas id="chart-words"></canvas></div>
</section>

<section class="chart-section">
  <h2>Most submitted artists</h2>
  <p class="lede">Artists that show up again and again across every league.</p>
  <div class="chart-wrap"><canvas id="chart-artists"></canvas></div>
</section>

<section>
  <h2>Top songs of all time</h2>
  ${submissionTable(topSongs)}
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

  function horizontalBar(canvasId, labels, data, color) {
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
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: line }, ticks: { precision: 0 } },
          y: { grid: { display: false }, ticks: { color: ink, font: { weight: '500' } } },
        },
      },
    });
  }

  const pointsData = ${escapeScript(JSON.stringify(pointsLeaders))};
  horizontalBar('chart-points', pointsData.map((d) => d.name), pointsData.map((d) => d.total_points), '#5c7f49');

  const wordData = ${escapeScript(JSON.stringify(wordLeaders))};
  horizontalBar('chart-words', wordData.map((d) => d.name), wordData.map((d) => d.total_words), '#8f5c85');

  const artistData = ${escapeScript(JSON.stringify(topArtists))};
  horizontalBar('chart-artists', artistData.map((d) => d.artist), artistData.map((d) => d.submission_count), '#5c86a3');
})();
</script>`;

  return layout({ title: "Archive Stats — Music League History", body });
}

// Prevents a title/name containing "</script>" from breaking out of the
// inline <script> block when the JSON is embedded directly in the page.
function escapeScript(json) {
  return json.replace(/</g, "\\u003c");
}
