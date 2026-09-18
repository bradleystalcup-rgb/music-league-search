export function layout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <div class="wrap site-header-inner">
    <a class="brand" href="/">🎵 Music League History</a>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">Music League archive &middot; vote totals only, no ranking/comment history</div>
</footer>
</body>
</html>`;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export function searchBar(query = "") {
  return `<form class="search-bar" action="/search" method="get">
    <input type="text" name="q" value="${escapeHtml(query)}" placeholder="Search a song or artist&hellip;" autofocus autocomplete="off">
    <button type="submit">Search</button>
  </form>`;
}
