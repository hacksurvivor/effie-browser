# Effie Browser, open parts

How agents connect to Effie Browser, the Chromium patches and the benchmark. The app, its interface and the agent engine are closed and live in a private repo. This repo is generated from it, so a fix made only here is overwritten by the next export: open an issue instead, or a PR and it's carried over by hand.

## Run and check
- `cargo test --workspace`: no browser or network needed.
- `cargo build --release`: builds `target/release/alter-mcp`.
- `bench/start-effie.sh` starts the installed app on its own profile. `ALTER_HOST_SOCK=~/.effie-bench/run/host.sock target/release/alter-mcp` connects to it over stdio.
- `bench/README.md`: the benchmark. It uses your Claude account.

## Map
- `crates/alter-mcp/`: the MCP server. It talks JSON to the app over a Unix socket.
- `engine/`: the pinned Chromium and CEF commit, and our patches. A full build needs 200 GB and hours.
- `bench/`: tasks, local test sites and the runner.

## Gotchas
- The binary, env vars and some identifiers still say "alter", the project's working name. Installed agent setups depend on `alter-mcp`, so don't rename it.
- The app replaces its installed copy of `alter-mcp` with its own at launch. To try your build, point your agent straight at it.
- Paths under `spikes/` in `engine/` are in the closed repo.
- Keep the MPL-2.0 notices in `engine/patches/`.
