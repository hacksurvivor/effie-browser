// The browsers under test. ego lite runs scripts through `ego-browser nodejs`; Effie Browser is
// measured through alter-mcp, the only door its installed app opens to agents.
import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const home = process.env.ALTER_PROFILE_ROOT || join(process.env.HOME, ".effie-bench");

export const browsers = {
  ego: {
    name: "ego lite",
    get bin() { return execFileSync("/bin/zsh", ["-lc", "command -v ego-browser"]).toString().trim(); },
    env: {},
  },
  effie: {
    name: "Effie Browser",
    bin: join(repo, "target/release/alter-mcp"),
    mcp: join(repo, "target/release/alter-mcp"),
    env: { ALTER_HOST_SOCK: join(home, "run/host.sock") },
    door: "alter",
  },
};

export function browser(id) {
  const b = browsers[id];
  if (!b) throw new Error(`unknown browser ${id} (ego | effie)`);
  if (!existsSync(b.bin)) throw new Error(`${b.name}: ${b.bin} not found (cargo build --release)`);
  return { id, name: b.name, bin: b.bin, mcp: b.mcp, env: b.env, door: b.door };
}

// A directory whose `ego-browser` runs the chosen browser, so the agent gets the same command.
export function shimDir(b, root) {
  const dir = join(root, `bin-${b.id}`);
  mkdirSync(dir, { recursive: true });
  const envs = Object.entries(b.env).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join("\n");
  writeFileSync(join(dir, "ego-browser"), `#!/bin/zsh\n${envs}\nexec ${JSON.stringify(b.bin)} "$@"\n`);
  chmodSync(join(dir, "ego-browser"), 0o755);
  return dir;
}

// Runs one script through `<bin> nodejs`, script on stdin. Returns output and wall time.
export function runScript(b, script, { timeoutMs = 120_000 } = {}) {
  return new Promise((done) => {
    const started = performance.now();
    const child = spawn(b.bin, ["nodejs"], { env: { ...process.env, ...b.env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr, ms: Math.round(performance.now() - started) });
    });
    child.stdin.end(script);
  });
}

export function skillText(b) {
  return execFileSync(b.bin, ["skill"], { env: { ...process.env, ...b.env } }).toString();
}
