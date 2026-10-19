import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("../scripts/build-pages.js", import.meta.url),
);
test("Pages build uses relative paths and refuses secret database keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "doin-pages-"));
  try {
    cpSync(new URL("../public/", import.meta.url), join(dir, "public"), {
      recursive: true,
    });
    writeFileSync(join(dir, "public/config.js"), "window.DOIN_CONFIG = {};");
    const run = (url, key) =>
      spawnSync(process.execPath, [script], {
        cwd: dir,
        env: {
          ...process.env,
          SUPABASE_URL: url,
          SUPABASE_PUBLISHABLE_KEY: key,
        },
        encoding: "utf8",
      });
    assert.notEqual(run("", "").status, 0);
    assert.notEqual(
      run("https://example.supabase.co", "sb_secret_never_publish").status,
      0,
    );
    const jwt =
      "header." +
      Buffer.from(JSON.stringify({ role: "service_role" })).toString(
        "base64url",
      ) +
      ".signature";
    assert.notEqual(run("https://example.supabase.co", jwt).status, 0);
    assert.equal(
      run("https://example.supabase.co", "sb_publishable_test_only").status,
      0,
    );
    writeFileSync(
      join(dir, "public/config.js"),
      'window.DOIN_CONFIG = {"supabaseUrl":"https://example.supabase.co","supabaseKey":"sb_publishable_saved_test"};',
    );
    assert.equal(run("", "").status, 0);
    const html = readFileSync(join(dir, "dist/index.html"), "utf8");
    assert.doesNotMatch(html, /(?:href|src)="\//);
    const version = html.match(/app\.js\?v=([a-f0-9]{12})/)[1];
    assert.equal(
      JSON.parse(readFileSync(join(dir, "dist/version.json"), "utf8")).version,
      version,
    );
    assert.ok(html.includes('name="app-version" content="' + version + '"'));
    assert.equal(run("", "").status, 0);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "dist/version.json"), "utf8")).version,
      version,
    );
    assert.match(html, new RegExp("style\\.css\\?v=" + version));
    const module = readFileSync(join(dir, "dist/app.js"), "utf8");
    assert.ok(module.includes("./api.js?v=" + version));
    assert.ok(module.includes("./notifications.js?v=" + version));
    assert.ok(
      readFileSync(join(dir, "dist/notifications.js"), "utf8").includes(
        "./sw.js?v=" + version,
      ),
    );
    writeFileSync(
      join(dir, "public/style.css"),
      readFileSync(join(dir, "public/style.css"), "utf8") +
        "\n/* new release */",
    );
    assert.equal(run("", "").status, 0);
    const newHtml = readFileSync(join(dir, "dist/index.html"), "utf8");
    assert.notEqual(newHtml.match(/app\.js\?v=([a-f0-9]{12})/)[1], version);

    const manifest = JSON.parse(
      readFileSync(join(dir, "dist/manifest.json"), "utf8"),
    );
    assert.equal(manifest.start_url, "./");
    assert.equal(manifest.scope, "./");
    const config = readFileSync(join(dir, "dist/config.js"), "utf8");
    assert.match(config, /sb_publishable_saved_test/);
    assert.doesNotMatch(config, /service_role|sb_secret/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
