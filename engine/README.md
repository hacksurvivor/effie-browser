# Alter's engine

Alter runs on its own build of Chromium: upstream Chromium and CEF at the exact commit in
`cef.lock`, plus the patches in `patches/`. The Rust shell and host stay as they are; cef-rs links
against our build instead of the stock CEF download (`CEF_PATH=~/.local/share/cef-alter`).

## Why our own Chromium, not a Brave fork (26 Oct 2026)

Brave isn't embeddable: it is a whole Chrome-UI browser with thousands of patches of its own. Alter
is built on CEF (our interface, the agent host, live views over CALayerHost contexts), and CEF
patches Chromium heavily too. Basing Alter on Brave would mean either dropping CEF and rewriting the
shell in Chromium's C++ UI, or merging two large patch sets on every Chrome release.

What makes Brave better for privacy is two parts we can take on their own:

- **adblock-rust** (MPL-2.0, Rust): a library, no Chromium patch needed. It goes into the shell,
  blocking requests in our request handler, with cosmetic filters injected per page.
- **Farbling**, Brave's fingerprinting defences, in `brave-core` (MPL-2.0): `browser/farbling/` has
  one test suite per surface, and `components/brave_shields/core/common/farbling_prng.h` the seeded
  generator. We port these surfaces as a small patch set here. Ported files keep their MPL-2.0
  notice; MPL is file-level, so nothing else in Alter changes licence.

Useful pieces from ungoogled-chromium (BSD-3: no Google background requests) come in the same way.
Cromite's patches are GPL-3 and are not used.

## Building

Needs a drive with 200 GB free (CEF's figure; a Linux checkout without history is about 30 GB, the
build adds tens more), 16 GB of memory or more, and hours for a checkout and again for a build. A
Mac engine is built on a Mac (Xcode with the macOS SDK); Chromium doesn't cross-build to macOS. The
Linux engine is built on Linux, against Chromium's Debian sysroot as stock CEF is, so it runs on
older distributions too. See the comment at the top of `build.sh`.

Patches never touch CEF's public API (`include/`), so cef-rs's bindings and API hash stay valid.
`build.sh install` refuses a build whose CEF version differs from `cef.lock`.

Updating to a new Chrome: bump `cef.lock` and cef-rs together, fetch, re-apply the patches (fix any
that no longer apply), build, run the bench and the fingerprint checks.

## Privacy plan (approved 31 Oct 2026)

Our own Chromium lets privacy go into the engine instead of the shell's flags: pages can't get
around it, and agents' tabs get it too. In this order:

1. **Network log at start.** Every request Effie makes in its first minutes with no tab open, and
   with one blank tab, recorded on each platform. It is the baseline the next steps are checked
   against.
2. **Quiet engine.** Google's background services removed at build time where a build flag or
   ungoogled-chromium patch does it (field trials and variations, GCM, suggestions, domain
   reliability, optimization guide, Safe Browsing pings), and Chrome's ad APIs built without
   (Topics, Protected Audience, Attribution Reporting, Shared Storage, Private Aggregation), as
   Brave does. Check: the network log at start shows no request to Google.
3. **Tracker blocking.** adblock-rust with EasyList and EasyPrivacy, in Effie's tab request
   handler (`spikes/shell/src/shared/trackers.rs`) rather than the network service: that works on
   stock CEF too, so every system gets it now, agents' tabs included. Pages you open are never
   blocked. Checked on Linux, 1 Nov 2026: Google Analytics, Tag Manager, DoubleClick and the
   Facebook pixel blocked, the page's own files loaded, the Guardian's front page whole. The ad
   boxes a site's own rules name (`site##selector`) are hidden from the start (443 rules on CNN).
   Not yet: generic hiding rules (they need the page's classes and ids), requests a site's service
   worker makes (CEF's request-context handler isn't called for them, checked 1 Nov 2026: that
   needs the network service, in the engine), off per site (needs a preview first).
4. **The rest of fingerprinting** (table below), WebRTC that doesn't reveal local addresses,
   trimmed client hints, and the level per site carried over Chromium's IPC instead of the
   command line.
5. **Before anything leaves the machine**, in Effie (`spikes/shell/src/shared/privacy.rs`), on
   every system: HTTPS-First in Chrome's balanced mode (written into each profile's Preferences
   before Chromium starts), `Sec-GPC: 1` on every request, and click identifiers (fbclid, gclid,
   msclkid and the like) taken off links you open; utm_* campaign tags stay, as in Brave and
   Firefox. Encrypted DNS stays on Chrome's "automatic" default (your resolver over DNS over
   HTTPS when it offers it, no provider chosen for you). Checked on Linux, 1 Nov 2026.
6. **Agents and local data** (need approved previews first): sensitive fields blanked in the page
   process before a snapshot reaches the host or a model, an optional separate cookie jar for
   agents, private windows, forget-this-site, history that deletes itself. On Linux without a
   keyring, saved passwords and cookies get Effie's own key instead of Chromium's fixed one.

Also in Effie itself: site icons come from the site, not from a third-party icon service.

Cost: every patch is re-applied on each Chrome update, so patches stay small, one surface each,
and removals at build time are preferred over code changes.

## Patch plan

Order matters; each patch is one surface with its own check.

