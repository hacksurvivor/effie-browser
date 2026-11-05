//! `alter-mcp` (spike E3): the MCP door to the running alter spike, over stdio.
//!
//!     alter-mcp install      registers Alter in your AI apps (Claude Desktop, Claude Code,
//!                            Codex, Cursor); `alter-mcp uninstall` takes it out again
//!
//! Any other MCP client: run `~/Library/Application Support/Alter/bin/alter-mcp` over stdio.
//!
//! Four tools: `act` (a plan the browser runs itself), `look` (what changed, or the whole
//! page), `finish` (close the task's tabs), `seen` (what the user is looking at in their own
//! tabs). Each MCP connection is one agent with one task
//! space, named by `ALTER_TASK` or after this process. The tool descriptions are the whole
//! skill: an agent needs nothing else to use the browser.

use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
#[cfg(unix)]
use std::os::unix::net::UnixStream;
#[cfg(windows)]
use uds_windows::UnixStream;

const ACT: &str = r#"Do things in your browser tab, in one call. Send a plan: steps run in order by the browser itself, each waits for the page to settle, and the first step that fails (or whose `expect` doesn't hold) stops the plan. You get one line per step and then what changed on the page.

Steps:
  {"go": "https://…"}
  {"click": T}
  {"fill": T, "with": "text"}   or several fields at once: {"fill": {"Email": "a@b.c", "Phone": "+1 …"}}
  {"select": T, "option": "15:00"}       native selects, by value or visible text
  {"check": T}  {"uncheck": T}
  {"upload": T, "file": "/full/path"}    or "files": [...]. T is a file field or the button that opens the chooser; "" means the page's only file field, hidden or not. No dialog opens, and nothing has to be drawn. The user is asked first, since a file leaves the machine. If some other step opens a file dialog, Effie closes it and the plan stops and says so
  {"press": "Enter"}                      Enter, Tab, Escape, ArrowUp/Down, Backspace, Space
  {"scroll": "down" | "up" | "bottom" | T}
  {"wait": "text that should appear"} or {"wait": 1500}
  {"handoff": "Type your password and press Sign in"}   the user does this part in the tab, then you continue
  {"expect": {...}}                       a check on its own
T is a ref from the page view ("@12"), a visible label ("Email"), or role and label ("button \"Continue\"").
Any step can carry "expect": {"url": "/pay", "text": "Saved" or [...], "gone": "Newsletter", "no_errors": true}.

Working in the user's own tab: when they ask you to finish or fill in something they're doing ("finish this", "fill this in for me"), send {"tab": "user"} with the plan. It runs in the tab they're on, continuing from what they've typed; the first time, they're asked to let you (if they haven't answered yet, send the steps that haven't run again later, because repeating a payment or a send asks again). Call seen first to see the page.

Plan as far ahead as you can see: fill a whole form, submit it, and expect the next page in one call. Dates can be written any common way. Some steps aren't yours alone. Paying, sending or submitting, deleting and accepting terms wait for the user's answer (⏸): if they allow it, the plan goes on; if they haven't answered yet, send the steps that haven't run again later, because repeating a payment or a send asks again. Passwords, codes, card details, passkeys and CAPTCHAs are the user's turn (✋): the tab goes to them, and you continue after they hand it back. When the user should do something themselves, use a handoff step rather than finishing. Never try to get around either."#;

const LOOK: &str = r#"See your tab. By default you get what changed since you last looked (`~` changed, `+` added, `-` removed, "no change"); a page you haven't seen comes as an outline of the whole page: one line per control with its label, value and state and an @ref, one line per repeated item, navigation and footers as one line of name@ref. Long text and long lists are folded to their start with a count. On a long page the largest sections are folded to one line marked §4 (with how many lines and controls they hold): {"open": "§4"} shows that section; you can also act on anything in a folded section by its name without opening it. Use {"view": "outline"} for the whole page again. To read what a page says (an article, a long table, a section), use {"view": "text"}: its text in parts, {"part": 2} for the next, or {"view": "text", "find": "Climate"} to go straight to the part with those words. You rarely need look otherwise: every `act` already ends with the changes."#;

