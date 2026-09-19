import { createApp } from "./app.js";

// Hono's `fetch` already matches the Workers module export shape, so no
// adapter is needed here (unlike Pages Functions, which needed
// hono/cloudflare-pages's `handle()` wrapper).
export default createApp();
