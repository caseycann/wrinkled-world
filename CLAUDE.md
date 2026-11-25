# CLAUDE.md — Wrinkled World Web Tracker

## What this project is

A classroom tracker for **Wrinkled World**, a two-week economy game played by 5th graders.
Eight student countries (A/1 through H/8) earn money, buy tokens and survive crises.
The tracker shows the game's money, token counts, current stage, active crises and a live
dice-tower camera on a projector. One teacher at a time enters data for the countries. The app does not record which teacher.

**In scope:** each country's Federal Reserve (money) and its four token counts, stage/round
control with undo, crisis tracking, the dice cam, and a teacher console for entering changes.

**Students do the math.** The app never calculates income, crisis damage, prices, fines, loans or
auction results. Students roll, work out the numbers, and one teacher types in the whole-number
changes. Do not add dice inputs, calculators or an auction tool.

**Out of scope:** Asset placement, agreements, Council rulings, the Education auction (run live in
the room) and student accounts. These stay on paper or in the room. Do not add them unless asked.

## Stack

- Next.js (App Router) + React + TypeScript (`strict: true`)
- Tailwind CSS for styling
- SWR for polling `/api/state` from the browser
- zod for validating API input and Airtable records
- Vitest for unit tests
- Airtable REST API, called with `fetch` from server code only (no Airtable SDK)
- Hosted on Vercel

Do not add dependencies beyond these without asking first.

## Commands

```bash
npm run dev        # local dev server (mock data by default)
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
```

Run `typecheck`, `lint` and `test` before saying any task is done.

## Layout

```
app/
  page.tsx                  redirects to /display
  display/page.tsx          projector view (read-only, plus the PIN-unlocked stage button)
  teacher/page.tsx          teacher console (PIN-protected)
  api/state/route.ts        GET  cached game state
  api/transactions/route.ts POST new ledger rows, or void one
  api/stage/route.ts        POST { action: "advance" | "undo" }
  api/crises/route.ts       POST add / solve a crisis
  api/refresh/route.ts      POST re-read Airtable into the cache
  api/auth/route.ts         POST PIN -> httpOnly session cookie; GET -> { unlocked }
lib/
  rules.ts                  EVERY game number and pure rules function (single source of truth)
  stage.ts                  pure Advance/Undo planners (which Stage Log / snapshot rows to write)
  crises.ts                 pure crisis logic: card length, on-the-board check, add/solve planners
  airtable.ts               the ONLY module that talks to Airtable
  schema.ts                 table names, field names, zod schemas
  state.ts                  builds the cached GameState from Airtable or mock data
  mock.ts                   mock data, plus an in-memory store that write routes change in mock mode
                            (country totals are rolled up from non-voided mock transactions, like Airtable)
  transactions.ts           pure Save planner for the teacher console (checks rows against fresh totals)
  auth.ts                   PIN check helpers
components/                 UI components (display/, teacher/, shared/)
tests/                      Vitest tests
```

## Hard rules

1. **The Airtable token is server-only.** Read `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` only in server
   code. Never prefix them with `NEXT_PUBLIC_`, never send them to the browser, and never log them.
2. **The browser never calls Airtable.** Pages call `/api/*` only.
3. **Stay under Airtable's rate limit.** The workspace is on a Business plan (no monthly call cap), but
   Airtable allows 5 requests per second per base.
   - `/api/state` caches the Airtable read for 2 seconds, so any number of screens costs one read.
     A write, a stage change or `POST /api/refresh` clears the cache immediately.
   - Never fetch per country in a loop. Batch writes: up to 10 records per request.
   - On HTTP 429, back off before retrying (Airtable asks clients to wait 30 seconds).
4. **Develop against mock data.** `AIRTABLE_MODE=mock` is the default in development. Use the test base
   only when asked. Never point development at the classroom base.
5. **The ledger is append-only.** Every change to a country is a new Transactions row. Never overwrite
   a total and never delete a Transactions row. To undo one, set its `Voided` checkbox.
6. **Game numbers live only in `lib/rules.ts`.** Do not change a number unless the user says so. If this
   file and the code disagree, stop and ask.
7. **Every write route checks the teacher PIN server-side.** `TEACHER_PIN` is an env var. Use an httpOnly,
   secure session cookie. The display is read-only; its stage button works only after PIN unlock.