const FINISH: &str = "Close your task's tabs when the task is done.";

const WATCH: &str = r#"Watch a page for the user and tell them when something happens, even after this chat ends: a price going below or above a number, text appearing or disappearing, or any change. Effie Browser checks it itself on a schedule (every 30 minutes unless you say), notifies the user and shows a card; the tab shows an eye. Give {"url": "…"}, or none for the tab the user is on, and one of {"below": 1800}, {"above": 50}, {"appears": "In stock"}, {"gone": "Sold out"}, {"changes": true}; add {"what": "a short line the user sees"} and {"every": minutes} if you like. {"list": true} shows what's being watched and what was last seen. Use it when the user says "tell me when", "let me know if", "watch this"."#;

/// Put in the agent's context by its client: the user's browser is right here.
const INSTRUCTIONS: &str = "The user's browser, Effie Browser, is connected. When the user talks about something they're looking at (\"this\", \"here\", \"it\", \"the page\", \"this error\", \"why is this broken\", \"what's this\"), call `seen` before anything else: it shows their current tab, the text they selected, what they clicked, and the page's real console errors and failed requests. That beats guessing from source files or asking them for a screenshot. Then work from what it shows (source, logs, servers) as usual.";

const SEEN: &str = r#"See what the user is looking at in their own browser (Effie Browser), without asking them to paste or screenshot anything: the tab they're on (address and title), the text they've selected, the element they pointed at on purpose (⌥-click: that's what "this" means), the one they last clicked and the one the mouse was last over (each with a CSS path), what went wrong on that page since it loaded (console errors, a page that didn't load, requests that failed or returned 4xx/5xx), and their other open tabs. Call it first whenever the user says "this", "here", "it" or "the page" about something in the browser, or asks why a page is broken. {"text": true} adds the page's text. It only reads the user's tabs; to do things in the browser use act, which works in a tab of your own."#;

/// Your home folder (USERPROFILE on Windows).
fn home() -> String {
    #[cfg(windows)]
    return std::env::var("USERPROFILE").unwrap_or_default().replace('\\', "/");
    #[cfg(not(windows))]
    return std::env::var("HOME").unwrap_or_default();
}

/// Where Effie Browser keeps its profiles (as Alter's own `data_home`): Application Support on
/// macOS, %LOCALAPPDATA% on Windows, ~/.config on Linux.
fn app_support() -> String {
    #[cfg(target_os = "macos")]
    return format!("{}/Library/Application Support", home());
    #[cfg(windows)]
    return std::env::var("LOCALAPPDATA").unwrap_or_else(|_| format!("{}/AppData/Local", home())).replace('\\', "/");
    #[cfg(all(unix, not(target_os = "macos")))]
    return std::env::var("XDG_CONFIG_HOME").ok().filter(|d| !d.is_empty()).unwrap_or_else(|| format!("{}/.config", home()));
}

/// Claude Desktop's settings folder: beside Effie's on macOS and Linux, roaming on Windows.
fn claude_dir() -> String {
    #[cfg(windows)]
    return format!("{}/Claude", std::env::var("APPDATA").unwrap_or_else(|_| format!("{}/AppData/Roaming", home())).replace('\\', "/"));
    #[cfg(not(windows))]
    return format!("{}/Claude", app_support());
}

/// The Alter to talk to. Inside Alter's panel it's given (`ALTER_HOST_SOCK`); from any other
/// app (Claude Desktop, Codex, Cursor, a terminal) it's the Alter that's running, and if two are,
/// the one started last.
/// Effie Browser's entry in other apps' MCP settings.
const KEY: &str = "effie-browser";

fn socket_path() -> String {
    if let Ok(path) = std::env::var("ALTER_HOST_SOCK") {
        return path;
    }
    if let Ok(profile) = std::env::var("ALTER_SPIKE_PROFILE") {
        return format!("{}/{profile}/run/host.sock", app_support());
    }
    let live = ["Effie Browser", "alter-spike", "alter-spike-signed"].iter()
        .map(|p| format!("{}/{p}/run/host.sock", app_support()))
        .filter(|path| UnixStream::connect(path).is_ok())
        .max_by_key(|path| std::fs::metadata(path).and_then(|m| m.modified()).ok());
    live.unwrap_or_else(|| format!("{}/alter-spike/run/host.sock", app_support()))
}

