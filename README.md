# NURSE RUSH

A 3D browser game built for a nursing event on **Thursday, 19 November 2026**.
Endless runner with a hospital identity, an SBAR question round, and a
120-second shift to survive.

**Developed by Wejdan Boharam.**

---

## Run it locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Vite prints a local address (usually `http://localhost:5173`) and a network
address. Open the network address on an iPad or iPhone on the same Wi-Fi to
test touch controls on a real device.

To check a production build before deploying:

```bash
npm run build
npm run preview        # serves dist/ on http://localhost:4173
```

---

## Deploy to Vercel using GitHub

The repository is self-configuring: `vercel.json` already sets the install
command, build command, output directory, routing and cache headers, so you
do not have to type any settings into the dashboard.

### Step 1 — put the project on GitHub

Install Git if you don't have it, then from inside the project folder:

```bash
git init
git add .
git commit -m "NURSE RUSH"
git branch -M main
```

Create an **empty** repository on github.com (no README, no .gitignore —
this project already has both), then connect and push:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

> `node_modules/` and `dist/` are in `.gitignore` on purpose. Vercel installs
> and builds from source, so they must **not** be committed. If GitHub shows
> `node_modules`, remove it with `git rm -r --cached node_modules` and commit
> again.

### Step 2 — import the repository into Vercel

1. Sign in at **vercel.com** with your GitHub account.
2. Click **Add New… → Project**.
3. Find your repository in the list and click **Import**. If it isn't listed,
   click **Adjust GitHub App Permissions** and grant Vercel access to it.

### Step 3 — confirm the settings and deploy

Vercel reads `vercel.json`, so the fields below should already be filled in.
Check they read:

| Field | Value |
| --- | --- |
| Framework Preset | **Vite** |
| Root Directory | `./` (leave as is) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | **none needed** |

Click **Deploy**. The build takes roughly 30–60 seconds. When it finishes you
get a public URL like `https://nurse-rush.vercel.app`.

### Step 4 — check the deployed URL

Open the URL on a phone and on a laptop and confirm:

- the menu appears with the nurse and ambulances, and the footer reads
  **Developed by Wejdan Boharam**
- **Play** runs the cinematic, then the game
- the first question appears 25 seconds in
- sound works after the first tap

### Step 5 — make sure the link is actually public

If the URL asks for a Vercel login, Deployment Protection is switched on.
Go to **Project → Settings → Deployment Protection** and set **Vercel
Authentication** to **Disabled** for Production, then redeploy. This matters:
people at the event will open the link on their own phones.

### Updating the game later

```bash
git add .
git commit -m "what changed"
git push
```

Vercel rebuilds and redeploys automatically on every push to `main`. The
`index.html` cache header is set to revalidate, so returning visitors always
get the new build rather than a stale one.

### Optional — deploy from the command line instead

```bash
npm i -g vercel
vercel          # first run: answer the prompts, creates a preview deploy
vercel --prod   # production deploy
```

### What Vercel does and does not need

The game is fully static: no backend, no database, no API keys, no
environment variables, no login, and nothing is stored server-side. Best
score and the sound setting live in the visitor's own browser.

---

## What is in the box

```
nurse-rush/
├── index.html                  all screens (menu, HUD, question card, results, footer)
├── vercel.json                 deployment config
├── vite.config.js
└── src/
    ├── main.js                 boot, button wiring, QA handle
    ├── style.css               interface styling, including the developer footer
    ├── core/
    │   ├── Game.js             state machine, round timer, collisions, scoring
    │   ├── Audio.js            Web Audio synthesis - music and all sound effects
    │   ├── Input.js            swipe gestures + keyboard
    │   ├── Storage.js          localStorage best score and settings
    │   └── MeshUtils.js        geometry merging for mobile performance
    ├── data/questions.js       the 20 SBAR questions, answers and explanations
    ├── entities/
    │   ├── Nurse.js            procedural rigged character + 7 animations
    │   ├── Obstacles.js        ambulance, bed, wheelchair, cart, oxygen, boxes, arch
    │   ├── Collectibles.js     coins, cash, stethoscopes, first aid kits, supplies
    │   └── Particles.js        pooled particle bursts
    ├── intro/Cinematic.js      the scripted hospital intro
    ├── world/
    │   ├── Corridor.js         hospital corridor + ambulance bay (intro)
    │   ├── RunnerWorld.js      three-lane endless road, spawning, finish gate
    │   └── Textures.js         all textures, drawn on canvas at runtime
    └── ui/UI.js                every DOM update
```

