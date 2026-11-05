// Runs one task with a real model: headless Claude Code, Bash limited to `ego-browser`, the
// browser's skill as the only extra instructions. Everything we report comes from Claude
// Code's own stream: turns, token usage, cost, and every browser call with its output.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countTokens } from "./tokens.mjs";

export function prompt(task, space, door) {
  if (door === "alter") {
    return [
      `Use the browser through your alter tools (act, look, finish). Your tab starts empty; go to ${task.url}`,
      ``,
      `Task: ${task.goal}`,
      ``,
      `When you're done, call finish and end your reply with one line: FINAL: <the answer, or "done">.`,
    ].join("\n");
  }
  const how = door === "mcp"
    ? "Use the browser through the `run` tool: it runs one script exactly as `ego-browser nodejs` would, as your system prompt describes, and returns its output."
    : "Use the browser through the `ego-browser nodejs` command, as your system prompt describes.";
  return [
    how,
    `Work in one task space named "${space}". Start at ${task.url}`,
    ``,
    `Task: ${task.goal}`,
    ``,
    `When you're done, finish the task space as the skill describes (close its pages) and end your reply with`,
    `one line: FINAL: <the answer, or "done">.`,
  ].join("\n");
}

export function runAgent({ task, space, model, skill, binDir, door = "bash", browser = {}, maxTurns = 40, timeoutMs = 15 * 60_000 }) {
  const cwd = mkdtempSync(join(tmpdir(), "alter-bench-"));
  writeFileSync(join(cwd, "skill.md"), skill || "");
  // A gate can keep a tool call open while a person answers; give MCP calls room for that.
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}`, MCP_TOOL_TIMEOUT: process.env.MCP_TOOL_TIMEOUT || "900000" };
  delete env.CLAUDECODE;
  // bash: the agent runs `ego-browser nodejs` itself. mcp: one `run` tool does it (lib/mcp-script.mjs).
  // alter: the engine's own door; its tool descriptions are the whole skill.
  const tools = door === "alter"
    ? ["--tools", "", "--allowedTools", "mcp__alter__act", "mcp__alter__look", "mcp__alter__finish",
       "--mcp-config", JSON.stringify({ mcpServers: { alter: { command: browser.mcp, args: [], env: { HOME: process.env.HOME, ALTER_TASK: space, ...browser.env } } } })]
    : door === "mcp"
    ? ["--tools", "", "--allowedTools", "mcp__browser__run",
       "--mcp-config", JSON.stringify({ mcpServers: { browser: { command: process.execPath, args: [join(import.meta.dirname, "mcp-script.mjs")], env: { PATH: env.PATH, HOME: process.env.HOME } } } })]
    : ["--tools", "Bash,Read", "--allowedTools", "Bash(ego-browser:*)", "Read"];
  const args = [
    "-p", prompt(task, space, door),
    "--output-format", "stream-json", "--verbose",
    "--model", model,
    ...tools,
    ...(skill ? ["--append-system-prompt-file", join(cwd, "skill.md")] : []),
    "--strict-mcp-config", "--setting-sources", "",
    "--no-session-persistence",
    "--max-turns", String(maxTurns),
  ];
  return new Promise((done) => {
    const started = performance.now();
    const child = spawn("claude", args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const calls = [];
    const pending = new Map();
    let result = null, buf = "", stderr = "";
    const onLine = (line) => {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === "assistant") {
        for (const c of ev.message?.content || []) {
          if (c.type === "tool_use") pending.set(c.id, { tool: c.name, input: c.input?.command || c.input?.script || JSON.stringify(c.input), t: performance.now() });
        }
      } else if (ev.type === "user") {
        for (const c of ev.message?.content || []) {
          if (c.type !== "tool_result") continue;
          const p = pending.get(c.tool_use_id);
          const text = typeof c.content === "string" ? c.content
            : (c.content || []).map((x) => x.text || (x.type === "image" ? "[image]" : "")).join("\n");
          const images = typeof c.content === "string" ? 0 : (c.content || []).filter((x) => x.type === "image").length;
          calls.push({ tool: p?.tool, chars: text.length, tokens: countTokens(text), images, error: !!c.is_error,
            ms: p ? Math.round(performance.now() - p.t) : null, command: p?.input?.slice(0, 4000), output: text.slice(0, 20000) });
        }
      } else if (ev.type === "result") {
        result = ev;
      }
    };
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const u = result?.usage || {};
      const browserCalls = calls.filter((c) => c.tool === "Bash" || c.tool === "mcp__browser__run" || c.tool?.startsWith("mcp__alter__"));
      done({
        exitCode: code,
        timedOut: !result,
        wallMs: Math.round(performance.now() - started),
        turns: result?.num_turns ?? null,
        costUsd: result?.total_cost_usd ?? null,
        usage: {
          input: u.input_tokens ?? 0,
          cacheWrite: u.cache_creation_input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          output: u.output_tokens ?? 0,
        },
        browserCalls: browserCalls.length,
        browserOutputTokens: browserCalls.reduce((s, c) => s + c.tokens, 0),
        browserMs: browserCalls.reduce((s, c) => s + (c.ms || 0), 0),
        images: calls.reduce((s, c) => s + c.images, 0),
        finalText: result?.result ?? "",
        calls,
        stderr: stderr.slice(-2000),
      });
    });
  });
}