| Patch | What | Brave source to port | Check | Status |
|---|---|---|---|---|
| 0001 seed | Per-site, per-session token (HMAC of the launch key and the top-level site); key from Effie on each renderer's command line | `farbling_prng.h`, session cache | same site same values within a session; different across sites and launches | checked on Linux and the Mac, 1 Nov 2026 (and per site off from the site card) |
| 0002 canvas | Noise on canvas reads: toDataURL, toBlob/convertToBlob, getImageData, always on a private copy | canvas, offscreencanvas farbling | canvas hash differs per site, image looks the same | checked on Linux and the Mac, 1 Nov 2026 |
| 0003 webgl | WEBGL_debug_renderer_info reports one common GPU per system (an Apple M1 on Macs, Intel UHD 620 elsewhere, in ANGLE's format); per-site noise on RGBA8 readPixels like canvas. Not yet: the extension list, WebGPU adapter info, readPixels into a pixel-pack buffer | webgl, webgpu farbling | GPU name the same for everyone on a system; readPixels hash differs per site | checked on Linux (SwiftShader) and the Mac (an M4 reads as M1), 1 Nov 2026 |
| 0004 audio | AudioBuffer and analyser reads scaled by a per-site factor (0.999 to 1), inaudible noise in Strict | webaudio farbling | audio fingerprint differs per site | checked on Linux and the Mac, 1 Nov 2026 |
| 0005 navigator | hardwareConcurrency reports 2, 4 or 8; deviceMemory (and its client hint) capped at 8 GB as before Chromium raised it to 32. Languages: Effie turns on Chromium's ReduceAcceptLanguage (first language only, navigator and header) | navigator_* farbling | values in common buckets | checked on Linux, 1 Nov 2026: 20 cores reported as 8, 32 GB as 8; on the Mac 10 cores as 8 |
| 0006 screen | screen.width/height and the available area: the smallest common size the window fits in (from the window, never the display), available area the whole screen; window.screenX/Y 0; mouse and pointer screenX/Y as if the window sat at the corner; screen.isExtended false. devicePixelRatio stays real (layout needs it) | screen farbling | sizes from the common set; window position not readable | checked on Linux, 1 Nov 2026: a 1600x1000 display read as 1440x900, the tab at (366, 106) read as (0, 0); on the Mac 1512x982 as 1366x768 |
| 0007 fonts | Installed fonts a page asks for by name (CSS, canvas, document.fonts.check) are only found if the system ships them (Brave's lists for macOS, Windows, Ubuntu 20.04 to 24.04 and Fedora, plus the default language's); web fonts and characters a font lacks work as before; an unknown Linux allows all. Not yet: local() in @font-face | font allowlist (brave_font_whitelist.cc, MPL-2.0, ported as alter_font_allowlist.cc) | installed-font probes find nothing extra | checked on Linux, 1 Nov 2026: Lato (installed) hidden, DejaVu and Liberation (Ubuntu's) visible; Arial, an alias there, falls back to the default font |
| 0008 devices | speechSynthesis.getVoices: your language's voices and the default, not every installed voice; navigator.keyboard.getLayoutMap refused (NotAllowedError). Cameras and microphones: Chromium already shows at most one of each, unnamed, before you allow them | the matching farbling tests | no device names or installed extras without permission | keyboard checked on Linux, 1 Nov 2026 (stock shares a 48-key map, the engine refuses); voices checked on the Mac, 1 Nov 2026 (180 installed, 41 English shown) |
| 0009 passkeys (mac) | Touch ID platform authenticator: Chromium's branding gets our team and bundle ID, so its keychain group is ours | (Chromium's mac WebAuthn) | passkey sign-in in the signed build | works: Touch ID passkey on webauthn.io with the signed build, 1 Nov 2026 (docs/apple-passkey-entitlement.md) |
| 0010 quiet | Only 14 components registered (security, Widevine, hyphenation, origin trials, Screen AI); Effie also turns off Chrome's ad APIs, AI Mode and the search preconnect by switch, so stock-CEF builds get those too | ungoogled-chromium, Brave | network log at start shows no request to Google beyond the kept ones (`check/netlog-baseline.md`) | checked on Linux, 1 Nov 2026 |
| 0011 clipboard | Pastes of something another app just copied are no longer dropped (crbug.com/568453825) | Chromium fc5529f, in 157; applies as is to 156.0.8078.48 | agent suite's HTML paste passes with the host's `refresh_pasteboard` removed | written; Mac-only code |

`check/farbling.html` reads the values 0002 and 0004 change; open it from two sites (127.0.0.1 and
localhost) and across two launches. On the Linux engine (1 Nov 2026) canvas (toDataURL,
getImageData, toBlob) and audio values differed between the two sites and between two launches,
stayed the same when read again on a page, and the drawing looked unchanged; stock CEF read the
same values everywhere. Effie's 37 tests pass on the engine.

Effie on the Linux engine: `engine/build.sh install`, then build with
`CEF_PATH=~/.local/share/cef-alter` (a separate `CARGO_TARGET_DIR` keeps a stock-CEF build beside
it). Linux packages are built on it since 0.1.17 (the self-hosted release job, which is why they have H.264 and AAC). Windows packages still use stock CEF, which has neither: no Windows machine.

Levels in the interface: Standard (default: uniform values plus light noise, nothing should break),
Strict (more noise, letterboxing), and off per site. Until the interface has them,
`ALTER_FARBLING=off|standard|strict` sets the level. Agents' tabs get the same protection as yours.
