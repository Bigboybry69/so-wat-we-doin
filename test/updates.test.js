import { test } from "node:test";
import assert from "node:assert/strict";
import { findUpdate, updateUrl } from "../public/updates.js";
test("update checks bypass cache and compare only valid published versions", async () => {
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return Response.json({ version: "abcdef123456" });
  };
  assert.deepEqual(
    await findUpdate("abcdef123456", "https://example.github.io/app/", fetcher),
    { version: "abcdef123456", available: false },
  );
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.url.pathname, "/app/version.json");
  assert.ok(request.url.searchParams.has("check"));
  assert.equal(
    (
      await findUpdate(
        "111111111111",
        "https://example.github.io/app/",
        fetcher,
      )
    ).available,
    true,
  );
  await assert.rejects(
    findUpdate("a", "https://example.com/", async () =>
      Response.json({ version: "https://bad.example" }),
    ),
    /isn’t available/,
  );
  await assert.rejects(
    findUpdate(
      "a",
      "https://example.com/",
      async () => new Response("no", { status: 503 }),
    ),
    /Couldn’t check/,
  );
});
test("updating keeps the site path, invitation/event query, and current page", () => {
  const url = new URL(
    updateUrl(
      "https://example.github.io/app/?join=group&event=id#calendar",
      "abcdef123456",
    ),
  );
  assert.equal(url.origin, "https://example.github.io");
  assert.equal(url.pathname, "/app/");
  assert.equal(url.hash, "#calendar");
  assert.equal(url.searchParams.get("join"), "group");
  assert.equal(url.searchParams.get("event"), "id");
  assert.equal(url.searchParams.get("update"), "abcdef123456");
});
