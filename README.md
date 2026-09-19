# Music League History

A searchable archive of past Music League seasons, built from the CSV
exports Music League lets you download per league (competitors, rounds,
submissions, votes).

- Big search bar on the homepage — fuzzy-ish match on song title / artist,
  shows every submission of a match with its category (round) and vote total.
  Click a vote total to expand the submitter's note and each voter's points
  + comment.
- `/artist/:slug` — every song submitted by an artist.
- `/user/:slug` — every submission by a user, across all leagues, with
  fun-fact stat cards (submissions, categories won including ties, leagues
  played).
- `/category/:id` — a round's submissions, ordered by vote total (highest first).
- `/stats` — archive-wide headline numbers plus a few leaderboards (points
  earned, word count, most-submitted artists) and a top-songs table,
  charted with [Chart.js](https://www.chartjs.org).

## Stack

Cloudflare Workers with [Static Assets](https://developers.cloudflare.com/workers/static-assets/)
([Hono](https://hono.dev)) + D1 (SQLite). `src/worker.js` is the Worker
entrypoint (a plain Hono app — no Pages adapter needed); anything in
`public/` that matches a request path is served directly, everything else
falls through to the Worker. No JS bundler — Open Props and Chart.js are
vendored as static files into `public/vendor/` via `npm run sync:vendor`
(see `scripts/sync-vendor.mjs`).

This used to be a Cloudflare Pages project. It was migrated to Workers +
Static Assets because Cloudflare's dashboard now creates new git-connected
projects as "Workers" resources (via the Workers Builds CI system) even
when the code is Pages-shaped — and that CI's auto-provisioned deploy
token is scoped to Workers only, so a Pages-style deploy command fails
with a Pages API auth error no matter what. Matching the code to what the
dashboard actually provisions was simpler than fighting it.

## Local setup

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

## Updating the data

Drop new/updated league export folders (`competitors.csv`, `rounds.csv`,
`submissions.csv`, `votes.csv`) into `data/raw/league_N/`, in chronological
order, then:

```bash
npm run build:seed       # regenerates seed/seed.sql from data/raw/
npm run db:seed:local    # re-applies it locally
npm run db:seed:remote   # re-applies it to production
```

`build:seed` fully replaces the seeded tables each time (it's not additive),
so it's safe to re-run after editing raw CSVs. It emits batched multi-row
`INSERT`s rather than one statement per row — `wrangler d1 execute` sends
each statement as its own request, so with ~900 submissions and ~6,000
votes, one-statement-per-row made local seeding painfully slow. League
names are auto-generated as "League N (Month Year)"; rename them by editing
the `leagues` table directly (`UPDATE leagues SET name = ... WHERE id = ...`)
or tweaking `seed/build-seed.mjs`.

## First deploy

1. `wrangler d1 create musicleague-db` and paste the returned `database_id`
   into `wrangler.toml`.
2. `npm run db:migrate:remote` (applies both `migrations/0001_init.sql` and
   `migrations/0002_add_votes.sql`)
3. `npm run db:seed:remote`
4. `npm run deploy`, or connect the repo in the Cloudflare dashboard
   (**Workers & Pages → Create application → Connect to Git**) for
   git-based deploys — its default build is `npm install` +
   `npx wrangler deploy`, which matches this repo's `wrangler.toml` as-is.
   Then add a custom domain (`musicleague.bradstalcup.com`) to the Worker
   under its **Settings → Domains & Routes**.
