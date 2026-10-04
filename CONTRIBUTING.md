# How we work

## The rules

1. **Never commit straight to `main`.** `main` should always run.
2. Make a branch for each schedule item, named after the item number, for example `item-6-qr-scanner` or `item-14-plant-schema`.
3. Commit small and often, with a message that says what you did (`Add GPS capture to plant form`).
4. When it works, open a **pull request** into `main` and put the item number in the title, for example `Item 6: QR code scanner`.
5. **One other teammate reviews and approves** before it gets merged. This is part of our Definition of Done.
6. Pull `main` before you start work each day so you're not building on old code.

## With GitHub Desktop

- **Start an item:** Current Branch → New Branch → name it → Create Branch.
- **Save work:** tick the files on the left, write a summary at the bottom left, click **Commit to item-...**, then **Push origin**.
- **Get other people's changes:** switch to `main` → **Fetch origin** → **Pull origin**.
- **Finished:** click **Create Pull Request** (opens GitHub in the browser), add a reviewer, submit.
- **Reviewing someone's PR:** on GitHub open the PR → Files changed → Review changes → Approve (or Request changes).

## Definition of Done (from our proposal)

A schedule item is done when:

- It matches what is described in Scope and the Initial Release Schedule.
- It has passed its test cases and the results are recorded.
- Mobile features have also been tested offline and on both Android and iOS.
- The code has been reviewed by at least one other team member.
- No known critical or high severity vulnerabilities remain in it.
- It is documented.
- It has been demonstrated and signed off at the Sprint #1 or Sprint #2 Quality Review, or at the final demo.

## Never commit

- `.env` / `.env.local` files or any API key, password or token.
- `node_modules/` (already ignored).
- Real personal data or exact locations of endangered plants in test data.
