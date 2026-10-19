# The Grid — plans with your people

A simple mobile event planner with a Tron-inspired dark interface, cyan outlines, and glowing vector lettering. Three pages: **Home** for the current Sunday–Saturday week, using the device’s local dates, **Your events** for shared plans, and **Calendar** for dates. Vote and mark Going directly on compact cards; open Details & rides for attendance and carpool offers. On phones, use the fixed bottom navigation to switch pages. Your events shows five plans per page, with All group events, I’m going, and Past filters. Built with Node.js 24, vanilla JavaScript, and SQLite. No third-party runtime dependencies or external accounts required.

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

## Delete an event

Only the recorded creator can delete an event. Open **Details & rides → Delete event**, then confirm. This removes the event, votes, attendance, ride offers, and queued unsent alerts for everyone. Other members do not see a delete option and the database rejects their requests. Older events without a recorded creator cannot be safely attributed by display name, so they remain protected. Ownership stays with the same membership across linked devices. Rejoining with a display name does not recover a profile.

The **Update event deletion** GitHub workflow applies the one-time database update automatically using the existing `SUPABASE_ACCESS_TOKEN` repository secret. If that token has been removed or expired, run [event-deletion.sql](supabase/event-deletion.sql) once in a new Supabase SQL Editor query instead. Fresh databases include creator tracking and deletion in `schema.sql`. The update preserves existing records and does not delete events by itself. Already delivered or in-flight push notifications cannot be recalled.

## Check for app updates

Use the refresh icon in the top bar or **Check for updates** at the bottom of any page. The app checks the latest published version without using the browser cache, then reloads if a newer release is available. Your group sign-in stays in local storage and the current page is preserved. GitHub must finish publishing before a new release can be found. No database update is needed.

The Pages build assigns a content version to app files, styles, imported modules, and the notification worker, and publishes `version.json` for update checks.

## Edit a group

Tap the group name (or your name at the top), choose **Edit group**, change the name, and select **Save changes**. Any member can rename their own group. Events, votes, members, and invite links stay the same. Existing Supabase projects need the small one-time [group settings update](supabase/group-settings.sql) run in SQL Editor; fresh installations include it in `schema.sql`.

## Event notifications

Tap the **bell** to enable or disable new-event alerts on each device. Notifications require a one-time owner setup; follow [the notification setup guide](supabase/NOTIFICATIONS.md). On iPhone, use iOS 16.4+ and launch the installed Home Screen app. Alerts are sent to other subscribed group members by Supabase, even when the app is closed. Notification setup is not activated just by publishing the website.

## iPhone Home Screen

Once deployed at a publicly accessible HTTPS URL, open it in Safari, tap **Share → Add to Home Screen**, and choose **Add**. The manifest and Apple touch icon provide an app-style launch. Safari installation and behavior on a physical iPhone still need device validation. This app requires an internet connection; offline edits and an iOS system share-sheet extension are not implemented. Copy an event link into the Add event form.

## Identity and privacy

Tap your name → **Use another device** on a signed-in device. On the new device or Home Screen installation, choose **Sign back in** and enter the six-digit code. It expires after 10 minutes and works once; it links the same membership, votes, event ownership, and group owner role without adding another member. Every device receives its own random bearer credential; Supabase stores only hashes in a private schema. Failed linking attempts are limited to five per IP hint and thirty application-wide per 15 minutes. The global cap is enforced even if an IP hint changes.

Use **Save a private backup code** to store a long-lived private credential in your password manager. It can restore access if your original device is unavailable. Anyone with a linking or backup code can act as you. If all signed-in devices and your backup are lost, a name alone cannot recover membership. The group creator can remove the old member before inviting you again. Removal revokes every linked device and deletes that member's votes, ride offers, linking codes, and notification subscriptions; their events stay with unknown ownership. The creator cannot remove themselves. Group members cannot remove others. Invite links are for joining new people; existing members should sign back in instead. An already signed-in member opening the same group's invite keeps their profile. New joins reject duplicate names (case-insensitive); different people should use distinct nicknames.

The membership rollout applies `group-owner.sql`, `membership.sql`, and `device-linking.sql` to existing databases. `reset-requested-groups.sql` performs the user's requested one-time wipe of all groups, members, events, and dependent app data. Its durable maintenance marker prevents repeated workflow runs from deleting groups created afterward. Notification configuration and server setup remain intact. Fresh database setup uses `schema.sql`; the destructive reset is never included in that file. This remains a trusted-friends app with self-selected names, rather than a verified public identity service. Back up local SQLite data.

## Validation

```sh
npm test
```

The integration tests launch an isolated server and database. They exercise group creation/joining, shared event persistence, URL/date validation, voting, attendance, ride offers, group isolation, token privacy, and app/manifest delivery. Browser smoke validation also exercised the main workflow and checked 320- and 390-pixel mobile viewports. The simplified interface was checked with two independent browsers using the Supabase RPC adapter, including one-tap voting/Going, ride offers, and calendar date selection. Layout was inspected in desktop Chromium; physical iPhone installation is unverified.
