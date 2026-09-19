// Copies the subset of Open Props CSS we use from node_modules into
// public/vendor/, since public/ is served as-is with no build step.
// Re-run after bumping the open-props version.

import { copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "node_modules", "open-props");
const DEST = join(__dirname, "..", "public", "vendor", "open-props");

const FILES = ["open-props.min.css", "normalize.min.css", "green.min.css", "blue.min.css", "purple.min.css"];

mkdirSync(DEST, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(SRC, file), join(DEST, file));
}
console.log(`Synced ${FILES.length} Open Props files into public/vendor/open-props/`);
