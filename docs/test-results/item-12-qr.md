# Item 12 test results: making QR tags

One round so far, on 1 Nov 2026 on the iOS simulator, against the stand-in. Until now the record
screen on the phone only had a note saying QR tags were coming, and the website drew a pattern that
looked like a QR code but wasn't one. This item makes a real QR code on the phone from the record's
tag code, with no signal needed, and lets the botanist print it. The website draws real ones too.

The proposal says the code is "generated from this ID and links to the plant's page on our website",
and that "the botanist can generate the QR code on site even without signal".

## Round 1: 1 Nov 2026, iOS simulator

Run on Umer's Mac on `item-12-qr`, in Expo Go 57.0.9 on an iPhone 17 Pro simulator (iOS 26.5). The
server was the stand-in (`supabase/tests/stand-in.js`), which runs our real SQL files with made up
accounts and made up records. No hosted project was touched. To lose signal on purpose, the phone
talked to the stand-in through a small proxy on the Mac that could drop connections.

To check a code really reads, we took a screenshot and ran it through `jsQR`, a QR reader library,
instead of only looking at it. That's a stand-in for a phone camera and not the same thing, see "Not
tested".

### What we built

- **A QR tag card on the record screen.** It's black on white in both light and dark mode, with the
  4 square blank border QR codes need, and the tag code written under it.
- **Works with no signal.** The code is made on the phone with `qrcode-generator`, a small library
  with no native code, so it shows straight after saving a record.
- **What's in the code.** With a website address set it holds `https://<website>/tag/NNP-XXXXXX`, so
  a normal phone camera opens the plant's page. Without one it holds only the tag code, which the
  app's Scan tab can still read. The address has to be `https://`, except `http://localhost` and
  `http://127.0.0.1` for trying things out.
- **Error correction level Q.** It can lose about a quarter of its squares and still read, since
  these tags live outside on trees.
- **Print this tag.** Opens the phone's print window with one tag at the top left of an A4 page,
  70mm wide with a dashed line to cut along. It has "Niah National Park", the QR code and the tag
  code. The button is hidden on the web build, because printing there would print the whole page.
- **No species on the printed tag, on purpose.** Some of these plants are protected, and a name on a
  tag tells anyone walking past what to look for. No coordinates either.
- **A note that says what a camera will get.** It changes with the record:
  - Published: the camera opens the public page.
  - Waiting: "no plant with that tag yet" until an officer approves it.
  - Rejected: the website has no page for this tag.
  - No website address in the build: the code only holds the tag code.
- **No code when the tag can't be trusted.** A record whose tag code clashes with another plant on
  the server, or one that isn't on the server any more, shows the reason and no code. A code that
  hasn't uploaded yet still shows, with a warning that it isn't checked until the upload, so it's
  better to print after that if you can.
- **Real QR codes on the website.** `TreeTag` used to draw a made up pattern. It now draws a real
  code, so nothing on the site looks scannable while being fake. The address comes from a new server
  only setting, `SITE_URL`, and with it unset the code holds only the tag code. We didn't use the
  address from the request headers, because anyone can fake that and it would stop pages being built
  ahead of time.
- **Clean up.** The `placeholder-note` component is gone, along with the "Planned" block on the
  website's `/tag` page and the line about tags on the `/screens` page.

How the code is split:

- `mobile/src/lib/qr.ts`: what goes in the code, and reading it back (`tagQrText`, `parseTagQr`).
- `mobile/src/lib/qr-code.ts`: the squares, the SVG path and the print page.
- `mobile/src/components/qr-tag.tsx`: the card on the record screen.
- `web/src/lib/tags.ts` and `web/src/components/tree-tag.tsx`: the same thing for the website.

### Automated checks

| Check | Result |
| --- | --- |
| Jest (`npx jest --no-cache`) | 32 suites, 722 tests, all pass |
| Mobile `npx tsc --noEmit` | No errors |
| `npx expo lint` | No problems |
| `npx expo-doctor` | 21 of 21 |
| Website `npx tsc --noEmit` and `npm run lint` | No problems |
| Website production builds | 3 builds with different `SITE_URL` values, all finished |
| `npm audit` on the phone app | 51 (7 low, 42 moderate, 2 high), the same as before this item |
| `npm audit` on the website | 16 moderate, none of them with `--omit=dev` |

