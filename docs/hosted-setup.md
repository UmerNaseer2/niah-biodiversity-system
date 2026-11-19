# Setting up the hosted project

The steps to bring the hosted Supabase project and the live website up to `main`. Each step needs
the Supabase dashboard, the Vercel dashboard or the project keys, so whoever has those does it
(Umer for now). [`supabase/README.md`](../supabase/README.md) says what each SQL file does and what
to look out for while running it. This page is the order to do things in.

## 1. Check the website and the app use the same project

Before running any SQL, make sure it goes on the project people actually use.

- In Vercel, open the project, then **Settings**, **Environment Variables**, and look at
  `NEXT_PUBLIC_SUPABASE_URL` for Production. It should be the same project as
  `web/.env.local` and `mobile/.env`.
- If anyone ran SQL on a project of their own to try it (026 was tried on one), that doesn't
  count. Only the project in the keys matters.
- `SUPABASE_SERVICE_ROLE_KEY` should be set in Vercel too (the website's server needs it for
  invites), and never anywhere else.

## 2. See what the project has

```bash
cd supabase/tests
npm run check-hosted
```

It reads `web/.env.local`, asks the project for no rows of something each SQL file adds, and
prints which files are in, whether `edge-com` is deployed, and which files to run next. It only
reads, so it's fine to run any time. On 18 Nov 2026 it found 001 and nothing after it, and no
`edge-com`.

## 3. Before the SQL

- Open the `profiles` table in the Table Editor and check every role there is one an admin gave
  on purpose. Set any you don't recognise back to `visitor`.
- Turn sign ups off (**Authentication**, **Sign In / Providers**) until 003 to 021 are in.
- If the project has real records, download `records` and `species` as CSV from the Table Editor
  first, in case something has to be put back.

## 4. Run the SQL files

In the SQL Editor: **New query**, paste the whole file, **Run**. One file at a time, in the order
the check printed. For a project with only 001 and 002 that's:

003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016_1, 016_2, 016_3, 016_4, 017,
019, 020, 021, 022, 023, 024, 025, 026, 027, 028, 029, 030

- There's no 018.
- The check can't see 030 from outside, so it stops at 029. Run 030 after 029 anyway.
- Don't run 001 or 002 again. 002 writes the sample species back over any changes.
- A file that fails keeps nothing, so fix the problem and run the same file again. From 007 on,
  each file stops on its first line if the one before it isn't there, so a skipped file shows up
  straight away.
- If 005 stops with a check error like `records_gps_check`, a record already there breaks one of
  its rules. Fix or delete that record and run 005 again.
- If 006 ever has to be run again later, 007, 008, 016_2, 019 and 028 have to be run again after
  it. If 007 or 019 is run again, run 028 again after it.

## 5. Deploy edge-com

The edge devices upload readings through the `edge-com` Edge Function. In the dashboard:
**Edge Functions**, **Deploy a new function**, **Via Editor**, name it `edge-com`, paste
`supabase/functions/edge-com/index.ts` and deploy. Then turn **JWT verification off** for it,
because it checks each device's own token instead.

If its logs say it can't reach the database, add a secret `EDGE_COM_DB_URL` with the **Session
pooler** string from the **Connect** button and deploy it again.

## 6. Run the check again

```bash
npm run check-hosted
```

It should end with "Every SQL file is in." and say `edge-com` is deployed with JWT verification off,
and it exits with 0. If a file still shows as missing, run that file and the ones after it.

## 7. Set up the edge devices

Sign in on the website as an admin, open **Sensors**, then **Devices**:

1. Add each edge device with its position.
2. Link its nodes to it.
3. Make its token and put it in that device's `/opt/iot-edge/secrets.toml`.

[`iot/Field_Node_Edge-to-Cloud_Setup_Guide.md`](../iot/Field_Node_Edge-to-Cloud_Setup_Guide.md)
has the edge side. Without hardware, `iot-edge fake-thing --count 6 --interval 5` on the edge VM
sends made up readings through the real edge software, and they should show on the Sensors page
within a minute.

## 8. Redeploy the website

Vercel hasn't been deploying by itself when `main` changes, so the live site can be older than
`main`. In Vercel, open **Deployments**, deploy the newest commit on `main` to Production, and
check the Production deployment shows that commit.

In Supabase, **Authentication**, **URL Configuration**: the Site URL should be the live address,
and `<live address>/welcome` should be in the redirect URLs, or invite links won't open the right
page.

## 9. Try it

On the live site:

- The public plant pages and the map load, and a threatened plant shows no exact spot.
- Sign in as an officer. Records, Review, Species, Reports and Sensors all load, and Sensors
  doesn't say the database hasn't been set up.
- Ecology shows each zone's readings once some have arrived.
- On the app, sign in and sync. A record made on the phone shows on the website.

Turn sign ups back on only if people need to sign up themselves.

After this, [deployment.md](deployment.md) is the order to follow for each change that goes live.
