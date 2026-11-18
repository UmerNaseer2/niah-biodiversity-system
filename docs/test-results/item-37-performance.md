# Item 37 test results: load testing and performance

These ran on 18 Nov 2026 on Umer's Mac (macOS, Node 22.22.3) on the `load-testing` branch. The
hosted Supabase project is behind on the SQL files (`supabase/README.md`), so the website ran against
the Supabase stand-in in `supabase/tests/stand-in.js`, filled with made up data. No phones and no
hardware were involved.

## What was tested

The park has a few hundred records now. The question was what happens to the website after a few
years of use, so the stand-in was filled with:

- **10,000 plant records** over the last year. Every 25th is waiting for review, every 40th is
  rejected and the rest are published. Every 13th has no species yet. Each has its own tag code, a
  spot near park HQ and one of four notes, three of which name a zone.
- **30 days of sensor readings**, one a minute from every node (130,017 readings in all).

Every public page and every staff page was then asked for five times in a row after one load to warm
it up, and the busiest pages were asked for five at once. Each time is from asking for the page to
the last byte arriving, and the size is the page as sent.

| Target from the test plan | Result with 10,000 records |
| --- | --- |
| Web search under 2 s | Met. `/plants?q=fig` took 0.11 s on its own, and five searches at once were all done in 1.93 s |
| Saving on the phone under 1 s | Not part of this test. It needs a real phone |
| Submitting under 3 s on 4G | Not part of this test. It needs a real phone and a 4G signal |

## What it found

Eight pages and downloads got slower as the records went up, because they read or sent every record.
Six of them are fixed. The other two are under [Still slow](#still-slow).

Times are the median of five loads, one at a time. Sizes are the page as sent.

| Page | Before | After |
| --- | --- | --- |
| Overview (`/dashboard`) | 42.36 s, 10.3 MB | 0.75 s, 617 kB |
| Records (`/dashboard/records`) | 68.33 s, 37.0 MB | 0.61 s, 402 kB |
| A species' public page (`/plants/dipterocarpus-sarawakensis`) | 4.51 s, 3.0 MB | 0.22 s, 213 kB |
| Review queue (`/dashboard/review`) | 0.54 s, 2.3 MB | 0.21 s, 320 kB |
| Ecology (`/dashboard/ecology`) | 8.20 s, 86 kB | 3.17 s, 86 kB |
| Ecology CSV (`/dashboard/ecology/csv`) | 3.32 s, 1 kB | 0.05 s, 1 kB |

The old records page was also asked for ten times at once. None of the ten had answered after five
minutes, when the timing script gave up. The new one answers five at once in 7.6 s (see below).

- **Overview** (`/dashboard`). It drew every record as a dot on the map, and the map is drawn twice
  (once more for people with scripts off), so the page was over 10 MB. It now shows the newest 500
  dots and says how many were left off, and the tiles count with the database instead of reading
  every record.
- **Records** (`/dashboard/records`). It listed every record on one page. It now shows 100 at a time,
  newest first, with Newer and Older buttons. The counts on the status buttons still cover every
  record.
- **A species' public page** (`/plants/...`). It drew a dot and a list item for every tagged plant of
  that species. It now shows the newest 500 dots and the newest 50 in the list, and points to the
  tag lookup for the rest.
- **Review queue** (`/dashboard/review`). It sent every waiting record (400 of them) to the browser.
  It now shows the oldest 50 and says how many are waiting in all. Hosted Supabase only sends 1000
  rows for one request, so before this a queue over 1000 would also have shown the wrong number.
- **Ecology** (`/dashboard/ecology`). It read every column of every record to find the plants near
  each zone. It now reads only the columns it uses, and leaves out rejected records, since those were
  mistakes. The CSV download read every record too and used none of them, so it doesn't read them
  any more.

`MOST_DOTS` in `web/src/components/park-map.tsx` is the 500.

### Still slow

These were left as they are for now.

- **Species list** (`/dashboard/species`, 2.27 s). It shows how many published and waiting records
  each species has, and gets that by reading the species and status of every record. Most of the
  time is the stand-in reading those 10,000 rows. A database view that does the counting would fix
  it, but that means a new SQL file for the hosted project, which is already behind.
- **Ecology** (`/dashboard/ecology`, 3.17 s, and up to 5 s). It's faster than before but still
  reads every record that isn't rejected, to match the notes against each zone's name. Doing that
  matching in the database is the next step if the page gets slow again.
- **Records CSV download** (`/dashboard/reports/csv`, 2.78 s for the last month and 4.47 s for
  every record). The file is meant to have every record in it, so it has to read them. A few seconds
  for a download is fine.
- **Several people at once**. Five people opening the records list at once were all done in 7.6 s,
  and five on the sensors page in 4.1 s, against under 1.4 s for one. Each of these pages asks the
  database several things and the stand-in answers one request at a time, so the five queue up.
  Hosted Supabase answers many at once, so this should be much less there, but it hasn't been
  checked on hosted yet.

### Tag codes running out

A tag code is `NNP-` and the first 6 characters of the record's ID, so there are about 16.7 million
of them. Phones make the IDs at random, so two records can get the same code. The chance of at least
one clash is about 3% with 1,000 records, 52% with 5,000 and 95% with 10,000. The database turns the
second one away (`records_tag_code_key` in `supabase/005_phone_sync.sql`), and the phone already
handles that: it tells the ranger and gives the record a new tag code (`mobile/src/sync/upload-row.ts`).
So nothing is lost, but past a few thousand records a ranger will sometimes have to swap a tag. The
load test gives its records codes in order so they never clash.

## How far to trust the numbers

- **Dev server**. The times are from `next dev`, because a production build won't send sign in
  details to a plain `http://` database. A dev server is slower than the live site, so the times are
  on the high side.
- **The stand-in isn't hosted Supabase**. It is Postgres running inside Node (PGlite) on the same
  laptop, and it answers one request at a time. That is why ten requests at once queue up, and why
  reading 10,000 rows takes about 2 seconds here. Hosted Supabase would read them faster but would
  add the trip over the internet.
- **One laptop, one run**. The same page could vary by a second between loads, so the medians matter
  more than the slowest load.
- **Bytes matter more than seconds here**. The fixes cut what the pages send to the browser, which
  matters on the park's slow connection whatever the database is.

## How to run it again

From `supabase/tests`, start the stand-in with the load data (it takes about 6 seconds to add it):

```bash
STAND_IN_LOAD_RECORDS=10000 STAND_IN_LOAD_DAYS=30 node stand-in.js
```

Then start the website against it (the `web-stand-in` launch setting, port 3210) and, from `web`:

```bash
TIME_EMAIL=admin@example.test TIME_PASSWORD=... RUNS=5 AT_ONCE=5 node scripts/time-pages.mjs
```

The password is the stand-in's test password (`TEST_PASSWORD` in `stand-in.js`). Without
`TIME_EMAIL` and `TIME_PASSWORD` it only times the public pages. `ONLY=/dashboard,/plants` times just
those pages, and `WARM=0` skips the warm up load. `supabase/tests/load-data.test.js` checks the made
up data is the shape described above, with 300 records so it runs quickly.
