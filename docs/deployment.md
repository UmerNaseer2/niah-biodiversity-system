# Staging, going live and keeping an eye on it

This page covers item 42 (staging), item 44 (deploying to production) and how to tell the live
system is still working afterwards. [`hosted-setup.md`](hosted-setup.md) is the one time job of
bringing the hosted project up to `main`. This page is how it should work every time after that.

## Where each part runs

| Part | Live | Staging |
| --- | --- | --- |
| Website | Vercel, <https://niah-biodiversity-system.vercel.app/>, built from `web/` on `main` | A Vercel preview build for every other branch and pull request |
| Database, sign in, photos and `edge-com` | The hosted Supabase project in `web/.env.local` | A second free Supabase project, or the stand-in on a laptop |
| Phone app | A development or store build, since Expo Go doesn't encrypt the records file | Expo Go against the staging project or the stand-in |
| Edge device | The edge VM in the park, set up with `iot/edge-device/install-edge.sh` | `iot-edge fake-thing` on the VM, or the edge software on a laptop like in item 43 |

## Staging (item 42)

### What we use now

The stand-in (`supabase/tests/stand-in.js`) is our staging for now. It runs every SQL file, 001 to
027, and `edge-com` on a laptop, with made up accounts for each role, made up records and a day of
made up sensor readings. Every results page in `docs/test-results` ran against it, and
[item 43](test-results/item-43-integration.md) ran the phone, website and edge device together on
it. `supabase/README.md` and `docs/test-plan.md` say how to start it.

What it can't show is how the hosted services behave: real https and cookies on a `vercel.app`
address, Supabase's own limits (such as 1000 rows for one request), and the time over the internet.
That needs the setup below.

### Vercel preview builds

In the Vercel dashboard, by whoever has the project:

1. **Settings, Git.** Connect `UmerNaseer2/niah-biodiversity-system` if it isn't connected, with
   `main` as the production branch. Without this nothing deploys when `main` changes, which is
   probably why the live site has fallen behind (step 8 of `hosted-setup.md`).
2. **Settings, Build and Deployment.** Root Directory `web`.
3. After that, every push to another branch and every pull request gets its own preview address,
   and Vercel posts it on the pull request.
4. **Settings, Environment Variables.** Give the Preview environment its own values (next
   section). Vercel keeps Production and Preview values apart, so a preview never needs the live
   keys.
5. **Settings, Deployment Protection.** Keep Vercel Authentication on for previews, so only people
   in the Vercel team can open one.

### A database for staging

A preview shouldn't use the live database, because a test record or a test approval would show on
the public site. There are two ways:

- **A second free Supabase project** (say `niah-staging`). This is the better one. Run 001 to 027
  and deploy `edge-com` on it the same way as steps 4 and 5 of `hosted-setup.md`, then add a few
  made up staff accounts. In Vercel, set the Preview values of `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to that project's. Leave
  `SITE_URL` empty for Preview, so invite links come back to the preview itself and QR codes don't
  point at the live site. In that project's **Authentication**, **URL Configuration**, add
  `https://niah-biodiversity-system-*.vercel.app/**` to the redirect URLs.
- **No database.** With the Preview values left empty, the public pages use the sample data in
  `web/src/data` and sign in is off. That is enough to check how a public page looks, but not the
  dashboard.

Neither is set up yet. Both need the Vercel and Supabase dashboards.

## Deploying to production (item 44)

The same order every time something goes live:

1. **CI is green** on the commit on `main` (GitHub Actions, three jobs).
2. **New SQL goes first.** If the change adds a SQL file, run it on hosted in the SQL Editor, then
   `npm run check-hosted` from `supabase/tests`. A new page that needs a table that isn't there yet
   would show an error, so the database goes before the website.
3. **`edge-com`**, if `supabase/functions/edge-com/index.ts` changed. Deploy it again the same way
   as step 5 of `hosted-setup.md`, with JWT verification still off.
