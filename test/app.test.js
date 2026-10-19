import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "doin-test-"));
let proc;
const base = "http://127.0.0.1:3107";
async function request(path, data, token) {
  const r = await fetch(base + "/api/" + path, {
    method: data ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
before(async () => {
  proc = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: "3107", DATA_DIR: dir },
    stdio: "pipe",
  });
  await new Promise((resolve, reject) => {
    proc.stdout.once("data", resolve);
    proc.once("error", reject);
    proc.once("exit", () => reject(Error("Server exited before startup")));
  });
});
after(() => {
  proc.kill();
  rmSync(dir, { recursive: true, force: true });
});
test("shared group lifecycle, votes, attendance, carpools, and isolation", async () => {
  const a = await request("groups", { group: "Weekend crew", name: "Alex" });
  assert.equal(a.status, 201);
  const b = await request("join", { invite: a.body.invite, name: "Sam" });
  assert.equal(b.status, 201);
  const stranger = await request("groups", {
    group: "Other crew",
    name: "Stranger",
  });
  const event = {
    title: "Live music",
    place: "The park",
    category: "Music",
    url: "https://example.com/concert",
    starts: "2026-11-01T18:00:00Z",
    ends: "2026-11-01T20:00:00Z",
  };
  assert.equal(
    (await request("events", { ...event, ends: event.starts }, a.body.token))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        "events",
        { ...event, url: "javascript:alert(1)" },
        a.body.token,
      )
    ).status,
    400,
  );
  const e = await request("events", event, a.body.token);
  assert.equal(e.status, 201);
  const response = { event: e.body.id, vote: 1, status: "going", seats: 3 };
  assert.equal(
    (await request("respond", response, stranger.body.token)).status,
    404,
  );
  assert.equal((await request("respond", response, a.body.token)).status, 200);
  assert.equal(
    (await request("respond", { ...response, seats: 0 }, b.body.token)).status,
    200,
  );
  const s = await request("state", null, b.body.token);
  assert.equal(s.body.events.length, 1);
  assert.equal(s.body.members.length, 2);
  assert.equal(s.body.events[0].responses.length, 2);
  assert.equal(
    s.body.events[0].responses.reduce((n, r) => n + r.vote, 0),
    2,
  );
  assert.equal(s.body.events[0].responses.find((r) => r.mine).name, "Sam");
  assert.equal(s.body.events[0].responses[0].member, undefined);
  assert.equal(s.body.members[0].token, undefined);
  await request(
    "respond",
    { ...response, vote: 0, status: "out" },
    a.body.token,
  );
  const updated = (await request("state", null, b.body.token)).body.events[0];
  assert.equal(updated.responses.find((r) => r.name === "Alex").seats, 0);
  assert.equal(updated.responses.length, 2);
  assert.equal(
    (await request("state", null, stranger.body.token)).body.events.length,
    0,
  );
  assert.equal((await request("state")).status, 401);
  assert.equal(
    (await request("respond", { ...response, seats: -1 }, a.body.token)).status,
    400,
  );
  assert.equal(
    (await request("join", { invite: "missing", name: "No" })).status,
    404,
  );
  const beforeRename = (await request("state", null, b.body.token)).body;
  assert.equal((await request("group", { name: "No token" })).status, 401);
  assert.equal(
    (await request("group", { name: "  " }, b.body.token)).status,
    400,
  );
  assert.equal(
    (await request("group", { name: "x".repeat(121) }, b.body.token)).status,
    400,
  );
  const renamed = await request(
    "group",
    { name: "  New crew  ", id: stranger.body.invite },
    b.body.token,
  );
  assert.deepEqual(renamed.body, { id: a.body.invite, name: "New crew" });
  const afterRename = (await request("state", null, b.body.token)).body;
  assert.deepEqual(afterRename.events, beforeRename.events);
  assert.deepEqual(afterRename.members, beforeRename.members);
  assert.equal(
    (await request("state", null, a.body.token)).body.group.name,
    "New crew",
  );
  assert.equal(
    (await request("state", null, stranger.body.token)).body.group.name,
    "Other crew",
  );
  assert.equal(
    (await request("join", { invite: a.body.invite, name: "Another friend" }))
      .status,
    201,
  );
});
test("serves app and home screen manifest", async () => {
  const r = await fetch(base);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /apple-mobile-web-app-capable/);
  const manifest = await (await fetch(base + "/manifest.json")).json();
  assert.equal(manifest.display, "standalone");
  assert.equal((await fetch(base + "/missing")).status, 404);
});