// ---------------------------------------------------------------------------------------
// Registering Alter in your AI apps

/// Where alter-mcp lives for other apps: a fixed place Alter keeps current (each Alter copies
/// its own alter-mcp there when it starts), so their settings never point into an app bundle.
fn home_binary() -> String {
    format!("{}/Effie Browser/bin/alter-mcp{}", app_support(), std::env::consts::EXE_SUFFIX)
}

/// Copies this alter-mcp to its fixed place: written beside it and moved in, so an app that's
/// running the old one keeps it until it restarts.
fn place_binary() -> Result<String, String> {
    let to = home_binary();
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    if me.to_string_lossy() == to {
        return Ok(to);
    }
    let dir = std::path::Path::new(&to).parent().unwrap().to_owned();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(".alter-mcp.tmp");
    std::fs::copy(&me, &tmp).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &to).map_err(|e| e.to_string())?;
    Ok(to)
}

/// A JSON settings file with an `mcpServers` map (Claude Desktop, Cursor): Alter's entry set or
/// taken out, everything else left as it was, the old file kept beside it.
fn edit_json(path: &str, entry: Option<Value>) -> Result<bool, String> {
    let text = std::fs::read_to_string(path).unwrap_or_else(|_| "{}".into());
    let mut doc: Value = serde_json::from_str(&text).map_err(|e| format!("{path} isn't valid JSON ({e}); left alone"))?;
    if !doc.is_object() {
        return Err(format!("{path} isn't a settings object; left alone"));
    }
    let servers = doc.as_object_mut().unwrap().entry("mcpServers").or_insert_with(|| json!({}));
    let Some(servers) = servers.as_object_mut() else { return Err(format!("{path}: mcpServers isn't a map; left alone")) };
    // Its name in your apps; the spike's "alter" entry goes when this one goes in.
    let legacy = servers.remove("alter").is_some();
    let before = servers.get(KEY).cloned();
    match &entry {
        Some(e) => { servers.insert(KEY.into(), e.clone()); }
        None => { servers.remove(KEY); }
    }
    if servers.get(KEY).cloned() == before && !legacy {
        return Ok(false);
    }
    if std::path::Path::new(path).exists() {
        let _ = std::fs::copy(path, format!("{path}.before-alter"));
    }
    let tmp = format!("{path}.alter-tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&doc).unwrap_or_default() + "\n").map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(true)
}

/// A CLI's own `mcp` commands (Claude Code, Codex), found through your login shell's PATH.
fn cli(args: &str) -> Option<std::process::Output> {
    #[cfg(target_os = "macos")]
    return std::process::Command::new("/bin/zsh").args(["-l", "-c", args]).output().ok();
    #[cfg(all(unix, not(target_os = "macos")))]
    return std::process::Command::new(std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())).args(["-l", "-c", args]).output().ok();
    #[cfg(windows)]
    return std::process::Command::new("cmd").args(["/C", args]).output().ok();
}

fn has_cli(name: &str) -> bool {
    #[cfg(windows)]
    return cli(&format!("where {name}")).is_some_and(|o| o.status.success());
    #[cfg(not(windows))]
    return cli(&format!("command -v {name}")).is_some_and(|o| o.status.success());
}

fn shell_quote(s: &str) -> String {
    #[cfg(windows)]
    return format!("\"{}\"", s.replace('"', "\\\""));
    #[cfg(not(windows))]
    return format!("'{}'", s.replace('\'', "'\\''"));
}

