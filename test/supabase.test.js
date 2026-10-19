import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("Supabase schema, anonymous RPC permissions, validation, and group isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    const schema = readFileSync(
      new URL("../supabase/schema.sql", import.meta.url),
      "utf8",
    );
    await db.exec(schema);
    await db.exec(schema); // Reapplying must preserve data structures.
    await db.exec("DROP FUNCTION public.doin_update_group(text,jsonb)");
    const groupUpdate = readFileSync(
      new URL("../supabase/group-settings.sql", import.meta.url),
      "utf8",
    );
    await db.exec(groupUpdate);
    await db.exec(groupUpdate);
    await db.exec("SET ROLE anon");
    const rpc = async (name, token = "", data = {}) =>
      (
        await db.query(`SELECT public.${name}($1,$2::jsonb) AS result`, [
          token,
          JSON.stringify(data),
        ])
      ).rows[0].result;
    await assert.rejects(
      db.query("SELECT * FROM doin_private.members"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("SELECT doin_private.require_member('no')"),
      /permission denied/,
    );
    const a = await rpc("doin_create_group", "", {
      name: "Alex",
      group: "Our crew",
    });
    const b = await rpc("doin_join", "", { name: "Sam", invite: a.invite });
    const outsider = await rpc("doin_create_group", "", {
      name: "Someone",
      group: "Another crew",
    });
    await assert.rejects(rpc("doin_state", "wrong"), /Please join or create/);
    await assert.rejects(
      rpc("doin_join", "", { name: "No", invite: "invalid" }),
      /invite was not found/,
    );
    const event = {
      title: "Music in the park",
      category: "Music",
      place: "The park",
      url: "https://example.com/event",
      starts: "2026-11-01T18:00:00Z",
      ends: "2026-11-01T20:00:00Z",
    };
    await assert.rejects(
      rpc("doin_add_event", a.token, { ...event, ends: event.starts }),
      /End time/,
    );
    await assert.rejects(
      rpc("doin_add_event", a.token, { ...event, url: "javascript:alert(1)" }),
      /valid website link/,
    );
    await assert.rejects(
      rpc("doin_add_event", a.token, { ...event, starts: "infinity" }),
      /End time/,
    );
    const e = await rpc("doin_add_event", a.token, event);
    const response = { event: e.id, vote: 1, status: "going", seats: 3 };
    await assert.rejects(
      rpc("doin_respond", outsider.token, response),
      /Event not found/,
    );
    await assert.rejects(
      rpc("doin_respond", a.token, { ...response, seats: -1 }),
      /Invalid response/,
    );
    await assert.rejects(
      rpc("doin_respond", a.token, { ...response, vote: 0.5 }),
      /Invalid response/,
    );
    await rpc("doin_respond", a.token, response);
    await rpc("doin_respond", b.token, { ...response, seats: 0 });
    let state = await rpc("doin_state", b.token);
    assert.equal(state.group.name, "Our crew");
    assert.equal(state.members.length, 2);
    assert.equal(state.events.length, 1);
    assert.equal(
      state.events[0].responses.reduce((sum, r) => sum + r.vote, 0),
      2,
    );
    assert.equal(state.events[0].responses.find((r) => r.mine).name, "Sam");
    assert.equal(JSON.stringify(state).includes(a.token), false);
    assert.equal(JSON.stringify(state).includes("token_hash"), false);
    await rpc("doin_respond", a.token, { ...response, status: "out", vote: 0 });
    state = await rpc("doin_state", b.token);
    assert.equal(state.events[0].responses.length, 2);
    assert.equal(
      state.events[0].responses.find((r) => r.name === "Alex").seats,
      0,
    );
    const beforeRename = await rpc("doin_state", b.token);
    await assert.rejects(
      rpc("doin_update_group", "invalid", { name: "No access" }),
      /join or create/,
    );
    await assert.rejects(
      rpc("doin_update_group", b.token, { name: "   " }),
      /required fields/,
    );
    await assert.rejects(
      rpc("doin_update_group", b.token, { name: "x".repeat(121) }),
      /required fields/,
    );
    const renamed = await rpc("doin_update_group", b.token, {
      name: "  New crew  ",
      id: outsider.invite,
    });
    assert.deepEqual(renamed, { id: a.invite, name: "New crew" });
    const afterRename = await rpc("doin_state", b.token);
    assert.deepEqual(afterRename.events, beforeRename.events);
    assert.deepEqual(afterRename.members, beforeRename.members);
    assert.equal((await rpc("doin_state", a.token)).group.name, "New crew");
    assert.equal(
      (await rpc("doin_state", outsider.token)).group.name,
      "Another crew",
    );
    await rpc("doin_join", "", { name: "Still invited", invite: a.invite });
    assert.equal((await rpc("doin_state", a.token)).members.length, 3);
    assert.equal((await rpc("doin_state", outsider.token)).events.length, 0);
  } finally {
    await db.close();
  }
});
