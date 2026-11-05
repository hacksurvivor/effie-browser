// The browsers and tools under test. Each gets the same tasks, the same model and only its own
// instructions. ego lite runs scripts through `ego-browser nodejs`; Effie Browser is measured
// through alter-mcp, the only door its installed app opens to agents; the others drive real Chrome
// on a throwaway profile, at the versions ./setup-tools.sh pins.
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dirname, "..");
const repo = resolve(here, "..");
const home = process.env.ALTER_PROFILE_ROOT || join(process.env.HOME, ".effie-bench");
const tools = join(here, "tools");
const bin = join(tools, "node_modules/.bin");
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const harnessPort = process.env.HARNESS_PORT || "9333";
const run = (command, args, env = {}) => spawnSync(command, args, { env: { ...process.env, ...env }, timeout: 30_000, encoding: "utf8" });

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
  "chrome-devtools-mcp": {
    name: "Chrome + Chrome DevTools MCP",
    door: "server",
    bin,
    env: {},
    server: { command: join(bin, "chrome-devtools-mcp"), args: ["--isolated", "--headless", "--executablePath", chrome, "--no-usage-statistics"] },
  },
  "playwright-mcp": {
    name: "Chrome + Playwright MCP",
    door: "server",
    bin,
    env: {},
    server: { command: join(bin, "playwright-mcp"), args: ["--browser", "chrome", "--isolated", "--headless"] },
  },
  "playwright-cli": {
    name: "Chrome + playwright-cli",
    door: "cli",
    command: "playwright-cli",
    bin,
    env: { PLAYWRIGHT_MCP_BROWSER: "chrome", PLAYWRIGHT_MCP_HEADLESS: "true" },
    skill: () => readFileSync(join(tools, "node_modules/@playwright/cli/skills/playwright-cli/SKILL.md"), "utf8"),
    cleanup: () => run(join(bin, "playwright-cli"), ["close-all"]),
  },
  "agent-browser": {
    name: "Chrome + agent-browser",
    door: "cli",
    command: "agent-browser",
    bin,
    env: { AGENT_BROWSER_EXECUTABLE_PATH: chrome },
    skill: () => execFileSync(join(bin, "agent-browser"), ["skills", "get", "core"]).toString(),
    cleanup: () => run(join(bin, "agent-browser"), ["close", "--all"], { AGENT_BROWSER_EXECUTABLE_PATH: chrome }),
  },
  "browser-harness": {
    name: "Chrome + Browser Harness",
    door: "cli",
    command: "browser-harness",
    bin: join(tools, "uv-bin"),
    env: { BU_CDP_URL: `http://127.0.0.1:${harnessPort}` },
    skill: () => execFileSync(join(tools, "uv-bin/browser-harness"), ["skill"]).toString(),
    // Its daemon stays connected to the browser that just closed.
    cleanup: () => run(join(tools, "uv-bin/browser-harness"), ["--reload"], { BU_CDP_URL: `http://127.0.0.1:${harnessPort}` }),
    // It attaches to a running Chrome, so it gets one of its own.
    start() {
      const profile = mkdtempSync(join(tmpdir(), "bench-harness-"));
      const child = spawn(chrome, ["--headless=new", `--remote-debugging-port=${harnessPort}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
      return () => {
        child.kill();
        // Chrome takes a moment to let go of its profile.
        setTimeout(() => rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), 3000);
      };
    },
  },
};

export function browser(id) {
  const b = browsers[id];
  if (!b) throw new Error(`unknown browser ${id} (${Object.keys(browsers).join(" | ")})`);
  const check = b.door === "server" ? b.server.command : b.door === "cli" ? join(b.bin, b.command) : b.bin;
  if (!existsSync(check)) throw new Error(`${b.name}: ${check} not found (./setup-tools.sh, cargo build --release)`);
  return { id, ...b, bin: b.bin };
}

// A directory whose `ego-browser` runs the chosen browser, so an agent gets the same command.
export function shimDir(b, root) {
  const dir = join(root, `bin-${b.id}`);
  mkdirSync(dir, { recursive: true });
  if (b.door === "server" || b.door === "cli") return dir;
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