/// Registers (or takes out) Alter in your AI apps; `only` limits it to one: claude-desktop,
/// cursor, claude-code or codex (what Alter's "Your AI apps" buttons pass).
fn install(remove: bool, only: Option<&str>) {
    let wanted = |app: &str| only.is_none_or(|o| o == app);
    let path = if remove { home_binary() } else {
        match place_binary() {
            Ok(p) => p,
            Err(e) => { eprintln!("Couldn't put alter-mcp in place: {e}"); std::process::exit(1) }
        }
    };
    let say = |app: &str, what: String| println!("{app:<15} {what}");
    let entry = (!remove).then(|| json!({ "command": path }));
    // Claude Desktop and Cursor read a JSON file; they pick changes up when restarted.
    let desktop = format!("{}/claude_desktop_config.json", claude_dir());
    if wanted("claude-desktop") && std::path::Path::new(&claude_dir()).exists() {
        match edit_json(&desktop, entry.clone()) {
            Ok(true) => say("Claude Desktop", if remove { "removed (restart it to apply)".into() } else { "added (restart Claude Desktop to use it)".into() }),
            Ok(false) => say("Claude Desktop", if remove { "wasn't there".into() } else { "already set".into() }),
            Err(e) => say("Claude Desktop", e),
        }
    }
    let home = home();
    if wanted("cursor") && std::path::Path::new(&format!("{home}/.cursor")).exists() {
        // Cursor's docs list the transport as required ("type": "stdio").
        let entry = entry.clone().map(|mut e| { e["type"] = json!("stdio"); e });
        match edit_json(&format!("{home}/.cursor/mcp.json"), entry) {
            Ok(true) => say("Cursor", if remove { "removed".into() } else { "added (restart Cursor to use it)".into() }),
            Ok(false) => say("Cursor", if remove { "wasn't there".into() } else { "already set".into() }),
            Err(e) => say("Cursor", e),
        }
    }
    // Claude Code and Codex: through their own commands, for every project (user scope).
    for (key, app, name, rm, add) in [
        ("claude-code", "Claude Code", "claude", "claude mcp remove -s user alter >/dev/null 2>&1; claude mcp remove -s user effie-browser", format!("claude mcp add -s user effie-browser -- {}", shell_quote(&path))),
        ("codex", "Codex", "codex", "codex mcp remove alter >/dev/null 2>&1; codex mcp remove effie-browser", format!("codex mcp add effie-browser -- {}", shell_quote(&path))),
    ] {
        if !wanted(key) || !has_cli(name) {
            continue;
        }
        let _ = cli(&format!("{rm} >/dev/null 2>&1"));
        if remove {
            say(app, "removed".into());
            continue;
        }
        match cli(&add) {
            Some(o) if o.status.success() => say(app, "added (new sessions have it)".into()),
            Some(o) => say(app, format!("failed: {}", String::from_utf8_lossy(&o.stderr).trim())),
            None => say(app, "failed to run".into()),
        }
    }
    if !remove && only.is_none() {
        println!("\nAny other MCP app: add a stdio server named \"effie-browser\" that runs\n  {path}");
    }
}

/// A client's name as the user knows the app: "claude-code" is Claude Code.
fn app_name(client: &str) -> String {
    let c = client.to_lowercase();
    if c.contains("claude-code") || c == "claude code" { "Claude Code".into() }
    else if c.contains("claude") { "Claude".into() }
    else if c.contains("codex") { "Codex".into() }
    else if c.contains("cursor") { "Cursor".into() }
    else { client.to_owned() }
}

/// The agent's own name from MCP `initialize` (e.g. "claude-code"), shown in your dialogs.
static CLIENT: std::sync::OnceLock<String> = std::sync::OnceLock::new();

struct Engine {
    writer: UnixStream,
    reader: BufReader<UnixStream>,
    next: u64,
    opened: bool,
}

/// The request never reached the browser, so sending it on a fresh connection can't do anything twice.
const NOT_SENT: &str = "The connection to Effie Browser had dropped";
/// It reached the browser and the connection dropped before the answer: it may have happened.
const NO_REPLY: &str = "The connection to Effie Browser dropped before it answered. Some or all of this may already have happened, and Effie doesn't send anything twice by itself. Look at the page before doing any of it again.";

/// Whether a failed call can go again on a fresh connection. A plan or a watch can't once it's
/// been delivered: it may have run, and a post must not go out twice.
fn safe_to_retry(tool: &str, error: &str) -> bool {
    error.starts_with(NOT_SENT) || (error == NO_REPLY && matches!(tool, "look" | "seen"))
}