test("local deletion requires creator identity and preserves other events", async () => {
  const a = await request("groups", { group: "Delete test", name: "Alex" }),
    b = await request("join", { invite: a.body.invite, name: "Alex B" }),
    c = await request("groups", { group: "Other delete test", name: "Alex" });
  const event = {
    title: "Delete me",
    place: "Park",
    category: "Music",
    starts: "2026-11-01T18:00:00Z",
    ends: "2026-11-01T20:00:00Z",
  };
  const own = await request("events", event, a.body.token),
    other = await request(
      "events",
      { ...event, title: "Keep me" },
      b.body.token,
    );
  await request(
    "respond",
    { event: own.body.id, vote: 1, status: "going", seats: 2 },
    b.body.token,
  );
  const ownState = (await request("state", null, a.body.token)).body;
  assert.equal(
    ownState.events.find((e) => e.id === own.body.id).canDelete,
    true,
  );
  assert.equal(
    ownState.events.find((e) => e.id === own.body.id).added_by,
    undefined,
  );
  assert.equal(
    (await request("state", null, b.body.token)).body.events.find(
      (e) => e.id === own.body.id,
    ).canDelete,
    false,
  );
  assert.equal(
    (await request("deleteEvent", { event: own.body.id })).status,
    401,
  );
  assert.equal(
    (await request("deleteEvent", { event: own.body.id }, b.body.token)).status,
    403,
  );
  assert.equal(
    (await request("deleteEvent", { event: own.body.id }, c.body.token)).status,
    403,
  );
  assert.equal(
    (await request("deleteEvent", { event: own.body.id }, a.body.token)).status,
    200,
  );
  const after = (await request("state", null, b.body.token)).body;
  assert.equal(
    after.events.some((e) => e.id === own.body.id),
    false,
  );
  assert.equal(
    after.events.some((e) => e.id === other.body.id),
    true,
  );
  assert.equal(
    (await request("deleteEvent", { event: other.body.id }, a.body.token))
      .status,
    403,
  );
});

test('local device linking shares identity and owner removal revokes all linked devices',async()=>{
 const a=(await request('groups',{group:'Linked crew',name:'Owner'})).body;
 const b=(await request('join',{invite:a.invite,name:'Friend'})).body;
 const initial=(await request('state',null,a.token)).body;
 assert.equal(initial.group.isOwner,true);
 assert.equal((await request('join',{invite:a.invite,name:'Owner'},a.token)).body.token,a.token);
 assert.equal((await request('join',{invite:a.invite,name:'owner'})).status,400);
 const link=(await request('createDeviceLink',{},a.token)).body;assert.match(link.code,/^\d{6}$/);
 const linked=(await request('claimDeviceLink',{code:link.code})).body;
 assert.equal((await request('state',null,linked.token)).body.me.id,initial.me.id);
 assert.match((await request('claimDeviceLink',{code:link.code})).body.error,/already used/);
 const friend=(await request('state',null,b.token)).body;
 assert.equal((await request('removeMember',{member:initial.me.id},b.token)).status,403);
 assert.equal((await request('removeMember',{member:initial.me.id},a.token)).status,400);
 assert.equal((await request('removeMember',{member:friend.me.id},linked.token)).status,200);
 assert.equal((await request('state',null,b.token)).status,401);
 assert.equal((await request('state',null,a.token)).body.members.length,1);
});

test('local shared food list supports add, group isolation, validation, and contributor removal',async()=>{
 const a=(await request('groups',{group:'Food crew',name:'Owner'})).body,b=(await request('join',{invite:a.invite,name:'Friend'})).body,c=(await request('groups',{group:'Other food crew',name:'Outside'})).body;
 assert.equal((await request('addRestaurant',{name:'Cafe',url:'javascript:alert(1)'},a.token)).status,400);
 const added=await request('addRestaurant',{name:'Cafe',url:'https://example.com/menu'},a.token);assert.equal(added.status,201);
 assert.equal((await request('state',null,b.token)).body.restaurants[0].name,'Cafe');assert.equal((await request('state',null,c.token)).body.restaurants.length,0);
 assert.equal((await request('deleteRestaurant',{restaurant:added.body.id},b.token)).status,403);
 assert.equal((await request('deleteRestaurant',{restaurant:added.body.id},a.token)).status,200);assert.equal((await request('state',null,b.token)).body.restaurants.length,0);
});