8. **The camera stays local.** Use `navigator.mediaDevices.getUserMedia` to show the dice cam. Never record,
   upload or store video or frames. Handle "no camera" and "permission denied" with a clear on-screen message.
   Remember the chosen camera per computer in `localStorage`, wrapped in try/catch.
9. **No student personal data.** Countries are stored by letter, number and country name only. Never store
   student names.
10. **Don't change the Airtable schema** (tables or fields) without asking. Field names appear only in
    `lib/schema.ts`.

## Airtable schema

Field names below are exact (capitals and spaces). Each table's first field is its primary field.

| Table | One row per | Fields (type) |
| --- | --- | --- |
| Countries | country (8) | Letter (text, primary), Number (number), Name (text), Council (single select: Ratification, Finance, Justice, Defense), Transactions (link, inverse), Round Snapshots (link, inverse), Crises (link, inverse); rollups of non-voided Transactions: Federal Reserve, Military, Health, Education, Standard of Living |
| Transactions | change to one country | Label (formula, primary), Country (link, single), Round (number), Stage (single select), Type (single select), Money Change, Military Change, Health Change, Education Change, Standard of Living Change (numbers, may be negative), Note (long text), Entered By (single select, unused), Voided (checkbox), Created (created time) |
| Stage Log | stage change | Label (formula, primary), Round (number), Stage (single select), Started At (date with time), Undone (checkbox), Entered By (single select, unused), Created (created time) |
| Round Snapshots | country per finished round | Label (formula, primary), Round (number), Country (link, single), Federal Reserve (number, may be negative), Military, Health, Education, Standard of Living (numbers) |
| Crises | crisis card (19) | Name (text, primary), Card Number (number), Countries Hit (link, multiple), Started Round (number), Rounds (number; blank = until solved), Status (single select: Active, Solved; blank = never drawn), Solved Round (number), Note (long text) |

Stage options: Session 0, Stage Setting, Plan, Act/Negotiate, Report, Reaction, Consequences.

Never write to formula, rollup, created-time or inverse link fields; Airtable computes them.

The app does not track who entered a change. It never reads or writes the `Entered By` fields;
they can be deleted from the base later (a schema change, so ask first).

Transaction types: Starting roll, Income, Purchase, Auction, Fine, Crisis damage, Gift, Loan,
Repayment, Correction, Global Boom. The type is a label for the history only; the app never
calculates anything from it.

All money is stored as **whole billions** (integer). `$12B` is stored as `12`.

## Game rules (`lib/rules.ts` must match this)

**Tiers.** 0 tokens = Tier 0; 1–5 = Tier 1; 6–10 = Tier 2; 11–15 = Tier 3; 16 or more = Tier 4.
There is **no upper limit** on tokens.

| Tier | Strength die (Military) | Crisis die (Health) | Income die (Education) |
| --- | --- | --- | --- |
| 0 | none | exiled (Health 0) | none, income $0 |
| 1 | D4 | D20 | D4 |
| 2 | D6 | D12 | D6 |
| 3 | D12 | D8 | D12 |
| 4 | D20 | D4 | D20 |

The display shows each country's tier badges and which dice it rolls, so students know what to roll.
The app shows dice; it never rolls them or uses the results.

- **Money** is a whole number of billions and may go below 0 (that country has a loan).
- **Tokens** are whole numbers and never go below 0.
- **Warnings on the display:** Health at 3 or below; money below 0; "Exiled" at Health 0.
- **Class goal (tracked part):** every country has 16+ Health, Education and Standard of Living, and no
  crisis is active. Assets are tracked on paper.

Prices, income, fines, loans and the auction are in the game's rulebook, not in this app. Do not add them
to `lib/rules.ts`.

## Stages and rounds

Round 0 is Session 0 and has a single stage, `Session 0`. Every round from 1 on runs these stages in order.
There is **no round limit** and **no end-game step** in the app: the Game Master ends the game in the room
when the win conditions are met.

| Stage | Minutes | Room |
| --- | --- | --- |
| Stage Setting | 5 | Media Lab |
| Plan | 5 | Media Lab |
| Act/Negotiate | 10 | CDL |
| Report | 10 | Media Lab |
| Reaction | 5 | CDL |
| Consequences | 10 | Media Lab |

- The current stage is the newest Stage Log row that is not undone.
- **Advance** adds a Stage Log row for the next stage. From Consequences, it moves to the next round's
  Stage Setting and, in the same action, writes 8 Round Snapshots rows for the round just finished.
  Round 9 Consequences advances to Round 10 like any other round.