impl Engine {
    fn connect() -> Result<Self, String> {
        let path = socket_path();
        // Said so the agent can pass it on as it is.
        let stream = UnixStream::connect(&path).map_err(|_| "Effie Browser isn't open. Ask the user to open Effie Browser, then try again.".to_owned())?;
        let mut writer = stream.try_clone().map_err(|e| e.to_string())?;
        writer.write_all(b"{\"op\":\"engine\"}\n").map_err(|e| e.to_string())?;
        Ok(Self { writer, reader: BufReader::new(stream), next: 1, opened: false })
    }

    fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next;
        self.next += 1;
        let line = json!({ "id": id, "method": method, "params": params }).to_string() + "\n";
        self.writer.write_all(line.as_bytes()).map_err(|e| format!("{NOT_SENT}: {e}"))?;
        let mut reply = String::new();
        match self.reader.read_line(&mut reply) {
            Ok(n) if n > 0 => {}
            _ => return Err(NO_REPLY.to_owned()),
        }
        // Cut off partway is no answer either: it may have happened.
        let reply: Value = serde_json::from_str(&reply).map_err(|_| NO_REPLY.to_owned())?;
        let result = reply["result"].clone();
        match result.get("error_code").or(result.get("error")) {
            Some(_) if result.get("text").is_none() && result.get("content").is_none() => {
                Err(result["error"].as_str().unwrap_or("browser error").to_owned())
            }
            _ => Ok(result),
        }
    }

    /// The task space opens on first use, so an agent that never browses costs nothing. One that
    /// starts in the user's tab ("finish this") gets no blank tab of its own.
    fn ensure_open(&mut self, blank: bool) -> Result<(), String> {
        if !self.opened {
            let name = std::env::var("ALTER_TASK").unwrap_or_else(|_| format!("agent-{}", std::process::id()));
            let principal = std::env::var("ALTER_PRINCIPAL").ok().or_else(|| CLIENT.get().cloned()).unwrap_or_else(|| "An agent".into());
            self.call("open", json!({ "name": name, "principal": principal, "blank": blank }))?;
            self.opened = true;
        }
        Ok(())
    }

    fn tool(&mut self, name: &str, args: &Value) -> Result<String, String> {
        // Watching needs no task space either: Alter does the looking.
        if name == "watch" {
            // Who's asking, for the card the user sees ("Watching for Claude Code").
            let mut args = args.clone();
            args["principal"] = json!(std::env::var("ALTER_PRINCIPAL").ok().or_else(|| CLIENT.get().cloned()).unwrap_or_else(|| "An agent".into()));
            let r = self.call("watch", args)?;
            return Ok(r["content"].as_str().unwrap_or("").to_owned());
        }
        // Reading the user's own tabs needs no task space of the agent's.
        if name == "seen" {
            let r = self.call("seen", json!({ "text": args["text"] == true }))?;
            return Ok(r["content"].as_str().unwrap_or("").to_owned());
        }
        self.ensure_open(!(name == "act" && args["tab"] == "user"))?;
        match name {
            "act" => {
                let steps = match &args["steps"] {
                    Value::Array(a) => a.clone(),
                    // Some clients send the plan as a JSON string.
                    Value::String(s) => serde_json::from_str(s).map_err(|e| format!("steps aren't valid JSON: {e}"))?,
                    _ => return Err("act needs `steps`: a list of steps".into()),
                };
                let r = self.call("act", json!({ "steps": steps, "tab": args["tab"] }))?;
                Ok(r["text"].as_str().unwrap_or("").to_owned())
            }
            "look" => {
                let r = self.call("look", json!({ "view": args["view"], "part": args["part"], "find": args["find"], "open": args["open"] }))?;
                Ok(r["content"].as_str().unwrap_or("").to_owned())
            }
            "finish" => {
                self.call("finish", json!({}))?;
                self.opened = false;
                Ok("closed".into())
            }
            other => Err(format!("unknown tool {other}")),
        }
    }
}

