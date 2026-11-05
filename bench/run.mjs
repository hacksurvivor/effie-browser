#!/usr/bin/env node
// Benchmark: the same tasks on ego lite and on Effie Browser, done by a real model.
//
//   node run.mjs --browser ego,effie --task all --model claude-sonnet-5-5 --repeat 2
//
// Measures model turns, tokens, cost and time from Claude Code's own result (lib/agent.mjs). Needs
// the fixture server (`npm run fixtures`) and, for Effie, the app running (./start-effie.sh).
import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tasks } from "./tasks.mjs";
import { browser, shimDir, runScript, skillText } from "./lib/browsers.mjs";
import { runAgent } from "./lib/agent.mjs";
import { countTokens } from "./lib/tokens.mjs";
import { summarize } from "./lib/report.mjs";

const { values: opt } = parseArgs({
  options: {
    mode: { type: "string", default: "agent" },
    browser: { type: "string", default: "ego,effie" },
    task: { type: "string", default: "all" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    repeat: { type: "string", default: "1" },
    "max-turns": { type: "string", default: "40" },
    fixtures: { type: "string", default: process.env.BENCH_FIXTURES || "http://127.0.0.1:4300" },
    label: { type: "string", default: "" },
    door: { type: "string", default: "mcp" },
  },
});

const here = import.meta.dirname;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = join(here, "results", `${stamp}-${opt.mode}${opt.label ? "-" + opt.label : ""}`);
mkdirSync(runDir, { recursive: true });

// "all" is the main suite; "gates" the E4 suite; or a list of ids.
const selected = opt.task === "all" ? tasks.filter((t) => !t.suite)
  : opt.task === "gates" ? tasks.filter((t) => t.suite === "gates")
  : tasks.filter((t) => opt.task.split(",").includes(t.id));
if (!selected.length) throw new Error(`no tasks match ${opt.task}`);
const browsers = opt.browser.split(",").map(browser);
const repeat = Number(opt.repeat);

const fx = async (path, init) => {
  const r = await fetch(new URL(path, opt.fixtures), init);
  if (!r.ok) throw new Error(`fixtures ${path}: ${r.status}`);
  return r.json().catch(() => null);
};
await fx("/__state").catch(() => { throw new Error(`fixture server not reachable at ${opt.fixtures} (npm run fixtures)`); });

// Leave nothing behind: the SDK has a small page budget per space.
const finishSpace = (b, space) =>
  b.door === "alter" ? Promise.resolve() : runScript(b, `const t = await taskSpace(${JSON.stringify(space)});\nawait t.finish({ keep: [] });\n`, { timeoutMs: 30_000 });

const egoSkill = browsers.some((b) => b.id === "ego") ? skillText(browser("ego")) : null;
const runs = [];
for (const b of browsers) {
  const binDir = shimDir(b, runDir);
  for (const task of selected) {
    for (let rep = 1; rep <= repeat; rep++) {
      const space = `bench-${task.id}-${b.id}-${stamp.slice(11)}-${rep}`;
      await fx("/__reset", { method: "POST" });
      process.stdout.write(`${b.id} ${task.id} #${rep} … `);
      const res = await runAgent({ task, space, model: opt.model, skill: b.door === "alter" ? "" : egoSkill + (b.skillNote ? "\n\n" + b.skillNote : ""), binDir, door: b.door || opt.door, browser: b, maxTurns: Number(opt["max-turns"]) });
      const state = await fx("/__state");
      const check = res.skipped ? { ok: false, why: res.skipped } : task.check(state, res.finalText || "");
      await finishSpace(b, space);
      const run = { browser: b.id, task: task.id, rep, space, mode: opt.mode, model: opt.mode === "agent" ? opt.model : null, ok: check.ok, why: check.why, ...res, state };
      runs.push(run);
      writeFileSync(join(runDir, `${b.id}-${task.id}-${rep}.json`), JSON.stringify(run, null, 2));
      console.log(`${check.ok ? "ok" : "FAIL"} (${check.why}) ${run.wallMs ?? "-"} ms, ${run.browserCalls ?? "-"} browser calls, ~${run.browserOutputTokens ?? "-"} browser tokens`);
    }
  }
}

const md = summarize(runs, { mode: opt.mode, model: opt.model, stamp });
writeFileSync(join(runDir, "summary.md"), md);
console.log("\n" + md + `\nResults: ${runDir}`);
