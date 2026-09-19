import { Hono } from "hono";

import {
  searchSubmissions,
  getArtistBySlug,
  getUserBySlug,
  getRoundById,
  getLeagueById,
  listLeaguesWithRounds,
  getStats,
  getPointsLeaderboard,
  getWordCountLeaderboard,
  getTopArtists,
  getTopSongs,
  getWorstSongs,
  getCategoryWinsLeaderboard,
  getLeagueStandings,
  getRepeatSongs,
} from "./db.js";
import { homePage } from "./templates/home.js";
import { searchPage } from "./templates/search.js";
import { artistPage } from "./templates/artist.js";
import { userPage } from "./templates/user.js";
import { categoryPage } from "./templates/category.js";
import { leaguePage } from "./templates/league.js";
import { statsPage } from "./templates/stats.js";

export function createApp() {
  const app = new Hono();

  app.get("/", async (c) => {
    const [stats, leagues] = await Promise.all([getStats(c.env.DB), listLeaguesWithRounds(c.env.DB)]);
    return c.html(homePage({ stats, leagues }));
  });

  app.get("/search", async (c) => {
    const query = c.req.query("q") || "";
    const results = query.trim() ? await searchSubmissions(c.env.DB, query) : [];
    return c.html(searchPage({ query, results }));
  });

  app.get("/artist/:slug", async (c) => {
    const artist = await getArtistBySlug(c.env.DB, c.req.param("slug"));
    if (!artist) return c.notFound();
    return c.html(artistPage(artist));
  });

  app.get("/user/:slug", async (c) => {
    const user = await getUserBySlug(c.env.DB, c.req.param("slug"));
    if (!user) return c.notFound();
    return c.html(userPage(user));
  });

  app.get("/stats", async (c) => {
    const [stats, pointsLeaders, wordLeaders, categoryWinLeaders, topArtists, topSongs, worstSongs, leagueStandings, repeatSongs] =
      await Promise.all([
        getStats(c.env.DB),
        getPointsLeaderboard(c.env.DB),
        getWordCountLeaderboard(c.env.DB),
        getCategoryWinsLeaderboard(c.env.DB),
        getTopArtists(c.env.DB),
        getTopSongs(c.env.DB),
        getWorstSongs(c.env.DB),
        getLeagueStandings(c.env.DB),
        getRepeatSongs(c.env.DB),
      ]);
    return c.html(
      statsPage({
        stats,
        pointsLeaders,
        wordLeaders,
        categoryWinLeaders,
        topArtists,
        topSongs,
        worstSongs,
        leagueStandings,
        repeatSongs,
      })
    );
  });

  app.get("/league/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.notFound();
    const league = await getLeagueById(c.env.DB, id);
    if (!league) return c.notFound();
    return c.html(leaguePage({ league, submissions: league.submissions }));
  });

  app.get("/category/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.notFound();
    const round = await getRoundById(c.env.DB, id);
    if (!round) return c.notFound();
    return c.html(categoryPage({ round, submissions: round.submissions }));
  });

  return app;
}
