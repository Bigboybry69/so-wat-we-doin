import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  cpSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
const saved = JSON.parse(
  readFileSync("public/config.js", "utf8").match(
    /window\.DOIN_CONFIG\s*=\s*(\{[\s\S]*\})\s*;/,
  )?.[1] || "{}",
);
const supabaseUrl = process.env.SUPABASE_URL || saved.supabaseUrl || "";
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || saved.supabaseKey || "";
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl))
  throw new Error(
    "Set SUPABASE_URL to the HTTPS Project URL from Supabase settings.",
  );
let validKey = supabaseKey.startsWith("sb_publishable_");
if (supabaseKey.split(".").length === 3) {
  try {
    validKey =
      JSON.parse(Buffer.from(supabaseKey.split(".")[1], "base64url").toString())
        .role === "anon";
  } catch {
    validKey = false;
  }
}
if (!validKey)
  throw new Error(
    "Set SUPABASE_PUBLISHABLE_KEY to a publishable key or legacy anon key. Secret/service_role keys are forbidden.",
  );
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
writeFileSync(
  "dist/config.js",
  "window.DOIN_CONFIG = " +
    JSON.stringify({ supabaseUrl, supabaseKey }) +
    ";\n",
);
// Change asset URLs on each content change, including imported modules and the push worker.
function files(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : [join(dir, entry.name)],
    );
}
const outputs = files("dist");
const hash = createHash("sha256");
for (const file of outputs.filter((file) => !file.endsWith(".nojekyll")))
  hash.update(file).update(readFileSync(file));
const version = hash.digest("hex").slice(0, 12);
for (const file of outputs.filter((file) =>
  /\.(html|js|css|json)$/.test(file),
)) {
  const contents = readFileSync(file, "utf8").replace(
    /(["'(])(\.\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:js|css|svg|png|json|woff2))(?=["')])/g,
    (_match, quote, path) => quote + path + "?v=" + version,
  );
  writeFileSync(file, contents);
}
writeFileSync("dist/version.json", JSON.stringify({ version }) + "\n");
writeFileSync(
  "dist/index.html",
  readFileSync("dist/index.html", "utf8").replace(
    'name="app-version" content="development"',
    'name="app-version" content="' + version + '"',
  ),
);
writeFileSync("dist/.nojekyll", "");
console.log(
  "GitHub Pages files prepared in dist/. Only public Supabase settings are included.",
);
