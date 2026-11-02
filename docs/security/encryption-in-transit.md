# Item 23: encryption in transit

How data is protected while it moves between the parts of the system. Jason added the security
headers and the https check for the website. This page writes them up with test results.

## Each link in the system

| Link | How it's protected | Status |
| --- | --- | --- |
| Browser to website | HTTPS from wherever we host it. Production builds send `Strict-Transport-Security: max-age=63072000` (2 years), so a browser that has visited once only uses https for our site after that | Done (`web/next.config.ts`) |
| Website and browser to Supabase | Supabase only answers over https. A production build treats a Supabase URL that isn't https as not set up, so sign in and the staff pages stay off. Plain http only works for `localhost` and `127.0.0.1` with `npm run dev` | Done (`web/src/lib/supabase/config.ts`) |
| Phone to Supabase | Since item 10 the phone uses the https project URL from `EXPO_PUBLIC_SUPABASE_URL`. Release builds on iOS (App Transport Security) and Android 9 and later block plain http unless the app adds an exception. There's none in `mobile/app.json` (read on 31 Oct) | Done in the code. Not yet tried on a release build against the hosted project |
| ESP32 sensor nodes to Supabase | Item 28. The edge device uses HTTPS with `WiFiClientSecure` and the root certificate set with `setCACert()`, never `setInsecure()` (`iot/edge-device/edge-device.ino`, read on 31 Oct) | Done in the code. Not retried on a real device for items 25 to 27 |

The website also sends these on every response:

| Header | Why |
| --- | --- |
| `X-Content-Type-Options: nosniff` | The browser won't guess a file's type, so an uploaded file can't be run as a script |
| `X-Frame-Options: DENY` | Nobody can show our pages inside a frame on their site to trick staff into clicking things |
| `Referrer-Policy: strict-origin-when-cross-origin` | Other sites only see our domain, never the full address of a page |
| `Content-Security-Policy` | Added on 29 Oct. Scripts, requests and forms can only go to our own site. See [security-headers.md](../test-results/security-headers.md) |
| `Permissions-Policy` | Added on 29 Oct. No page can ask for the camera, microphone, location or payments |
| `Cross-Origin-Opener-Policy: same-origin` | Added on 31 Oct. A page another site opens in a new window can't reach back into ours |
| `Cross-Origin-Resource-Policy: same-origin` | Added on 31 Oct. Other sites can't load our pages and files into theirs |

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

## The live site, 1 Nov 2026

Read only checks with `curl` on https://niah-biodiversity-system.vercel.app/, from Umer's Mac.
Nothing was signed in to or changed.

| What we checked | Result |
| --- | --- |
| http://…/login | Sends you to https with a 308 |
| `strict-transport-security` | `max-age=63072000` |
| TLS version | TLS 1.3 by default, and TLS 1.0 and 1.1 are refused |
| Certificate | `*.vercel.app` from Google Trust Services, valid until 29 Jan 2027, verifies |
| `/dashboard` signed out | Sends you to `/login` |
| Other headers | CSP, Permissions-Policy, Referrer-Policy, nosniff and `X-Frame-Options: DENY` are sent |

When we first ran these, `/welcome` was a 404 and the two cross origin headers from 31 Oct weren't
there. Later the same day both were live, so the site had been redeployed. These checks can't show
whether the SQL has been run on the hosted project. They cover Vercel's HTTPS, which doesn't change
with a redeploy.

### SSL Labs

We ran the site through the SSL Labs scanner on 1 Nov 2026, with publishing turned off so it stays
off their public boards. The site has two addresses, and each one gets its own grade.

| Address | Grade | HSTS the scanner saw | Protocols | Warnings |
| --- | --- | --- | --- | --- |
| First | A+ | `max-age=63072000` | TLS 1.2 and 1.3 | None |
| Second | A | None, Vercel answered the scanner with a 403 | TLS 1.2 and 1.3 | None |

On both, the scanner found no Heartbleed, POODLE, FREAK, Logjam, BEAST or RC4, forward secrecy
worked with every browser it simulates, and the certificate chain had no issues.

HSTS is what takes an A up to an A+, and the 403 didn't have the header. We don't know why Vercel
sent that 403. Straight after the scan we tried each address with `curl`, 3 times each, and every
answer was a 200 with HSTS, so the setup doesn't look different between them.

## Not tested yet

| What | Why | Next step |
| --- | --- | --- |
| SSL Labs on the redeployed site | The 1 Nov scan was on the older build, and one address sent the scanner a 403 | Redeploy, run it again and write the grades here |
| HSTS preload | It needs `includeSubDomains` and `preload`, and only makes sense on a domain we own | Leave it until SFC gives us a domain |
| Phone and ESP32 links against the hosted project | The hosted project is behind on the SQL files | Try them once Umer has run the SQL. See [item 25 to 27 results](../test-results/item-25-27-security.md) |
