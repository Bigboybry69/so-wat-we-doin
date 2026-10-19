import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("notification permissions, group targeting, durable queue, retries and unsubscribe", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema net;create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'select 1::bigint';`);
    await db.exec(
      readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
    );
    const migration = readFileSync(
      new URL("../supabase/notifications.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const role = (name) => db.exec("SET ROLE " + name);
    const rpc = async (name, token = "", data = {}) =>
      (
        await db.query(`select public.${name}($1,$2::jsonb) as r`, [
          token,
          JSON.stringify(data),
        ])
      ).rows[0].r;
    await role("anon");
    const a = await rpc("doin_create_group", "", {
        name: "Alex",
        group: "Friends",
      }),
      b = await rpc("doin_join", "", { name: "Sam", invite: a.invite }),
      c = await rpc("doin_create_group", "", {
        name: "Other",
        group: "Other group",
      });
    assert.equal((await rpc("doin_push_status", b.token)).ready, false);
    await assert.rejects(
      db.query("select public.doin_push_claim()"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from doin_private.push_config"),
      /permission denied/,
    );
    await db.exec("RESET ROLE");
    await db.exec(
      "insert into doin_private.push_config values(true,'test-public-key','private-dispatch-secret','https://example.supabase.co/functions/v1/notify-events',true)",
    );
    await role("anon");
    const sub = (n) => ({
      endpoint: "https://web.push.apple.com/" + n,
      keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
    });
    const A = sub("a"),
      B = sub("b"),
      C = sub("c");
    await rpc("doin_push_subscribe", a.token, { subscription: A });
    await rpc("doin_push_subscribe", b.token, { subscription: B });
    await rpc("doin_push_subscribe", c.token, { subscription: C });
    const status = await rpc("doin_push_status", b.token, {
      endpoint: B.endpoint,
    });
    assert.equal(status.subscribed, true);
    assert.equal(status.publicKey, "test-public-key");
    assert.equal(
      JSON.stringify(status).includes("private-dispatch-secret"),
      false,
    );
    await assert.rejects(
      rpc("doin_push_subscribe", b.token, {
        subscription: { ...B, endpoint: "https://127.0.0.1/test" },
      }),
      /not supported/,
    );
    await assert.rejects(
      rpc("doin_push_subscribe", c.token, {
        subscription: {
          ...B,
          keys: { p256dh: "C".repeat(87), auth: "D".repeat(22) },
        },
      }),
      /Invalid subscription keys/,
    );
    await rpc("doin_push_unsubscribe", c.token, { endpoint: B.endpoint });
    assert.equal(
      (await rpc("doin_push_status", b.token, { endpoint: B.endpoint }))
        .subscribed,
      true,
    );
    const event = {
      title: "Concert",
      place: "Park",
      category: "Music",
      starts: "2026-11-01T18:00:00Z",
      ends: "2026-11-01T20:00:00Z",
    };
    await rpc("doin_add_event", a.token, event);
    await role("service_role");
    const jobs = (await db.query("select public.doin_push_claim() as r"))
      .rows[0].r;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].subscription.endpoint, B.endpoint);
    assert.equal(jobs[0].body, "Alex added Concert");
    assert.equal(jobs[0].group, a.invite);
    assert.equal(jobs[0].attempt, 1);
    assert.deepEqual(
      (await db.query("select public.doin_push_claim() as r")).rows[0].r,
      [],
    );
    await db.query("select public.doin_push_finish($1,1,'retry')", [
      jobs[0].id,
    ]);
    assert.deepEqual(
      (await db.query("select public.doin_push_claim() as r")).rows[0].r,
      [],
    );
    await db.exec(
      "RESET ROLE;update doin_private.push_jobs set available_at=now()-interval '1 minute';SET ROLE service_role",
    );
    const retried = (await db.query("select public.doin_push_claim() as r"))
      .rows[0].r;
    assert.equal(retried[0].attempt, 2);
    await db.query("select public.doin_push_finish($1,1,'sent')", [jobs[0].id]);
    await db.exec("RESET ROLE");
    assert.equal(
      (await db.query("select delivered_at from doin_private.push_jobs"))
        .rows[0].delivered_at,
      null,
    );
    await role("service_role");
    await db.query("select public.doin_push_finish($1,2,'sent')", [jobs[0].id]);
    await role("anon");
    await rpc("doin_add_event", a.token, { ...event, title: "Second concert" });
    await role("service_role");
    const expired = (await db.query("select public.doin_push_claim() as r"))
      .rows[0].r;
    assert.equal(expired.length, 1);
    await db.query("select public.doin_push_finish($1,1,'expired')", [
      expired[0].id,
    ]);
    await role("anon");
    assert.equal(
      (await rpc("doin_push_status", b.token, { endpoint: B.endpoint }))
        .subscribed,
      false,
    );
    await rpc("doin_push_subscribe", b.token, { subscription: B });
    await rpc("doin_push_unsubscribe", b.token, { endpoint: B.endpoint });
    await rpc("doin_add_event", a.token, {
      ...event,
      title: "No push to unsubscribed",
    });
    await role("service_role");
    assert.deepEqual(
      (await db.query("select public.doin_push_claim() as r")).rows[0].r,
      [],
    );
  } finally {
    await db.close();
  }
});
