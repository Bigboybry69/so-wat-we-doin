# Free GitHub Pages + Supabase setup

Use a public GitHub repository for free GitHub Pages on GitHub Free. Use the Free plan in Supabase; no upgrade is needed for this app's setup. Stay within both providers' limits. Free Supabase projects may pause after inactivity.

## 1. Prepare the database (once)

In your Supabase project, open **SQL Editor → New query**. Copy all of [schema.sql](schema.sql), paste it into the editor, and click **Run**. This creates the app's tables and access functions. Re-running it is safe. It does not import local demo or SQLite data.

Keep the `doin_private` schema out of Supabase's exposed schemas (the default exposes `public`, which is correct). Never disable the schema's permissions or RLS. The schema enables RLS with no public policies and revokes direct access. Only five RPC functions can access group data; each read/write requires a random membership token. Membership tokens are stored hashed, and are not included in member lists. Group creation and invite-based joining are intentionally public.

## 2. Website connection settings

This repository's `public/config.js` already contains the Project URL and public publishable key supplied by the owner. You do not need to add GitHub variables for this project. These settings are intentionally public; the database permissions protect group data.

To connect a different project, update `public/config.js` or optionally override it with GitHub repository Actions variables named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Never use a secret key (`sb_secret_`) or a `service_role` key. The build rejects those keys. You do not need to enable Supabase GitHub OAuth or purchase Supabase branching.

## 3. Enable the free website

In GitHub repository **Settings → Pages → Source**, select **GitHub Actions**. Open **Actions → Publish GitHub Pages → Run workflow** (or push to `main`). The workflow tests the app, builds static files, and publishes only `public/` plus the two public settings. The Node server, database files, and SQL setup are not included in the website.

After GitHub reports a successful deployment, Pages settings shows your live address. For this repository the expected address is `https://bigboybry69.github.io/so-wat-we-doin/`; do not assume it is live before the deployment succeeds.

Open that address, create a group, and send an invite to another browser/phone. Have that person join, add an event, vote, and offer a ride. Verify changes appear in both browsers. If there is a database-setup message, run step 1. If a project has been paused, resume it in Supabase.

## 4. Add to your iPhone

Open the live address in Safari → Share → Add to Home Screen → Add. The website needs an internet connection. A custom subdomain can be connected to GitHub Pages later; no paid domain is required now.

## Local development

`npm ci && npm start` starts the local server. The browser uses the Supabase project configured in `public/config.js`. For isolated local SQLite development, temporarily set both public settings in that file to empty strings, then restore them before building or committing. Never put private keys there. Use a separate test project/group when possible. Browser membership is stored separately for each project and site URL.

`npm test` runs local API, static build, and Supabase SQL/permissions tests. SQL tests run the actual schema on an embedded PostgreSQL engine, with the `anon` role, including cross-group isolation and denied direct table access. They do not prove your hosted Supabase project has been configured; that requires the live two-browser check above.

## Limits

No paid service, analytics, or billing integration is added. Hosting providers control free-plan limits. Groups use private invites and per-browser membership, not recoverable user accounts. Keep invites private. A public Supabase key cannot enumerate group data, but public create/join endpoints can be abused without additional rate limiting. Use this with a small trusted group; production administration and abuse controls remain future work.
