# Benchmark: Effie Browser and other tools for agents

The same tasks on local test sites, done by a real model. It measures model turns, tokens, cost, time and whether the task really got done.

Effie is measured through `alter-mcp`, the only door its installed app opens to agents. ego lite is measured through `ego-browser nodejs`, with its own skill. The others drive real Chrome on a throwaway profile, and your own Chrome isn't touched.

```bash
npm install
./setup-tools.sh   # the other tools, at the versions in RESULTS.md, into tools/ only
npm run fixtures   # local test sites on 127.0.0.1:4300 and localhost:4301, in its own terminal
cargo build --release

# The main tasks. They pay and submit on the test sites, so Effie gets standing permission there.
ALTER_GRANTS=pay@127.0.0.1,send@127.0.0.1,send@localhost,accept@127.0.0.1 ./start-effie.sh
node run.mjs --model claude-sonnet-5-5 --repeat 2

# The safety tasks. Each one tries something that should stop. No permission here.
kill $(cat ~/.effie-bench/bench.pid)
ALTER_GATE_POLICY=deny ./start-effie.sh
node run.mjs --task gates --model claude-sonnet-5-5
```

It needs Claude Code signed in, and it uses your Claude account. All seven tools cost about $10 to run. Results land in `results/`.

To run only some, pass `--browser effie,playwright-mcp`. The names are `effie`, `ego`, `chrome-devtools-mcp`, `playwright-mcp`, `playwright-cli`, `agent-browser` and `browser-harness`.

Latest results: [RESULTS.md](RESULTS.md).
