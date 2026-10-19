// No offline cache: always load the latest app and group membership.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    /* Generic fallback still shows a visible notification. */
  }
  const safeId = (value) =>
    typeof value === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(value)
      ? value
      : "";
  const eid = safeId(payload.event),
    group = safeId(payload.group);
  event.waitUntil(
    self.registration.showNotification(
      String(payload.title || "The Grid").slice(0, 100),
      {
        body: String(
          payload.body || "There’s a new event in your group.",
        ).slice(0, 240),
        icon: new URL("apple-touch-icon.png", self.registration.scope).href,
        badge: new URL("icon.svg", self.registration.scope).href,
        tag: eid ? "grid-" + group + "-" + eid : "grid-new-event",
        data: { event: eid, group },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const scope = new URL(self.registration.scope);
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => {
        const url = new URL(client.url);
        return (
          url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
        );
      });
      if (existing) {
        await existing.focus();
        existing.postMessage({
          type: "grid-open-event",
          event: data.event,
          group: data.group,
        });
      } else {
        if (data.event) scope.searchParams.set("event", data.event);
        await self.clients.openWindow(scope.href);
      }
    })(),
  );
});
