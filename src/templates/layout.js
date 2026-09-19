export function layout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css">
<link rel="stylesheet" href="/vendor/open-props/open-props.min.css">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <div class="container d-flex align-items-center justify-content-between py-3">
    <a class="brand" href="/">🎵 Friends in the Bend Music League</a>
    <nav class="site-nav">
      <a href="/stats" class="btn btn-primary btn-sm">📊 Stats</a>
    </nav>
  </div>
</header>
<main class="container py-5">
${body}
</main>
<footer class="site-footer border-top py-4 text-center">
  <div class="container">Friends in the Bend Music League archive &middot; click a vote total to see comments</div>
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
  return `<form class="input-group input-group-lg search-bar" action="/search" method="get">
    <input type="text" class="form-control" name="q" value="${escapeHtml(query)}" placeholder="Search a song or artist&hellip;" autofocus autocomplete="off">
    <button class="btn btn-primary" type="submit">Search</button>
  </form>`;
}
