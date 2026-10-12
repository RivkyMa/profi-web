#!/usr/bin/env node
/**
 * Optimize a raw GLB for the web with gltf-transform.
 *
 *   node scripts/optimize-model.mjs <input.glb> <output.glb> [--ratio 0.08] [--texture 2048]
 *
 * Pipeline: weld -> simplify (triangle ratio) -> resize textures -> WebP
 * textures -> meshopt geometry compression. Meshopt (not Draco) is used so the
 * runtime needs no external decoder download.
 *
 * Raw sources live in assets-src/ (git-ignored); only the optimized output is
 * committed under public/models/.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const [input, output] = positional;
if (!input || !output) {
  console.error("Usage: node scripts/optimize-model.mjs <input.glb> <output.glb> [--ratio 0.08] [--texture 2048]");
  process.exit(1);
}

const ratio = flag("ratio", "0.08");
const texture = flag("texture", "2048");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "node_modules", "@gltf-transform", "cli", "bin", "cli.js");
const work = join(root, "assets-src", ".tmp");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// Run the CLI entry with node directly: no shell, so paths with spaces are safe.
const run = (...cliArgs) =>
  execFileSync(process.execPath, [cli, ...cliArgs], { stdio: "inherit" });

const step = (name, ...extra) => {
  const prev = step.last;
  const next = join(work, `${step.n++}-${name}.glb`);
  run(name, prev, next, ...extra);
  step.last = next;
};
step.n = 0;
step.last = resolve(input);

step("weld");
step("simplify", "--ratio", ratio, "--error", "0.01");
step("resize", "--width", texture, "--height", texture);
step("webp", "--quality", "82");
step("meshopt", "--level", "high");

mkdirSync(dirname(resolve(output)), { recursive: true });
copyFileSync(step.last, resolve(output));
rmSync(work, { recursive: true, force: true });

const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(2);
console.log(`\n${input}: ${mb(input)} MB  ->  ${output}: ${mb(output)} MB`);
