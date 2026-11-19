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

## Putting the website on Vercel

The website is a plain Next.js app in `web/`, so Vercel builds it without a `vercel.json`. These
are the steps for a new Vercel project, and the settings to check on the one that runs the live
site now.

1. **Add New, Project**, and import `UmerNaseer2/niah-biodiversity-system` from GitHub.
2. **Root Directory** `web`. Vercel then finds Next.js by itself. Leave the build, output and
   install commands as they are.
3. **Environment Variables**, before the first deploy:

   | Name | Value | Environment |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | The project URL from the Supabase **Connect** button, starting with `https://` | Production. For Preview see staging below |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The publishable key (`sb_publishable_...`), or the older anon key | Production. For Preview see staging below |
   | `SITE_URL` | The website's own address, with no slash at the end | Production only |
   | `SUPABASE_SERVICE_ROLE_KEY` | The secret key (`sb_secret_...`), or the older service role key. Mark it **Sensitive**. `SUPABASE_SECRET_KEY` works too | Production only. Only the Users and roles page needs it |

   - The site also takes `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the name the Connect button
     shows), `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY` for the key, and `SUPABASE_URL` for
     the address. So the names Vercel's Supabase integration adds work too. Set one of each.
   - Never give the secret key a name that starts with `NEXT_PUBLIC_`, because those go into the
     pages people download.
   - Some pages, such as sign in, are built ahead of time. After changing any of these, redeploy
     (**Deployments**, the newest one, **Redeploy**). A deploy built without the Supabase values
     shows the sample plants and says sign in isn't set up.
4. **Settings, Functions, Function Region.** Pick the Vercel region closest to the Supabase
   project. The region is in the project's **Session pooler** address from the Connect button
   (for example `aws-0-ap-northeast-1` is Tokyo, so `hnd1`, and `ap-southeast-1` is Singapore, so
   `sin1`). The default is Washington DC (`iad1`), and each page reads Supabase a few times on the
   server, so a project in Asia would make every page slower. The free Hobby plan can pick any one
   region.
5. **Deploy.** Then, from `web`:

   ```bash
   npm run check-deploy -- https://your-site-address
   ```

   It reads the home page, `/health`, sign in, the dashboard, `/welcome` and the plant list, and
   should end with "Everything answered as it should." It only reads public pages and needs no
   keys.
6. **In Supabase, Authentication, URL Configuration.** Set the Site URL to the website's address,
   and add `<address>/welcome` to the Redirect URLs. Without these, invite and password emails
   send people to Supabase's default address instead of the website. If Preview uses the same
   project, add `https://niah-biodiversity-system-*.vercel.app/**` too.
7. **The phone app.** Put the same address in `EXPO_PUBLIC_SITE_URL` in `mobile/.env`, so tags
   printed from the app link to the website, and build the app again.

The address comes from the project name, and `niah-biodiversity-system.vercel.app` belongs to the
project that runs the live site now. A new project gets a different address, so use whichever one
is live for `SITE_URL`, the Supabase Site URL and `EXPO_PUBLIC_SITE_URL`.

`edge-com` doesn't run on Vercel. It stays an Edge Function on the Supabase project (step 5 of
`hosted-setup.md`), and the Sensors page only fills up once an edge device uploads to it.

## Staging (item 42)

### What we use now

The stand-in (`supabase/tests/stand-in.js`) is our staging for now. It runs every SQL file, 001 to
029, and `edge-com` on a laptop, with made up accounts for each role, made up records and a day of
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

- **A second free Supabase project** (say `niah-staging`). This is the better one. Run 001 to 029
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

1. **CI is green** on the commit on `main` (GitHub Actions, four jobs).
2. **New SQL goes first.** If the change adds a SQL file, run it on hosted in the SQL Editor, then
   `npm run check-hosted` from `supabase/tests`. A new page that needs a table that isn't there yet
   would show an error, so the database goes before the website.
3. **`edge-com`**, if `supabase/functions/edge-com/index.ts` changed. Deploy it again the same way
   as step 5 of `hosted-setup.md`, with JWT verification still off.
4. **The website.** With Git connected, merging to `main` deploys it. Without, open
   **Deployments** and deploy the newest commit on `main` to Production. Either way, check the
   Production deployment shows that commit.
5. **Check it.** From `web`, `npm run check-deploy -- https://niah-biodiversity-system.vercel.app`
   should end with "Everything answered as it should." That includes `/health` giving `200` and
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

Done: the `/health` route, `npm run check-deploy` for checking a deploy from the outside, these
steps written down (with the first time Vercel setup), and the stand-in used as staging for every
test including [item 43](test-results/item-43-integration.md).

Not done, because each needs the Vercel or Supabase dashboard: connecting Git in Vercel and turning
on previews, the staging Supabase project, the uptime monitor, and bringing hosted up to `main`
(`hosted-setup.md`).
