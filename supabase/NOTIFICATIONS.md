# New-event phone notifications

The app uses standard Web Push, a service worker, and a Supabase Edge Function. GitHub Pages still hosts the website. There is no new paid service. Supabase and GitHub free-plan usage limits still apply. Web Push is best effort: notifications may be delayed by phone settings, connectivity, paused projects, or push services.

## One-time setup for the owner

1. Open https://supabase.com/dashboard/account/tokens and create a personal access token named **The Grid notifications**. This is an account-management credential, not the public publishable key. Never paste it into chat, source code, `public/config.js`, or any SQL file.
2. Open https://github.com/Bigboybry69/so-wat-we-doin/settings/secrets/actions → **New repository secret**. Name it `SUPABASE_ACCESS_TOKEN` and paste the token into the secret value. Choose **Add secret**. Use an account with permission to manage the existing Supabase project.
3. Open the repository's **Actions → Setup notifications → Run workflow**. Wait for a green checkmark. The workflow installs the notification migration, creates private push keys, deploys the worker, verifies its response, and enables event-triggered delivery with a one-minute retry schedule. It keeps the existing groups/events and does not rotate existing push keys on reruns. Do not delete Supabase's `DOIN_*` function secrets.
4. You may remove the GitHub `SUPABASE_ACCESS_TOKEN` secret after successful setup. Notifications continue without it. Add a valid token again before rerunning this workflow or deploying worker changes. Revoke the personal token in Supabase too if it will not be reused.

If setup fails, open the failed step in GitHub Actions. Do not paste token values or private keys into an issue or chat. A missing/expired token, insufficient project permissions, missing original schema, disabled project, or extension availability must be resolved before activation. The public publishable key alone cannot install this setup.

## Each friend enables their own device

On iPhone (iOS 16.4+): open the website in Safari → **Share → Add to Home Screen**. Open **The Grid from the Home Screen**, join the group, tap the **bell** at the top, then **Enable notifications → Allow**. Notification permission must be granted separately on each device. Ordinary iPhone Safari tabs cannot receive these Web Push alerts.

On supported desktop/Android browsers: join the group, tap the bell, then Enable notifications and allow the browser prompt. Safari, Chrome/Chromium, and Firefox push endpoints are supported. Unsupported browsers show guidance. Devices blocking notifications must change OS/browser settings before enabling them.

To opt out, tap the bell → **Turn off notifications**. Leaving a group through the account menu removes that device subscription before clearing its membership. Clearing browser storage instead does not necessarily unsubscribe the push endpoint; use the bell or OS notification settings first. A single installed app/browser subscription follows one active group; enabling it in another group moves that subscription to the new membership.

## Behavior and security

- A database insert trigger queues new-event alerts for subscribed devices belonging to other members of the same group. The creator is excluded. Voting/RSVP changes do not notify people.
- Delivery runs server-side even after the event creator closes the browser. Queued jobs are locked during delivery and retried with backoff, up to five attempts. Expired subscriptions are removed. A crash between sending and recording completion can cause a retry; stable event notification tags reduce duplicates.
- Push subscription endpoints/keys, dispatch credentials, delivery jobs, and group data remain in the private schema with RLS and revoked direct browser access. Only authenticated membership RPCs can subscribe/unsubscribe a device. Worker RPCs are restricted to the service role.
- The public HTTP worker verifies a random dispatch secret before accessing the queue. It uses Supabase's injected service-role credential only on the server. Its service-role credential, dispatch secret, and VAPID private key are never shipped to GitHub Pages.
- Subscription URLs are restricted to known HTTPS Apple, Google FCM, and Mozilla push services. The worker never accepts arbitrary user-supplied outbound destinations directly.
- The push alert displays the group name, event creator, and event title. These may appear on the device lock screen according to its notification settings. Tapping an alert opens the event in the app; membership is still checked before showing group data.
- The migration adds `added_by` to events for reliable creator exclusion. Existing events are not re-announced and existing group/event records are preserved.

## Validation and remaining live check

`npm test` exercises the actual SQL migration on embedded PostgreSQL: role restrictions, same-group targeting, creator exclusion, subscription ownership, unsubscribe, queue locking, retry/backoff, stale-attempt protection, expired-endpoint removal. It also tests worker authentication/failure handling and service-worker display/click routing using mocked external boundaries.

Browser validation uses actual service-worker registration and mocked device PushManager + Supabase transport with the real SQL functions to check opt-in, persistence, opt-out, and re-enable. These tests do **not** prove real phone delivery or that the hosted migration/function has been installed.

After the setup workflow succeeds, enable notifications on a real Home Screen iPhone and on another group member's device. Close the receiving app, create an event from the other device, and confirm the notification arrives and opens the right event. Check an unrelated group gets no alert. Devices that haven't opted in cannot receive notifications. This physical-device/hosted delivery test remains required before claiming end-to-end phone delivery is verified.
