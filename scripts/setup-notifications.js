// Runs in GitHub Actions with a repository secret. Never prints credentials.
import { readFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";
const ref = "ecxbznnetkifbmpiudqu";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token)
  throw new Error(
    "Add SUPABASE_ACCESS_TOKEN as a GitHub repository Actions secret first.",
  );
async function management(path, body) {
  const res = await fetch(
    "https://api.supabase.com/v1/projects/" + ref + path,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok)
    throw new Error(
      "Supabase setup request failed (HTTP " +
        res.status +
        "). Check the access token and project permissions.",
    );
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const sql = (query) => management("/database/query", { query });
if (process.argv.includes("--activate")) {
  const [config] = await sql(
    "select function_url,dispatch_secret from doin_private.push_config where singleton;",
  );
  if (!config) throw new Error("Run the preparation step first.");
  const check = await fetch(config.function_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-grid-dispatch": config.dispatch_secret,
    },
    body: "{}",
    signal: AbortSignal.timeout(45000),
  });
  if (!check.ok)
    throw new Error(
      "The deployed notification worker did not pass its readiness check (HTTP " +
        check.status +
        "). Rerun setup after checking the Supabase function status.",
    );
  const result = await check.json();
  if (!Number.isInteger(result.processed))
    throw new Error("Unexpected notification worker response.");
  await sql(
    "update doin_private.push_config set enabled=true where singleton; select doin_private.dispatch_push();",
  );
  console.log(
    "Notification worker enabled. Group members can now enable notifications.",
  );
} else {
  await sql(
    "create extension if not exists pg_net; create extension if not exists pg_cron;",
  );
  await sql(readFileSync("supabase/notifications.sql", "utf8"));
  const [existing] = await sql(
    "select public_key,dispatch_secret from doin_private.push_config where singleton;",
  );
  if (!existing) {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const jwk = privateKey.export({ format: "jwk" });
    const publicKey = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x, "base64url"),
      Buffer.from(jwk.y, "base64url"),
    ]).toString("base64url");
    const secret = randomBytes(32).toString("hex");
    await management("/secrets", [
      { name: "DOIN_VAPID_PUBLIC_KEY", value: publicKey },
      { name: "DOIN_VAPID_PRIVATE_KEY", value: jwk.d },
      { name: "DOIN_DISPATCH_SECRET", value: secret },
    ]);
    await sql(
      `insert into doin_private.push_config(singleton,public_key,dispatch_secret,function_url) values(true,'${publicKey}','${secret}','https://${ref}.supabase.co/functions/v1/notify-events');`,
    );
  } else {
    // Preserve existing VAPID keys so installed phone subscriptions remain valid.
    await management("/secrets", [
      { name: "DOIN_DISPATCH_SECRET", value: existing.dispatch_secret },
      { name: "DOIN_VAPID_PUBLIC_KEY", value: existing.public_key },
    ]);
  }
  await sql(
    "select cron.schedule('doin-push-delivery','* * * * *','select doin_private.dispatch_push()');",
  );
  console.log(
    "Private push settings and automatic retry schedule prepared. Deploy the worker next.",
  );
}