---

## How the game works

### The round

| Rule | Value |
| --- | --- |
| Round length | exactly 120 seconds |
| Intro | excluded from the timer, and skippable |
| Questions per round | 2, drawn at random from the 20-question bank |
| Question 1 | exactly 25 s after gameplay starts |
| Question 2 | exactly 20 s after play resumes from question 1 |
| Time to answer | 30 seconds each, taken out of the 120 |
| Correct answer | +100 points, gameplay resumes |
| Wrong answer or no answer | immediate GAME OVER |
| Win | both answers correct **and** the clock reaches zero at the finish line |

The 120-second timer keeps running while a question is on screen — only the
nurse stops moving. The finish gate is placed so that, at the current speed,
she reaches it as the clock runs out.

### Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Change lane | swipe left / right | ← → or A D |
| Jump | swipe up, or tap | ↑, W or Space |
| Slide | swipe down | ↓ or S |

Swipes fire as soon as the direction is unambiguous rather than on finger
lift, which is what makes the controls feel responsive on a phone.

### Progressive speed

| Time | Tier | Speed |
| --- | --- | --- |
| 0–20 s | Normal | 13.0 |
| 20–40 s | Picking up | 15.5 |
| 40–60 s | Medium | 18.0 |
| 60–80 s | Fast | 21.0 |
| 80–100 s | Very fast | 24.5 |
| 100–120 s | Maximum | 28.0 |

As the tier rises the music gains layers and tempo, the HUD speed bar fills,
and obstacle rows arrive more often. Row spacing is tied to the *current
speed*, not the tier, so a faster tier never cuts the player's reaction time
below roughly eight tenths of a second.

### Obstacles and collectibles

Obstacles never end the run — they cost 50 points and slow the nurse for just
over a second, because the questions are the real challenge.

| Obstacle | How to clear it |
| --- | --- |
| Ambulance | change lane (cannot be jumped) |
| Hospital bed, wheelchair, supply cart, oxygen cylinders, equipment boxes | jump |
| Mobile imaging arch (spans all three lanes) | slide |

Rows are generated so at least one lane is always passable: at most two of
the three lanes are ever blocked, and the full-width arch is always clearable
by sliding.

| Collectible | Points | Coins |
| --- | --- | --- |
| Coin | 10 | 1 |
| Medical supplies | 30 | — |
| Cash | 50 | 5 |
| Stethoscope | 75 | — |
| First aid kit | 100 | — |

---

## Confirmations requested in the brief

**All 20 questions are imported.** `src/data/questions.js` contains Q01–Q20
exactly as written in `SBAR_20_MCQ_Question_Bank.docx` — question text, all
answer options, the correct answer and the organiser's explanation. Nothing
was deleted and no clinical meaning was changed. 15 are multiple choice and 5
are True/False (Q02, Q11, Q12, Q18, Q20). A `validateBank()` check runs at
startup and logs to the console if the bank is ever edited into an invalid
state.

The two source review notes are carried over as comments in the data file:
Q04's wording ("patient's full name and Medical Record Number") and Q19's
retained answer should both be confirmed against the facility's current
approved policy before the event.

**Two different questions are selected per round.** `pickRoundQuestions()`
draws two distinct IDs and also avoids the last few questions used, so
consecutive rounds get different combinations. Answer options are reshuffled
every time a question appears — the correct-answer flag travels with the
option text, so the mapping always survives the shuffle. The answer key is
never sent to the interface before the player answers.

