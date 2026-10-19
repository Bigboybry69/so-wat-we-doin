import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("only recorded creators can delete, even with duplicate names; related votes and push jobs are removed", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema net;create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'select 1::bigint';",
    );
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    );
    const rpc = async (name, token = "", data = {}) =>
      (
        await db.query(`select public.${name}($1,$2::jsonb) as r`, [
          token,
          JSON.stringify(data),
        ])
      ).rows[0].r;
    await db.exec("SET ROLE anon");
    const a = await rpc("doin_create_group", "", {
        name: "Alex",
        group: "Crew",
      }),
      b = await rpc("doin_join", "", { name: "Alex B", invite: a.invite }),
      c = await rpc("doin_create_group", "", { name: "Alex", group: "Other" });
    await db.exec("RESET ROLE");
    await db.query("update doin_private.members set name='Alex' where token_hash=sha256(convert_to($1,'UTF8'))",[b.token]);
    await db.exec("SET ROLE anon");
    const event = {
      title: "Concert",
      place: "Park",
      category: "Music",
      starts: "2026-11-01T18:00:00Z",
      ends: "2026-11-01T20:00:00Z",
    };
    const first = await rpc("doin_add_event", a.token, event);
    assert.equal((await rpc("doin_state", a.token)).events[0].canDelete, true);
    assert.equal((await rpc("doin_state", b.token)).events[0].canDelete, false);
    await db.exec("RESET ROLE");
    // Model an event from before creator tracking: a matching name is not proof of ownership.
    await db.query("update doin_private.events set added_by=null where id=$1", [
      first.id,
    ]);
    await db.exec(
      readFileSync(
        new URL("../supabase/notifications.sql", import.meta.url),
        "utf8",
      ),
    );
    const migration = readFileSync(
      new URL("../supabase/event-deletion.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(
      "insert into doin_private.push_config values(true,'test-key','test-secret','https://example.supabase.co/functions/v1/notify-events',true)",
    );
    await db.exec("SET ROLE anon");
    assert.equal(
      (await rpc("doin_state", a.token)).events[0].creatorKnown,
      false,
    );
    await assert.rejects(
      rpc("doin_delete_event", a.token, { event: first.id }),
      /not its creator/,
    );
    await rpc("doin_push_subscribe", b.token, {
      subscription: {
        endpoint: "https://web.push.apple.com/test",
        keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
      },
    });
    const own = await rpc("doin_add_event", a.token, {
        ...event,
        title: "Owned concert",
      }),
      other = await rpc("doin_add_event", b.token, {
        ...event,
        title: "Other member event",
      });
    await rpc("doin_respond", b.token, {
      event: own.id,
      vote: 1,
      status: "going",
      seats: 3,
    });
    await assert.rejects(
      rpc("doin_delete_event", "bad", { event: own.id }),
      /join or create/,
    );
    await assert.rejects(
      rpc("doin_delete_event", b.token, {
        event: own.id,
        added_by: (await rpc("doin_state", a.token)).me.id,
      }),
      /not its creator/,
    );
    await assert.rejects(
      rpc("doin_delete_event", c.token, { event: own.id }),
      /not its creator/,
    );
    await assert.rejects(
      db.query("delete from doin_private.events"),
      /permission denied/,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from doin_private.push_jobs where event=$1",
          [own.id],
        )
      ).rows[0].n,
      1,
    );
    await db.exec("SET ROLE anon");
    assert.deepEqual(
      await rpc("doin_delete_event", a.token, { event: own.id }),
      { ok: true },
    );
    await assert.rejects(
      rpc("doin_delete_event", a.token, { event: own.id }),
      /not its creator/,
    );
    const after = await rpc("doin_state", b.token);
    assert.equal(
      after.events.some((e) => e.id === own.id),
      false,
    );
    assert.equal(
      after.events.some((e) => e.id === other.id),
      true,
    );
    assert.equal(
      after.events.some((e) => e.id === first.id),
      true,
    );
    await db.exec("RESET ROLE");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from doin_private.responses where event=$1",
          [own.id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from doin_private.push_jobs where event=$1",
          [own.id],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
