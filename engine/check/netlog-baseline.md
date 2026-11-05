# Network at start: baseline (31 Oct 2026)

`engine/check/netlog.sh 300` on Linux (Ubuntu 24.04), Effie from this branch on **stock CEF**
156.0.14, a fresh profile, the interface open on about:blank, nothing touched for five minutes.
This is what privacy plan step 2 (the quiet engine) has to bring down.

## What went out

| Requests | To | What it is | Plan |
|---|---|---|---|
| 46 | update.googleapis.com/service/update2/json | Chromium's component updater: checks every registered component (sends their versions, OS, architecture) | keep only the components below, through a patch to the registration list |
| ~20 | edgedl.me.gvt1.com, redirector.gvt1.com | the components themselves, downloaded | as above |
| 2 | safebrowsing.googleapis.com/v4/threatListUpdates:fetch | Safe Browsing list updates (hash-prefix lists; no addresses you visit are sent) | keep: phishing and malware protection; real-time URL checks stay off |
| 2 | redirector.gvt1.com/.../dict/en-us-10-2.bdic | the spelling dictionary for your language | keep for now; later from our own server |
| 2 | clients2.google.com/time/1/current | network time, used to judge certificate dates | keep for now (security); later from our own server |
| 2 | www.google.com/async/folae | not identified yet | find what asks for it, then remove |

### Components downloaded

Named from their installers in the Chromium tree; worth keeping in bold.

- **CRLSet** (`hfnkpimlhhgieaddgfemjhofmfblmnib`): revoked certificates. Security.
- **Widevine** (`oimompecagnajdejgnnjijobebaeigek`, linux64): DRM for Netflix and the like.
- **SSL error assistant** (`7_all_sslErrorAssistant`): explains captive portals and clock errors.
- Optimization guide on-device model (`ceofaddefefcbblgcgnibnonglccbfja`): Chrome's built-in AI
  model; Effie already turns its large download off (`OnDeviceModelBackgroundDownload`), the
  updater still checks it.
- Actor safety lists (`ninodabcejpeglfjbkhdplaoglpcbffj`): lists for Chrome's own browsing agent.
- WASM text-to-speech engine (`bjbcblmdcnggnibecjikpoljcgkbgphl`).
- About a dozen more listed in `components/metrics/component_metrics_provider.cc` (origin
  trials, first-party sets, autofill states, trust tokens, and others); each to be checked before
  it's dropped.

Not seen in five minutes: variations (field-trial) seed, GCM push, metrics/UMA uploads, Google
suggestions. Check again after a page is opened and something is typed in the address bar.

## Effie's own calls (from the code, not this log)

- Site icons: from the site itself only (the DuckDuckGo icon-service fallback is removed).
- ⌘K news: off until you turn it on (Settings → Address bar → News on your topics); then the topics
  of your top two Continue cards go to news.google.com (`shell.rs`, `news()`).
- Weather (open-meteo, place rounded to about 11 km), currency rates (open.er-api.com, no user
  data), extension installs and updates (Google's Web Store servers), update feed (once a day).

## After the quiet engine (1 Nov 2026)

Same run (`engine/check/netlog.sh 300`) on our Linux engine with patch 0010 and Effie's switches
(Chrome's ad APIs, AI Mode and the search-engine preconnect off):

| Requests | To | |
|---|---|---|
| 18 (was 46) | update.googleapis.com | only the 14 components 0010 keeps are checked |
| 8 (was ~20) | edgedl.me.gvt1.com | CRLSet, PKI metadata, SSL error assistant, file type policies, safety tips, crowd deny, hyphenation, Widevine |
| 2 | safebrowsing.googleapis.com | list updates, kept |
| 3 | redirector.gvt1.com and a mirror | spelling dictionary, kept for now |
| 2 | clients2.google.com/time | network time, kept for now |
| 0 (was 2, plus a preconnect) | www.google.com | AI Mode check and the connection to Chromium's own default search engine are gone |

Pages no longer see Topics, Protected Audience (interest groups, auctions), Shared Storage or
Attribution Reporting (`'browsingTopics' in document` and the like are all false; the build
before had four of them).