4. **The website.** With Git connected, merging to `main` deploys it. Without, open
   **Deployments** and deploy the newest commit on `main` to Production. Either way, check the
   Production deployment shows that commit.
5. **Check it.** `curl -i https://niah-biodiversity-system.vercel.app/health` should give `200` and
   `{"status":"ok",...}`. Then do the quick run in step 9 of `hosted-setup.md`.
6. **The phone app**, only if `mobile/` changed. The app isn't in a store yet, so a ranger's phone
   gets a development build from `npm run ios` or `npm run android` (`mobile/README.md`). Store or
   internal test builds haven't been set up.
7. **The edge device**, only if `iot/edge-device` changed. On the VM, pull the repo and run
   `sudo bash install-edge.sh` again from `iot/edge-device`. It keeps the config, secrets and
   passwords that are already there. Then `iot-edge restart`.

### Going back

- **Website.** In **Deployments**, open the Production deployment from before and use Instant
  Rollback. On the free Hobby plan this only goes back one deployment, so for anything older,
  deploy that commit again.
- **SQL.** Running an older file again doesn't undo a newer one. A file that fails keeps nothing,
  so only a file that worked needs undoing, and that takes a new numbered file that puts things
  back. Try it on the stand-in first (`npm test` in `supabase/tests`).
- **Edge device.** Check out the earlier commit on the VM and run `install-edge.sh` again.

## Keeping an eye on it

### The health check

`GET /health` on the website answers `200` with `{"status":"ok"}` when the website is up and can
read from the database, and `503` with `{"status":"down"}` when it can't. It reads one species from
`species_public`, which anyone can read already, and gives up after 5 seconds. The reason it failed
only goes to the server log, as `Health check failed: the database is behind` (the SQL isn't in
yet), `down` (no answer, or some other error) or `not set up` (no Supabase settings), so the public
page doesn't say what's wrong.

- Check it straight after every deploy (step 5 above).
- Point a free uptime monitor at it (UptimeRobot or Better Stack both have one) to check every 5
  minutes and email the team on a `503`. This isn't set up yet, because it needs someone's account.
  Each check reads one row, so it costs Supabase next to nothing. Supabase pauses free projects
  that go a week without use, and a check every few minutes through the API should also stop that.
- The live site is older than `main`, so `/health` gives 404 there until the next deploy. After
  that it will give 503 until hosted has 004, and the log will say the database is behind.

### Where to look when something is wrong

| Where | What it shows | When to look |
| --- | --- | --- |
| GitHub, **Actions** | Lint, types, tests and the build for every push and pull request | Before every deploy |
| Vercel, **Deployments** | Which commit is live, and the build log of a build that failed | After every deploy |
| Vercel, **Logs** | The website's server log. Filter by Error, or search for the start of one of our messages, such as `Health check failed` or `Checking the sensor alerts failed` | The website shows its error page, or `/health` gives 503 |
| Supabase, **Logs & Analytics** | The API, Postgres, Auth and Edge Function logs. `edge-com`'s logs show each upload and any it turned away | Phones can't sync, nobody can sign in, or readings stop coming |
| Supabase, **Reports** and **Usage** | Database size, storage and requests against the free plan's limits | Once a week |
| Website, **Sensors** | Which nodes are reporting, quiet nodes, and alerts nobody has acknowledged yet | Every day. This is how the park watches the sensors themselves |
| The edge VM | `iot-edge status` (what's waiting to upload), `iot-edge alerts` (the latest quick alerts) and `iot-edge logs` | The Sensors page shows every node on one edge device gone quiet |

## What's done and what isn't

Done: the `/health` route, these steps written down, and the stand-in used as staging for every
test including [item 43](test-results/item-43-integration.md).

Not done, because each needs the Vercel or Supabase dashboard: connecting Git in Vercel and turning
on previews, the staging Supabase project, the uptime monitor, and bringing hosted up to `main`
(`hosted-setup.md`).
