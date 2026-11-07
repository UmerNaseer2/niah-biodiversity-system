# Rate limit test results

Round 1 was on 5 Nov 2026 on Umer's Mac (macOS, Node 22.22.3) on the `rate-limits` branch. The
sign in page was tried against the Supabase stand-in in `supabase/tests/stand-in.js` (see
`web/README.md`), with the stand-in's own test accounts, not the hosted project.

## What changed

### Website sign in

`web/src/lib/rate-limit.ts` counts wrong sign ins in the server's memory. One email gets 5 wrong
tries in 15 minutes, and one address gets 20 across any emails. After that, `/login` says "Too many
tries. Wait a few minutes, then try again." and doesn't send the sign in to Supabase until the
oldest of those tries is 15 minutes old. Supabase Auth has limits of its own as well, and if it
answers with a 429 the form shows the same message. Signing in starts that email's count again,
but not the address's. `web/README.md` has the details.

### Sensor readings

`supabase/022_iot_reading_limit.sql` limits each edge device to 3,600 readings an hour. 3 nodes send
about 180 an hour, and about 2,200 if all of them report a problem every 5 seconds for the whole
hour. A call that would go over is refused with HTTP 429 and none of it is kept. The edge device
already keeps a batch and tries again after a 429, waiting longer each time, so the device code
didn't change. Readings it sends again after a failed send don't count twice.

### Places that didn't need one

- The phone syncs on its own once a minute while anything is waiting, and when someone signs in,
  the app comes to the front, a record is saved or signal comes back
  (`mobile/src/state/sync-context.tsx`). Phone sign in goes straight to Supabase Auth, and a 429
  from it already shows the same "Too many tries" message as the website.
- Every other staff page and action needs a signed in account first.

## Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Database tests | `cd supabase/tests && npm test` | Pass, 421 of 421. `iot-limit.test.js` is the new file, with 10 tests |
| Website unit tests | `cd web && npm test` | Pass, 12 of 12 in `src/lib/rate-limit.test.mjs` |
| Website lint | `cd web && npm run lint` | Pass |
| Build | `cd web && npm run build` | Pass, all 24 routes. Only the two font warnings `web/README.md` explains |
| Types | `cd web && npx tsc --noEmit`, after the build | Pass |

`iot-limit.test.js` checks the limit itself, a call that goes over being refused whole, each device
having its own count, readings older than an hour no longer counting, readings sent again not
counting, a wrong token still being turned away, 022 stopping if 021 hasn't been run, and running
022 twice. Its last test sends readings through the stand-in the way an edge device does, and gets
HTTP 429 once the device is over the limit and 200 again once it fits.

## Manual tests (stand-in)

The site ran with `npm run dev` against the stand-in and was checked in a browser. The passwords
were made up wrong ones.

| Test | Result |
| --- | --- |
| 5 wrong passwords in a row for the test officer's email each show "That email and password don't match an active account." | Pass |
| A 6th wrong password for the same email shows "Too many tries. Wait a few minutes, then try again." | Pass |
| Straight after, a wrong password for the test admin's email still shows the normal message | Pass |

## Known limits

- The sign in counts are kept in memory, so each copy of the server has its own and a restart
  clears them. It slows down guessing more than it stops it.
- 022 limits how fast readings come in, but old readings are still never removed, so the table
  keeps growing.

## Not tested yet

- The hosted Supabase project, which needs 022 run after 021.
- A deployed copy on Vercel, where the address comes from the host's headers.
- A real ESP32 edge device getting a 429.