**The 120-second timer works correctly.** Verified in an automated run: the
timer starts at 2:00 after the intro, keeps counting while a question is open,
turns red under 15 seconds, and the round resolves at zero. The intro does not
touch it.

**Mobile compatibility check.** Tested at iPhone portrait (390×844), iPhone
landscape (844×390) and iPad (1024×768) with touch events, plus desktop.
Results:

- Touch swipes and tap-to-jump work in all three; the question card fits on
  screen with the game still visible above it.
- Renderer quality adapts automatically: shadows are disabled on mobile, the
  pixel count is capped so retina screens stay smooth, and the particle budget
  is reduced on low-core devices.
- The camera's field of view widens on tall, narrow screens so all three lanes
  stay visible in portrait.
- The developer footer is visible on every screen at every size, and sits
  above the iOS home indicator via `safe-area-inset`.
- Draw calls run at roughly 320–385 per frame and triangles at about 45,000,
  with geometry and texture counts flat across a full round (no leak). Static
  geometry is merged by material at build time — this took the frame from
  about 720 draw calls down to about 350.
- Audio is unlocked on first tap, as iOS requires.

---

## External assets and licences

**There are none.** Every visual and every sound in this project is generated
by the code at runtime:

| Thing | How it is made | Licence |
| --- | --- | --- |
| Nurse character | Three.js primitives on a hand-built skeleton, animated by code (`src/entities/Nurse.js`) | original work, part of this project |
| Ambulances, beds, wheelchairs, carts, cylinders, boxes, imaging arch | Three.js primitives (`src/entities/Obstacles.js`) | original work |
| Coins, cash, stethoscopes, first aid kits, supplies | Three.js primitives (`src/entities/Collectibles.js`) | original work |
| Hospital corridor, ambulance bay, road, buildings | Three.js primitives (`src/world/`) | original work |
| All textures — floor tiles, wall panels, asphalt, hazard stripes, facades, signage, sky, finish flag | drawn with Canvas 2D at runtime (`src/world/Textures.js`) | original work |
| Music and every sound effect | synthesised with the Web Audio API (`src/core/Audio.js`) | original work |
| Fonts | system fonts (Trebuchet MS / Segoe UI / Helvetica Neue / Arial) | no download, no licence needed |

The only third-party dependency is **Three.js** (`three@^0.169.0`), under the
MIT licence, and **Vite** as a build tool (MIT). No Subway Surfers characters,
branding, assets or code were used — the visual identity is original and
nursing-themed.

---

## Known limitations

Worth knowing before the event, and all deliberate trade-offs for the
timeline:

- **The character is procedural, not a sculpted model.** The brief allowed an
  appropriately licensed animated asset or a stylised procedural character;
  the procedural route was taken so the project ships with zero licensing
  questions. The seven animations (idle, walk, run, jump, slide, lose,
  victory) are hand-authored pose sets that blend into each other, rather than
  motion-captured clips.
- **No leaderboard.** Best score, coins, shifts survived and the sound setting
  are stored locally in the browser, per device, as the brief specified. If the
  event wants a shared leaderboard, that needs a backend.
- **Two questions per round out of twenty.** This is as specified. Over a day
  of play the bank cycles well, but a single player doing many rounds will see
  repeats eventually.
- **Audio needs one tap first.** Browsers block sound until the user
  interacts; the first tap on Play unlocks it. Nothing to do, just expect
  silence on the loading screen.
- **Very old devices.** The game targets WebGL-capable browsers from roughly
  2018 onward. An original iPad Air or an Android device without WebGL will
  not run it.

---

## Running the game at the event

A few practical notes:

- Use the **Play Again** button between players — it skips the cinematic and
  restarts immediately, which keeps a queue moving.
- **How to Play** is worth showing once to each new player; the jump and slide
  rules are the only thing people get wrong.
- The sound toggle is on the main menu and the setting is remembered.
- In portrait on a phone the game nudges towards landscape once, but it is
  fully playable either way.
