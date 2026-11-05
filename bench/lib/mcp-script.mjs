#!/usr/bin/env node
// A minimal MCP server (stdio, JSON-RPC, no dependencies) with one tool: run an ego SDK script
// through `ego-browser nodejs`, whichever browser that command points at. It stands in for the
// MCP door in docs/agents.md, so agents don't fight shell quoting and the Bash time limit.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

const TOOL = {
  name: "run",
  description:
    "Run one ego-browser script (the JavaScript you would pass to `ego-browser nodejs`, with taskSpace, page and the rest as in your instructions) and return everything it printed. Up to 5 minutes.",
  inputSchema: {
    type: "object",
    properties: { script: { type: "string", description: "The script's JavaScript source" } },
    required: ["script"],
  },
};

function run(script) {
  return new Promise((done) => {
    const child = spawn("ego-browser", ["nodejs"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 5 * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ text: out.trim() || "(no output)", isError: code !== 0 });
    });
    child.stdin.end(script);
  });
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === "initialize") {
    send({ id, result: { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "browser", version: "0.1.0" } } });
  } else if (method === "tools/list") {
    send({ id, result: { tools: [TOOL] } });
  } else if (method === "tools/call") {
    const r = await run(String(params?.arguments?.script || ""));
    send({ id, result: { content: [{ type: "text", text: r.text }], isError: r.isError } });
  } else if (id !== undefined) {
    send({ id, error: { code: -32601, message: `${method} not supported` } });
  }
});
