#!/bin/zsh
# Starts the installed Effie Browser on a bench profile of its own, with its agent door open, and
# prints its socket. Your own profile isn't touched. Stop it with: kill $(cat <profile>/bench.pid)
#
# Questions go by these settings, which pass through: ALTER_GRANTS="pay@127.0.0.1,send@127.0.0.1"
# (standing permission, per category and site) and ALTER_GATE_POLICY=deny (nobody's there, so no).
set -u
app=${EFFIE_APP:-/Applications/Effie Browser.app}
root=${ALTER_PROFILE_ROOT:-$HOME/.effie-bench}
mkdir -p "$root/Import" && touch "$root/Import/asked"
rm -f "$root/run/host.sock"
ALTER_PROFILE_ROOT=$root ALTER_SPIKE_HOST=1 ALTER_SHELL_BEHIND=1 nohup "$app/Contents/MacOS/Effie Browser" > "$root/bench.log" 2>&1 &
echo $! > "$root/bench.pid"
for _ in {1..30}; do
  [[ -S $root/run/host.sock ]] && { echo "$root/run/host.sock"; exit 0; }
  sleep 1
done
echo "Effie didn't start; see $root/bench.log" >&2; exit 1
