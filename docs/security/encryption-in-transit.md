# Item 23: encryption in transit

How data is protected while it moves between the parts of the system. Jason added the security
headers and the https check for the website. This page writes them up with test results.

## Each link in the system

| Link | How it's protected | Status |
| --- | --- | --- |
| Browser to website | HTTPS from wherever we host it. Production builds send `Strict-Transport-Security: max-age=63072000` (2 years), so a browser that has visited once only uses https for our site after that | Done (`web/next.config.ts`) |
| Website and browser to Supabase | Supabase only answers over https. A production build treats a Supabase URL that isn't https as not set up, so sign in and the staff pages stay off. Plain http only works for `localhost` and `127.0.0.1` with `npm run dev` | Done (`web/src/lib/supabase/config.ts`) |
| Phone to Supabase | The phone doesn't talk to Supabase yet, that's item 10 (Sprint 2). It will use the https project URL. Release builds on iOS (App Transport Security) and Android 9 and later block plain http unless the app adds an exception, and we won't add one | Planned |
| ESP32 sensor nodes to Supabase | Item 28 (Sprint 2). Use HTTPS with `WiFiClientSecure` and the root certificate set with `setCACert()`, never `setInsecure()` | Planned |

The website also sends these on every response:

| Header | Why |
| --- | --- |
| `X-Content-Type-Options: nosniff` | The browser won't guess a file's type, so an uploaded file can't be run as a script |
| `X-Frame-Options: DENY` | Nobody can show our pages inside a frame on their site to trick staff into clicking things |
| `Referrer-Policy: strict-origin-when-cross-origin` | Other sites only see our domain, never the full address of a page |
| `Content-Security-Policy` | Added on 29 Oct. Scripts, requests and forms can only go to our own site. See [security-headers.md](../test-results/security-headers.md) |
| `Permissions-Policy` | Added on 29 Oct. No page can ask for the camera, microphone, location or payments |

## Test results

Run on 16 Oct 2026 on Umer's Mac (macOS, Node 22.22.3), on `main`, with a production build that
has no Supabase values set. A small script started the build on 127.0.0.1 and read the headers.

| # | What we did | What should happen | Pass? |
| --- | --- | --- | --- |
| 1 | Opened `/`, `/plants` and `/login` | 200, with HSTS and the first three headers above | Pass |
| 2 | Opened `/dashboard` while signed out | 307 to `/login`, and the redirect has those four headers too | Pass |
| 3 | Looked for `X-Powered-By` | Not sent (fixed while testing, see below) | Pass |
| 4 | `npm run lint`, `npx tsc --noEmit` and `npm run build` | No errors | Pass |
| 5 | The 37 checks on a build with no Supabase values | All pass, and the dashboard sends you to `/login` | Pass |

The test ran over plain http on Umer's Mac, so it shows the headers are sent. It doesn't show
that https works, because that depends on the host.

## Fixed while testing

1. Every response had `X-Powered-By: Next.js`, which tells anyone what we run. Setting
   `poweredByHeader: false` in `web/next.config.ts` turns it off.

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| HTTPS on the real site | The website isn't deployed yet | Once it is, check http sends you to https, and run the site through SSL Labs |
| HSTS preload | It needs `includeSubDomains` and `preload`, and only makes sense on a domain we own | Leave it until SFC gives us a domain |
| Phone and ESP32 links | Not built yet | Test them with items 10 and 28 |
