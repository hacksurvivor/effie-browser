#!/bin/bash
# Every request Effie makes at start with no page of yours open: the baseline privacy plan step 1
# is checked against (engine/README.md). Linux, on a virtual display; needs Xvfb and xfwm4.
#
#   engine/check/netlog.sh [seconds=300] [effie binary=target/release/alter_spike]
#
# Prints the URLs (query strings cut) and hosts Chromium's network service touched, then keeps the
# full log in /tmp/effie-netlog/start.json.
set -euo pipefail
secs=${1:-300}
bin=${2:-target/release/alter_spike}
cd "$(dirname "$0")/../.."
out=/tmp/effie-netlog
rm -rf "$out" && mkdir -p "$out/prof/Import" && touch "$out/prof/Import/asked"
Xvfb :97 -screen 0 1600x1000x24 >/dev/null 2>&1 & xvfb=$!
sleep 1
DISPLAY=:97 xfwm4 --compositor=off >/dev/null 2>&1 & wm=$!
sleep 1
DISPLAY=:97 ALTER_SPIKE_HOST=1 ALTER_SPIKE_SHELL=alter ALTER_PROFILE_ROOT="$out/prof" LANG=en_US.UTF-8 ALTER_SHELL_HOME=about:blank \
  "$bin" --no-sandbox --log-net-log="$out/start.json" --net-log-capture-mode=Default > "$out/run.log" 2>&1 & effie=$!
sleep "$secs"
kill -TERM $effie; while kill -0 $effie 2>/dev/null; do sleep 1; done
kill $wm $xvfb 2>/dev/null || true
python3 -I - "$out/start.json" <<'EOF'
import collections, json, sys
text = open(sys.argv[1]).read()
try:
    d = json.loads(text)
except json.JSONDecodeError:
    # Effie's quit can end before Chromium closes the log: drop the cut line, close the list.
    d = json.loads(text[: text.rstrip().rfind("\n")].rstrip().rstrip(",") + "]}")
types = {v: k for k, v in d["constants"]["logEventTypes"].items()}
urls, hosts = collections.Counter(), collections.Counter()
for e in d["events"]:
    p = e.get("params", {})
    t = types.get(e["type"])
    if t in ("URL_REQUEST_START_JOB", "REQUEST_ALIVE") and "url" in p:
        urls[p["url"].split("?")[0][:120]] += 1
    if t == "HOST_RESOLVER_MANAGER_REQUEST" and "host" in p:
        hosts[p["host"]] += 1
for u, n in urls.most_common():
    print(n, u)
print("--- hosts")
for h, n in hosts.most_common():
    print(n, h)
EOF
