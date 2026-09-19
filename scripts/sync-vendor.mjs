// Copies the third-party assets we use straight from node_modules into
// public/vendor/, since public/ is served as-is with no build step.
// Re-run after bumping a vendored package's version.

import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TARGETS = [
  {
    // Just the design tokens (spacing/shadow/radius/font-size scales) —
    // Bootstrap's Reboot replaces Open Props' normalize.min.css, and we
    // don't use the extended color ramps.
    src: join(ROOT, "node_modules", "open-props"),
    dest: join(ROOT, "public", "vendor", "open-props"),
    files: ["open-props.min.css"],
  },
  {
    src: join(ROOT, "node_modules", "chart.js", "dist"),
    dest: join(ROOT, "public", "vendor", "chartjs"),
    files: ["chart.umd.min.js"],
  },
  {
    // Bootstrap's flexbox-based grid (row/col) for page layout — Firefox
    // and Chromium disagree on sizing for CSS Grid's auto-fit/fr tracks in
    // some cases (see the league-card grid bug), and Bootstrap's grid is
    // flexbox-based, sidestepping that class of bug entirely.
    src: join(ROOT, "node_modules", "bootstrap", "dist", "css"),
    dest: join(ROOT, "public", "vendor", "bootstrap"),
    files: ["bootstrap.min.css"],
  },
];

for (const { src, dest, files } of TARGETS) {
  mkdirSync(dest, { recursive: true });
  for (const file of files) {
    copyFileSync(join(src, file), join(dest, file));
  }
  console.log(`Synced ${files.length} file(s) into ${dest}`);
}
