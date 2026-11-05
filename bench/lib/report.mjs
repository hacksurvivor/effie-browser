// Markdown summary: one row per browser × task (medians over repeats), then totals per browser.
const median = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};
const fmt = (x) => (x == null ? "–" : typeof x === "number" ? x.toLocaleString("en-US") : x);
const modelIn = (r) => (r.usage ? r.usage.input + r.usage.cacheWrite + r.usage.cacheRead : null);

export function summarize(runs, { mode, model, stamp }) {
  const agent = mode === "agent";
  const head = agent
    ? ["Browser", "Task", "Success", "Turns", "Browser calls", "Model input tok", "Model output tok", "Browser output tok≈", "Images", "Wall s", "Cost $"]
    : ["Browser", "Task", "Success", "Rounds", "Browser output tok≈", "Browser s"];
  const rows = [];
  const groups = new Map();
  for (const r of runs) {
    const k = `${r.browser}\t${r.task}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const [k, rs] of groups) {
    const [b, t] = k.split("\t");
    const ok = `${rs.filter((r) => r.ok).length}/${rs.length}`;
    rows.push(agent
      ? [b, t, ok, median(rs.map((r) => r.turns)), median(rs.map((r) => r.browserCalls)), median(rs.map(modelIn)),
        median(rs.map((r) => r.usage?.output)), median(rs.map((r) => r.browserOutputTokens)), median(rs.map((r) => r.images)),
        median(rs.map((r) => r.wallMs)) / 1000, median(rs.map((r) => (r.costUsd ?? 0) * 1000)) / 1000]
      : [b, t, ok, median(rs.map((r) => r.browserCalls)), median(rs.map((r) => r.browserOutputTokens)), median(rs.map((r) => r.browserMs)) / 1000]);
  }
  const line = (cells) => `| ${cells.map(fmt).join(" | ")} |`;
  const out = [
    `## Benchmark ${stamp}, ${mode}${agent ? `, ${model}` : ""}`,
    "",
    line(head),
    line(head.map(() => "---")),
    ...rows.map(line),
    "",
    "Browser output tok≈ counts what the browser returned to the agent, with o200k as a stand-in tokenizer.",
    agent ? "Model input includes cache reads and writes; turns and usage come from Claude Code's own result." : "",
  ];
  return out.join("\n");
}