- `POST /api/stage` takes `{ action, expect }`, where `expect` is the current Stage Log row ID the button
  showed. If the stage has changed since, it writes nothing and returns 409 (protects against double taps
  and two teachers).
- **Undo** marks the newest non-undone Stage Log row `Undone`, sets the restored row's `Started At` to now
  (so its timer restarts), and, if the undone step was a round rollover, deletes that round's 8 snapshots.
  Undo can be repeated.
- The UI asks for confirmation only when a new round starts ("Start Round 5?"), including Session 0 → Round 1.
- The countdown is computed from `Started At` plus the stage's minutes. **Never auto-advance.** At 0,
  play a chime and pulse the button. The countdown corrects for the display computer's clock using
  `serverNow` from `/api/state`.

## Crises

The 19 cards live in the Airtable Crises table, one row per card, so teachers can rename, renumber or
change lengths there. The app never writes Name, Card Number or Rounds. A number in `Rounds` makes a card
fixed-length (currently Anti-war Protests 3 rounds, Automation Wave 2, Stolen Warheads 2, Election Fraud 1);
a blank `Rounds` means it runs until a teacher marks it solved.

- **Add** fills in that card's row: Countries Hit, Started Round = current round, Status = Active, Note,
  and clears Solved Round. A card already on the board can't be added again; a solved or finished card can
  be drawn again (its row is reused, replacing its last use).
- **Solve** sets Status = Solved and Solved Round = current round. Any active crisis can be solved at any
  time, fixed-length or not. This is also how a crisis added by mistake is removed.
- A crisis whose Started Round is later than the current round (after an Undo) is hidden until play
  reaches that round again.

Nothing counts down in Airtable. For a Fixed rounds crisis, the app computes
`rounds left = Rounds - (current round - Started Round)`; at 0 or below it is over and no longer shown.
Because this is computed, Undo needs no crisis changes. "Until solved" crises show
`Running for (current round - Started Round + 1) rounds` until Status is Solved.

## UI rules

- **Display:** designed for 1920×1080 with no scrolling, readable from the back of a classroom.
  Country money and token numbers at least 48px; labels at least 24px; the stage button at least 320px across.
  Eight country cards around the central stage button; crises strip at the bottom; dice cam panel that
  enlarges to full screen on click.
- **Color is never the only signal.** Token colors (Military red, Education blue, Health white with an
  outline, Standard of Living green) always come with a label or icon. Keep high contrast.
- Poll `/api/state` every 3 seconds with SWR and pause while the tab is hidden. Show "Updated N seconds ago".
  On an error, keep showing the last good data with a small warning.
- **Teacher console (one teacher at a time):** a grid with one row per country and five whole-number
  change fields (Money, Military, Health, Education, Standard of Living), a Type dropdown (Income, Purchase,
  Auction, Fine, Crisis damage, Gift, Loan, Correction) and a Note, both per row. Each field shows a live preview of the
  new total, so students can check their own math against it. Refuse decimals and any change that takes a
  token count below 0. Save writes one Transactions row per changed country, in batches of up to 10.
  Add an activity feed of the last 20 rows with a Void button on each, a "Refresh from Airtable" button,
  and a crisis panel (add a card for chosen countries; mark solved). Use large touch targets.
- Student-facing words are plain and short. No developer jargon on the display.

## How to work in this repo

- Follow the roadmap phases in order: setup, rules + mock data, read API + ticker, stage button,
  teacher console, crises, dice cam, classroom test.
- For any change touching more than three files, or anything that changes rules or the schema, write a
  short plan first and wait for approval.
- Write unit tests for every function in `lib/rules.ts` and for stage logic. Always cover tier edges
  (0, 1, 5, 6, 10, 11, 15, 16, 25), input validation (decimals, blanks, totals below 0), round rollover,
  rollover past Round 9 (no game over), and repeated undo.
- Work one prompt at a time, following the prompt sequence in the roadmap doc. Don't start the next
  feature in the same session.
- Keep commits small, one feature each, with clear messages.
- Never commit `.env*` files or secrets.
- When a game rule changes, update `lib/rules.ts`, its tests and this file in the same change.
- If a game rule is unclear, ask instead of guessing.

## Definition of done

- `typecheck`, `lint` and `test` pass.
- The feature works in mock mode.
- No Airtable call happens from the browser, and no new timer polls Airtable.
- The display still fits 1920×1080 without scrolling.
- This file is still accurate.
