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
    src: join(ROOT, "node_modules", "open-props"),
    dest: join(ROOT, "public", "vendor", "open-props"),
    files: ["open-props.min.css", "normalize.min.css", "green.min.css", "blue.min.css", "purple.min.css"],
  },
  {
    src: join(ROOT, "node_modules", "chart.js", "dist"),
    dest: join(ROOT, "public", "vendor", "chartjs"),
    files: ["chart.umd.min.js"],
  },
];

for (const { src, dest, files } of TARGETS) {
  mkdirSync(dest, { recursive: true });
  for (const file of files) {
    copyFileSync(join(src, file), join(dest, file));
  }
  console.log(`Synced ${files.length} file(s) into ${dest}`);
}
