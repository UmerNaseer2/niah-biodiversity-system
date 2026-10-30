# Content-Security-Policy and Permissions-Policy test results

Round 1 was on 29 Oct 2026 on Umer's Mac (macOS, Node 22.22.3) on the `security-headers` branch.
The pages were tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own sample records and test accounts, not the hosted project.

## What changed

The website already sent the item 23 headers (see
[encryption-in-transit.md](../security/encryption-in-transit.md)). The security plan listed two
more as a known gap, and `web/next.config.ts` now sends both on every response.

### Content-Security-Policy

It tells the browser where a page is allowed to load things from. If someone ever got code into a
page, the browser wouldn't load scripts from their site or send requests to it with `fetch`. It's
a second layer, not the main one: `'unsafe-inline'` is still on (see below), so React escaping
every piece of text is still what stops a script being written into a page in the first place.

| Part | What it allows | Why |
| --- | --- | --- |
| `default-src 'self'` | Only our own site, for anything not listed below | The safe starting point |
| `script-src 'self' 'unsafe-inline'` | Our own scripts, and scripts written into the page | Next.js writes small scripts into every page to start React |
| `style-src 'self' 'unsafe-inline'` | Our own CSS, and styles written into the page | The report bars and the sensor battery bars set their width with a `style` attribute |
| `img-src 'self' data: blob: https:` | Our own pictures, and any https picture | Species photos can be a link to any https site, record photos come from Supabase storage, and the map tiles come from OpenStreetMap |
| `font-src 'self'` | Our own fonts | `next/font/google` downloads the fonts at build time and serves them from our site |
| `connect-src 'self'` | Requests back to our own site only | The browser never talks to Supabase itself, the server does |
| `object-src 'none'` | No plugins like Flash | Nothing on the site needs them |
| `base-uri 'self'` | A `<base>` tag can only point at our site | Stops someone changing where every relative link goes |
| `form-action 'self'` | Forms can only send to our site | Sign in, sign out and every staff form post to our own server |
| `frame-ancestors 'none'` | No site can show our pages in a frame | The same as `X-Frame-Options: DENY`, for newer browsers |

With `npm run dev` it also has `'unsafe-eval'` in `script-src`, which React needs for its error
overlay, and the stand-in's http address in `img-src`. A production build has neither.

**Why there's no nonce.** The Next.js guide (`web/node_modules/next/dist/docs/01-app/02-guides/
content-security-policy.md`) says the strictest policy uses a new random nonce on every request
instead of `'unsafe-inline'`. That only works if every page is rendered on each request, so
`/login`, `/screens` and `/tag` would stop being static, and nothing could be cached. The guide's
"Without Nonces" setup is what we used. The guide also has an experimental hash based option that
keeps pages static, which could be tried once it's stable.

### Permissions-Policy

`camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()`. The website never
uses any of these, so no page (or anything injected into one) can ask for them. The QR scanner
and GPS are in the phone app, which this header doesn't touch.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Website lint | `cd web && npm run lint` | Pass |
| Types | `cd web && npx tsc --noEmit` | Pass |
| Build | `cd web && npm run build` | Pass, all 22 routes. Only the two font warnings `web/README.md` explains |
| Built policy | Read the headers in `web/.next/routes-manifest.json` after the build | Pass. No `'unsafe-eval'` and no http address |

## Manual tests (stand-in)

The site ran with `npm run dev` and was checked in a browser, signed in as the test officer where
the page needed it. After each page the browser console was searched for "Content Security
Policy".

| Test | Result |
| --- | --- |
| `/login`: both headers are sent, with `'unsafe-eval'` and the stand-in address in dev | Pass |
| Belian plant page: its outside https photo shows and all 9 map tiles load | Pass, no blocked loads |
| Slipper orchid plant page (location hidden): the rough area map loads 12 tiles | Pass, no blocked loads |
| `/tag/NNP-3F2A9C`, `/screens` and `/login` | Pass, no blocked loads |
| Dashboard: the map loads 8 tiles | Pass, no blocked loads |
| Reports: the filter form (a GET form) shows the 5 records from 1 Oct | Pass |
| Reports: the CSV link answers 200 with `text/csv` and 6 lines | Pass |
| Edit a species page opens | Pass, no blocked loads |
| Sign out (a server action POST) goes to `/login` | Pass, nothing blocked by `form-action` |
| The dev server's live reload still connects | Pass |
| A test script in the page tried things the policy should stop: an http picture from another site, a script from another site and a fetch to another site | All 3 blocked, and a picture from the stand-in's storage and an OpenStreetMap tile were allowed |

## Known side effects

- The Vercel toolbar on preview deployments loads scripts from `vercel.live`, so the policy blocks
  it. The site itself still works. If the team wants the toolbar on previews, add `vercel.live` to
  `script-src`, `connect-src` and a `frame-src` for preview builds only.
- A new outside service, like a map from a different tile server or a font from Google Fonts,
  has to be added to the policy, or the browser will block it. The console says which part
  blocked it.

## Not tested yet

- The hosted Supabase project, which needs 003 to 009 run first. A photo uploaded there comes from
  an https address, which `img-src` allows.
- A production build on Vercel. The values were read from the build output on Umer's Mac, but no
  browser has opened a deployed page yet. Item 25's header check and ZAP scan cover that.