The SQL tests weren't run again because this item changes no SQL. CI runs them on the merge.

Some of the new Jest tests read the codes back with `jsQR`, including one with a block rubbed off
and one that reads the path actually drawn on the card, so a mistake in how it's drawn would fail
them.

### What we tried

| Test | What happened |
| --- | --- |
| Synced record, waiting for review | Card shows, screenshot reads as the link to its `/tag` page |
| Open that link while it's waiting | 404 with "No plant with that tag yet", as the note says |
| Press Print this tag | Print window opens, A4, 1 page, tag at the top left with the cut line |
| Read the print preview | Reads as the same link, from the full screenshot and an enlarged crop |
| Close the print window with its X | Back on the record, no error, nothing in the Metro log |
| Press print again after closing | Window opens again |
| Dark mode | Tile stays black on white and still reads |
| Officer approves, then Sync now | Note changes to the public page one, link gives 200 with the plant's name |
| Rejected record | Code still shows, note says the website has no page for it |
| No signal, new record | Code shows straight after saving with the amber warning, and it reads |
| Tag clash, sync after signal comes back | Red reason and no code, and a screenshot reads nothing |
| Press Get a new tag on that record | New code uploads by itself, card comes back and reads as the new link |
| Website `/tag` in simulator Safari | Reads as the link for the mock tag |
| Website plant page in simulator Safari | Reads as its own link, page gives 200 |
| Website home page, the big tag | Reads as the link for the mock tag |
| Build with no `SITE_URL` | The `/tag` page's code reads as the tag code only |
| Build with an `https://` address and a trailing slash | Reads as a clean link |
| Build with a plain `http://` address | Refused, reads as the tag code only |

The website's `/tag` page is built ahead of time, so `SITE_URL` has to be set before the build. The
[website README](../../web/README.md) says so.

### What we found and fixed

- **A fake pattern on the website looked real.** Anyone pointing a phone at it got nothing. Now it's
  a real code.
- **`react-native-svg` has no `shapeRendering` setting.** Without it, squares at fractions of a
  point can show thin lines between them. The card now draws each square at a whole number of
  points.
- **Links without the NNP part counted as tags.** A link to a blog's `/tag/nature` page was read as
  a tag, because "nature" is 6 letters. A link now needs the NNP part too. That was there from item
  6, and it only mattered once real tags were on the way.

### Not tested

- **A printed tag.** The proposal's target is that "at least 95% of printed test tags scan within 3
  seconds, in sun and in shade", and its test is printing a set of laminated tags and scanning each
  with at least two phones outdoors. None of that has been done. It needs a printer, a laminator and
  real phones. The code has only been read by `jsQR` on screenshots.
- **A real printer.** We only got as far as the print window and its preview.
- **A real camera.** The simulator has none, and Expo Go's camera is refused there, so the app's own
  scanner hasn't read one of these tags. The reading side is covered by Jest and by item 6.
- **Android.** That includes its print window, which behaves differently: closing it can't be told
  apart from printing.
- **A real phone**, hosted Supabase and a deployed website. A link can only work for real once the
  site is deployed and `SITE_URL` and `EXPO_PUBLIC_SITE_URL` are set.
- **A screen reader.**

### Known limits

- **Tags are made in the forest but can't be printed there.** A botanist can see the code with no
  signal, but printing needs a printer. Pre-printed tags are one way round it, but `tag_code` is
  made from the record's ID, so that would need new work. See [the improved
  workflow](../innovation/improved-workflow.md).
- A tag code isn't checked until the record uploads. If it clashes with another plant, a tag printed
  before that is wrong, and the botanist gets a new one. The warning on the card says this.
- One tag prints at a time. There's no sheet of many tags.
- The print window takes a few seconds to appear, about 5 in the dev build on the simulator, with
  nothing on screen in that gap. A second press does nothing while it's opening.
- A printed tag can't change later, so `EXPO_PUBLIC_SITE_URL` needs setting before real tags get
  printed. A tag made without it holds only the code.
- The tag's link leads to a public page with the species name once an officer approves it, so a tag
  on a protected plant still gives that away. The Sarawak Forestry Corporation has to decide about
  that (see [the limitations doc](../innovation/ground-truthing-limitations.md)).