- Deploy to Vercel in advance and open the URL on each device — no install, no
  app store.

---

Developed by **Wejdan Boharam**.

---

## Automated acceptance test

`qa-acceptance.mjs` is the Playwright suite used to sign the build off. It runs
**104 checks** covering every item on the acceptance checklist: the cinematic
intro beat by beat, lane/jump/slide controls on keyboard and touch, collision
outcomes, all five collectible types, the whole question bank, the 120-second
round, the six speed tiers, the finish line, both end screens, five viewports
and the developer footer. It fails on any console or page error.

```bash
npm i -D playwright && npx playwright install chromium
npm run build && npm run preview                    # terminal 1
URL=http://localhost:4173/ node qa-acceptance.mjs   # terminal 2
```

`qa-test-flow.mjs` is a shorter smoke test of the same flow.

### Deployment readiness check

Run before pushing a release. It builds from a clean copy, serves `dist/`
through a host that applies `vercel.json` the way Vercel does (filesystem
first, then rewrites, then headers), and boots the game in a cold browser
from the root and from deep URLs:

```bash
node qa-vercel-sim.mjs ./dist ./vercel.json 4300 &
URL=http://127.0.0.1:4300/ node qa-deploy-smoke.mjs
URL=http://127.0.0.1:4300/ node qa-acceptance.mjs
```

Verified on the production build:

- `npm ci && npm run build` from a clean clone produces byte-identical output
- the deployed page makes exactly **three** requests — `index.html`, one CSS
  file, one JS file — and nothing else; there are no 404s
- hashed assets are served `immutable` for a year, `index.html` revalidates
- the game boots from `/`, `/index.html` and any deep path
- no development dependency, dev server, HMR client or `localhost` reference
  survives into the bundle

### Fixed during deployment preparation

| Issue | Fix |
| --- | --- |
| **Blank page on any sub-path.** `base: './'` emitted relative asset URLs, so a visit to e.g. `/play/` made the browser request `/play/assets/index-*.js`; the SPA rewrite answered that with `index.html`, the browser refused to run HTML as JavaScript, and the game never started. Invisible in `vite preview`, which only serves from the root. | `base: '/'` — asset URLs are absolute and no longer depend on the path the visitor arrived on |
| No cache policy: hashed assets were re-downloaded on every visit, and `index.html` could be served stale after a redeploy | `Cache-Control` headers in `vercel.json`: assets `immutable` for a year, HTML `must-revalidate` |
| Install command unpinned | `installCommand: "npm ci"` so deploys use the committed lockfile exactly |
| Node version unstated | `engines.node: ">=18"` in `package.json` |

### Fixed during acceptance testing

| Issue | Fix |
| --- | --- |
| Footer rendered as "DEVELOPED BY WEJDAN BOHARAM" — CSS was force-uppercasing the credit | Removed `text-transform`; it now renders exactly **Developed by Wejdan Boharam** |
| Finish line could be unreachable: the gate's position was a one-shot distance guess made when it spawned, so a collision slow-down afterwards meant the clock expired before the player crossed it | The gate is now held at a fixed *time* from the nurse and self-corrects every frame, so the line is always crossed (~1.8 s before the round ends) |
| On a short landscape phone the menu buttons overlapped the footer — the logo was scaled from viewport *width* | Logo scales from viewport height below 430 px; menu can scroll as a fallback |
| On a short landscape phone the question card filled almost the whole screen, hiding the game | Card and its contents tightened at that breakpoint; the environment stays visible above it |
| Menu and answer buttons fell to 41 px on short landscape, under the 44 px touch target | `min-height: 44px` on both |
| A down-swipe made while airborne leaked into the next round and caused an unasked-for slide | `pendingSlide` is cleared on round reset and when a question opens |
| Play Again built the entire hospital corridor and tore it down a moment later, causing a hitch between rounds | Skipping the intro now bypasses corridor construction entirely |
