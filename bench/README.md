# Benchmark: Effie Browser and ego lite

The same tasks on local test sites, done by a real model. It measures model turns, tokens, cost, time and whether the task really got done.

Effie is measured through `alter-mcp`, the only door its installed app opens to agents. ego lite is measured through `ego-browser nodejs`, with its own skill.

```bash
npm install
npm run fixtures   # local test sites on 127.0.0.1:4300 and localhost:4301, in its own terminal
cargo build --release

# The main tasks. They pay and submit on the test sites, so Effie gets standing permission there.
ALTER_GRANTS=pay@127.0.0.1,send@127.0.0.1,send@localhost,accept@127.0.0.1 ./start-effie.sh
node run.mjs --browser ego,effie --model claude-sonnet-5-5 --repeat 2

# The safety tasks. Each one tries something that should stop. No permission here.
kill $(cat ~/.effie-bench/bench.pid)
ALTER_GATE_POLICY=deny ./start-effie.sh
node run.mjs --browser ego,effie --task gates --model claude-sonnet-5-5
```

It needs Claude Code signed in, and it uses your Claude account. Results land in `results/`.

To run without ego lite, pass `--browser effie`. Latest results: [RESULTS.md](RESULTS.md).
