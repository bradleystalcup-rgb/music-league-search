# Music League History

A searchable archive of past Music League seasons, built from the CSV
exports Music League lets you download per league (competitors, rounds,
submissions, votes).

- Big search bar on the homepage — fuzzy-ish match on song title / artist,
  shows every submission of a match with its category (round) and vote total.
- `/artist/:slug` — every song submitted by an artist.
- `/user/:slug` — every submission by a user, across all leagues.
- `/category/:id` — a round's submissions, ordered by vote total (highest first).

Vote totals only — voter identity and comments from the export are ignored.

## Stack

Cloudflare Pages + Functions ([Hono](https://hono.dev)) + D1 (SQLite), same
pattern as the `paul-kortepeter-website` project.

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
so it's safe to re-run after editing raw CSVs. League names are
auto-generated as "League N (Month Year)"; rename them by editing the
`leagues` table directly (`UPDATE leagues SET name = ... WHERE id = ...`) or
tweaking `seed/build-seed.mjs`.

## First deploy

1. `wrangler d1 create musicleague-db` and paste the returned `database_id`
   into `wrangler.toml`.
2. `npm run db:migrate:remote`
3. `npm run db:seed:remote`
4. `npm run deploy` (or connect the repo in the Cloudflare Pages dashboard
   for git-based deploys), then point `musicleague.bradstalcup.com` at the
   Pages project via a CNAME/Cloudflare DNS record.
