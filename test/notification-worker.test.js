import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

test("worker rejects unauthorized dispatch and handles success, expired and transient push failures", async () => {
  const secret = "a".repeat(64),
    finished = [],
    sent = [];
  let handler,
    claims = 0;
  const jobs = [0, 404, 429, 400].map((status, i) => ({
    id: "job" + i,
    attempt: 1,
    subscription: { status },
    title: "Friends",
    body: "Alex added Concert",
    event: "event" + i,
    group: "group",
  }));
  const originalFetch = globalThis.fetch;
  globalThis.__pushTest = {
    setVapidDetails() {},
    async sendNotification(subscription, payload) {
      sent.push(JSON.parse(payload));
      if (subscription.status) throw { statusCode: subscription.status };
    },
  };
  globalThis.Deno = {
    env: {
      get: (name) =>
        ({
          DOIN_DISPATCH_SECRET: secret,
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
          DOIN_VAPID_PUBLIC_KEY: "test-public",
          DOIN_VAPID_PRIVATE_KEY: "test-private",
        })[name],
    },
    serve: (fn) => {
      handler = fn;
    },
  };
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("doin_push_claim")) {
      claims++;
      return Response.json(jobs);
    }
    finished.push(JSON.parse(options.body));
    return Response.json(null);
  };
  try {
    let source = readFileSync(
      new URL("../supabase/functions/notify-events/index.ts", import.meta.url),
      "utf8",
    );
    source = source.replace(
      /import webpush from ['"]npm:web-push@3\.6\.7['"];\s*/,
      "const webpush=globalThis.__pushTest;",
    );
    await import(
      "data:text/javascript;base64," +
        Buffer.from(stripTypeScriptTypes(source)).toString("base64")
    );
    assert.equal(
      (await handler(new Request("https://example.com", { method: "POST" })))
        .status,
      401,
    );
    assert.equal(claims, 0);
    assert.equal(
      (
        await handler(
          new Request("https://example.com", {
            headers: { "x-grid-dispatch": secret },
          }),
        )
      ).status,
      405,
    );
    const response = await handler(
      new Request("https://example.com", {
        method: "POST",
        headers: { "x-grid-dispatch": secret },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).processed, 4);
    assert.equal(sent.length, 4);
    assert.equal(sent[0].event, "event0");
    assert.deepEqual(finished.map((x) => x.p_result).sort(), [
      "expired",
      "permanent",
      "retry",
      "sent",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
    delete globalThis.__pushTest;
  }
});

test("service worker displays event alerts and opens only the app scope", async () => {
  const handlers = {},
    shown = [],
    opened = [],
    messages = [];
  let pending;
  const scope = "https://example.github.io/so-wat-we-doin/";
  const self = {
    addEventListener: (type, fn) => (handlers[type] = fn),
    registration: {
      scope,
      showNotification: async (title, options) =>
        shown.push({ title, options }),
    },
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
    skipWaiting: async () => {},
  };
  vm.runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, URL },
  );
  handlers.push({
    data: {
      json: () => ({
        title: "Friends",
        body: "Alex added Concert",
        event: "event-1",
        group: "group-1",
      }),
    },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(shown[0].title, "Friends");
  assert.equal(shown[0].options.body, "Alex added Concert");
  assert.equal(shown[0].options.icon, scope + "apple-touch-icon.png");
  assert.equal(shown[0].options.tag, "grid-group-1-event-1");
  handlers.notificationclick({
    notification: { close() {}, data: shown[0].options.data },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(opened[0], scope + "?event=event-1");
  self.clients.matchAll = async () => [
    {
      url: scope,
      focus: async () => {},
      postMessage: (value) => messages.push(value),
    },
  ];
  handlers.notificationclick({
    notification: { close() {}, data: shown[0].options.data },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(messages[0].type, "grid-open-event");
  assert.equal(messages[0].event, "event-1");
  assert.equal(opened.length, 1);
  handlers.push({
    data: {
      json: () => {
        throw Error("bad payload");
      },
    },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.equal(shown[1].title, "The Grid");
});

test('iPhone requires Home Screen installation and respects blocked/unsupported permissions',()=>{
 const source=readFileSync(new URL('../public/notifications.js',import.meta.url),'utf8').replaceAll('export ','').replaceAll('import.meta.url',"'https://example.com/app/notifications.js'");
 const context={navigator:{userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1,serviceWorker:{}},matchMedia:()=>({matches:false}),isSecureContext:true,window:{PushManager:function(){},Notification:{}},Notification:{permission:'default'}};
 vm.createContext(context);vm.runInContext(source,context);
 assert.equal(context.notificationSupport(),'install');context.navigator.standalone=true;assert.equal(context.notificationSupport(),'supported');context.Notification.permission='denied';assert.equal(context.notificationSupport(),'blocked');context.Notification.permission='default';delete context.window.PushManager;assert.equal(context.notificationSupport(),'unsupported');
});