fn tools() -> Value {
    json!([
        { "name": "act", "description": ACT, "inputSchema": {
            "type": "object",
            "properties": {
                "steps": { "type": "array", "items": { "type": "object" }, "description": "The plan, in order" },
                "tab": { "type": "string", "enum": ["user"], "description": "\"user\": run it in the tab the user is on (they're asked once)" } },
            "required": ["steps"] } },
        { "name": "look", "description": LOOK, "inputSchema": {
            "type": "object",
            "properties": {
                "view": { "type": "string", "enum": ["changes", "outline", "text"] },
                "part": { "type": "integer", "description": "with view \"text\": which part of a long page (1, 2, …)" },
                "find": { "type": "string", "description": "with view \"text\": go straight to the part with these words" },
                "open": { "type": "string", "description": "a folded section of the last outline, e.g. \"§4\"" } } } },
        { "name": "finish", "description": FINISH, "inputSchema": { "type": "object", "properties": {} } },
        { "name": "watch", "description": WATCH, "inputSchema": {
            "type": "object",
            "properties": {
                "url": { "type": "string" }, "what": { "type": "string" },
                "below": { "type": "number" }, "above": { "type": "number" },
                "appears": { "type": "string" }, "gone": { "type": "string" }, "changes": { "type": "boolean" },
                "every": { "type": "integer", "description": "minutes between checks (5 or more)" },
                "list": { "type": "boolean" } } } },
        { "name": "seen", "description": SEEN, "inputSchema": {
            "type": "object",
            "properties": { "text": { "type": "boolean", "description": "Also the page's text" } } } },
    ])
}

fn main() {
    match std::env::args().nth(1).as_deref() {
        Some("install") => return install(false, std::env::args().nth(2).as_deref()),
        Some("uninstall") => return install(true, std::env::args().nth(2).as_deref()),
        _ => {}
    }
    let mut engine: Option<Engine> = None;
    let stdout = std::io::stdout();
    let send = |v: Value| {
        let mut out = stdout.lock();
        let _ = writeln!(out, "{v}");
        let _ = out.flush();
    };
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let id = msg["id"].clone();
        match msg["method"].as_str().unwrap_or("") {
            "initialize" => {
                CLIENT.get_or_init(|| app_name(msg["params"]["clientInfo"]["name"].as_str().unwrap_or("An agent")));
                send(json!({ "jsonrpc": "2.0", "id": id, "result": {
                    "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "effie-browser", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": INSTRUCTIONS,
                } }))
            }
            "tools/list" => send(json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools() } })),
            "tools/call" => {
                let name = msg["params"]["name"].as_str().unwrap_or("").to_owned();
                let args = msg["params"]["arguments"].clone();
                let result = (|| {
                    if engine.is_none() {
                        engine = Some(Engine::connect()?);
                    }
                    let r = engine.as_mut().unwrap().tool(&name, &args);
                    // A dropped connection (the browser restarted) means a fresh one next time, and
                    // goes again now only if that can't do anything twice.
                    if let Err(e) = &r {
                        if e.starts_with(NOT_SENT) || e == NO_REPLY {
                            let again = safe_to_retry(&name, e);
                            engine = None;
                            if again {
                                engine = Some(Engine::connect()?);
                                return engine.as_mut().unwrap().tool(&name, &args);
                            }
                        }
                    }
                    r
                })();
                let (text, is_error) = match result {
                    Ok(t) => (t, false),
                    Err(e) => (e, true),
                };
                send(json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": text }], "isError": is_error } }));
            }
            _ if !id.is_null() => send(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": "not supported" } })),
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_what_cant_happen_twice_goes_again() {
        let not_sent = format!("{NOT_SENT}: Broken pipe");
        assert!(safe_to_retry("act", &not_sent));
        assert!(safe_to_retry("look", NO_REPLY));
        assert!(safe_to_retry("seen", NO_REPLY));
        assert!(!safe_to_retry("act", NO_REPLY));
        assert!(!safe_to_retry("finish", NO_REPLY));
        assert!(!safe_to_retry("watch", NO_REPLY));
        assert!(!safe_to_retry("act", "steps aren't valid JSON"));
    }
}
