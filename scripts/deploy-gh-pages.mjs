/**
 * Publica dist/ na branch gh-pages (GitHub Pages).
 * Uso: VITE_BASE=/Eletrica/ npm run build && node scripts/deploy-gh-pages.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("dist/index.html não encontrado. Rode o build antes.");
  process.exit(1);
}

const run = (cmd) => {
  console.log(">", cmd);
  execSync(cmd, { cwd: root, stdio: "inherit" });
};

const stamp = new Date().toISOString();
run("git fetch origin gh-pages 2>nul || exit 0");

// worktree temporária
const wt = path.join(root, ".gh-pages-tmp");
fs.rmSync(wt, { recursive: true, force: true });

try {
  try {
    run(`git worktree add -B gh-pages "${wt}" origin/gh-pages`);
  } catch {
    run(`git worktree add -B gh-pages "${wt}" --orphan`);
  }

  // limpa e copia dist
  for (const name of fs.readdirSync(wt)) {
    if (name === ".git") continue;
    fs.rmSync(path.join(wt, name), { recursive: true, force: true });
  }
  fs.cpSync(dist, wt, { recursive: true });
  fs.writeFileSync(path.join(wt, ".nojekyll"), "");

  run(`git -C "${wt}" add -A`);
  try {
    run(
      `git -C "${wt}" commit -m "Deploy VoltES ${stamp}"`
    );
  } catch {
    console.log("Nada novo para commit em gh-pages.");
  }
  run(`git -C "${wt}" push -u origin gh-pages --force`);
} finally {
  try {
    run(`git worktree remove "${wt}" --force`);
  } catch {
    fs.rmSync(wt, { recursive: true, force: true });
  }
}

console.log("OK → https://infinityprojetos0-star.github.io/Eletrica/");
