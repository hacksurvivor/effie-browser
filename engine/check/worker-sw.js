self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("message", async (e) => {
  let result;
  try { const r = await fetch(e.data, { mode: "no-cors" }); result = "loaded (" + r.type + ")"; } catch (err) { result = "blocked or failed"; }
  e.source.postMessage(result);
});
