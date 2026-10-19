# The Grid — plans with your people

A simple mobile event planner with a Tron-inspired dark interface, cyan outlines, and glowing vector lettering. Two views: Events and Calendar. Vote and mark Going directly on cards; open Details & rides for attendance and carpool offers. Built with Node.js 24, vanilla JavaScript, and SQLite. No third-party runtime dependencies or external accounts required.

## Free online hosting

The app supports **GitHub Pages + Supabase Free**. Follow [the setup guide](supabase/README.md) to create the database, add the two public settings, and enable GitHub Pages. A linked repository alone does not deploy the app. No Cloudflare account or paid domain is needed. The local Node server is only for development; the Pages build talks directly to Supabase.

## Run

```sh
npm ci
npm start
```

The browser connects to the Supabase project configured in `public/config.js`. For isolated local SQLite development, temporarily clear both public settings there and restore them before committing.

Open port 3000. Set `PORT` to change the port. `DATA_DIR` defaults to `.data`; this directory contains the SQLite database and must be stored on a persistent volume in deployment. Run a single server instance against its local database. Use an HTTPS reverse proxy or a Node-capable hosting provider with persistent disk for real phones. The Node/SQLite mode cannot run on a static-only host; use the Supabase mode for GitHub Pages.

## Use

1. Create a group and enter your name. Sample cards shown before joining are explicitly demo data.
2. Use **Invite friends** to share the private group URL. Each friend enters their name to join. Anyone possessing the invite can join, so keep it within your group.
3. Use **Add event** to add a website or social link, title, place, and start time. End time defaults to two hours later; optional end time and category are under **More options**. Links are preserved on event cards. Event details currently require manual confirmation; the app does not scrape social media or infer dates from arbitrary links.
4. Vote for favorites. Overlapping event times are flagged. Voting is an expression of interest, separate from attendance; it does not automatically select a winner.
5. Mark Going, Maybe, or Out and offer passenger seats if driving. Open **Details & rides** on an event to update attendance and offer seats. **Carpool details** lists drivers, offered seats, and attendees without ride offers. Seat reservation, pickup assignment, and messaging are not implemented; coordinate those with your friends.
6. The calendar shows all group events. Other devices refresh every 15 seconds. Data persists across server restarts.

## iPhone Home Screen

Once deployed at a publicly accessible HTTPS URL, open it in Safari, tap **Share → Add to Home Screen**, and choose **Add**. The manifest and Apple touch icon provide an app-style launch. Safari installation and behavior on a physical iPhone still need device validation. This app requires an internet connection; offline edits, push notifications, and an iOS system share-sheet extension are not implemented. Copy an event link into the Add event form.

## Identity and privacy

Membership uses a random bearer token saved in that browser's local storage. Supabase stores only its hash in a private schema. Tokens are never returned in group member lists. There are no passwords or account recovery. Clearing browser data requires rejoining with the invite and creates a new member. Names are self-selected, so this is suitable for a trusted group, not a public identity system. Invite revocation, member removal, event editing/deletion, spam protection, and administrative controls need further work before a broad public launch. Back up the SQLite database. External links open in a separate tab.

## Validation

```sh
npm test
```

The integration tests launch an isolated server and database. They exercise group creation/joining, shared event persistence, URL/date validation, voting, attendance, ride offers, group isolation, token privacy, and app/manifest delivery. Browser smoke validation also exercised the main workflow and checked 320- and 390-pixel mobile viewports. The simplified interface was checked with two independent browsers using the Supabase RPC adapter, including one-tap voting/Going, ride offers, and calendar date selection. Layout was inspected in desktop Chromium; physical iPhone installation is unverified.
