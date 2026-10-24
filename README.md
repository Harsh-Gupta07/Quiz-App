# SCALive Quiz Arena

A real-time classroom quiz platform for **SCALive (Sharma Computer Academy, Bhopal)**. Students join on their phones by scanning a QR code. The instructor runs the quiz from a laptop while a projector shows the live questions, the timer, the answer reveal, the leaderboard and the final winners podium.

**Flow:** Create quiz → Display QR → Students join → Admin starts → Question timer → Answer reveal → Live leaderboard → Next question → Final winners

| Interface | Route | Used on |
|---|---|---|
| Home / join by code | `/` | Phones |
| Student | `/join/:code` | Phones (mobile-first) |
| Presentation (16:9, read-only) | `/present/:sessionId` | Projector / YouTube live |
| Admin dashboard | `/admin` | Instructor laptop |
| Live session control | `/admin/session/:id` | Instructor laptop |
| Results and CSV export | `/admin/session/:id/results` | Instructor laptop |

**Stack:** React 19, Vite, TypeScript, Tailwind CSS 4, Motion, Lucide · Node.js, Express 5, Socket.IO 4 · MySQL 8+ with Prisma 6 · qrcode.react · canvas-confetti.

---

## 1. Quick start (local development)

Requirements: **Node.js 20+** and a MySQL 8+ database (local or hosted).

```bash
npm install                      # installs everything (both workspaces)
cp .env.example .env             # then set ADMIN_PASSWORD and SESSION_SECRET

npm run db:migrate               # create tables
npm run db:seed                  # add the 20 Claude AI workshop questions
npm run dev                      # API on :4000 + web app on :5173
```

Open **http://localhost:5173/admin** and log in with your `ADMIN_PASSWORD`. In development the password defaults to `scalive-admin` if none is set.

Set `DATABASE_URL` in `.env` to the MySQL connection string before running migrations.

### Testing with real phones on the same Wi-Fi

When you open the app as `localhost`, the QR code automatically uses your laptop's **Wi-Fi IP** (for example `http://192.168.1.17:5173`), and a notice appears on the lobby screen.

- The phones must be on the **same Wi-Fi** as the laptop.
- The first time, Windows may ask whether Node.js can accept connections. Choose **Allow** for private networks. If phones cannot connect, allow ports 5173 and 4000 in Windows Defender Firewall.
- Some public, college or guest Wi-Fi networks block device-to-device traffic ("client isolation"). For those, deploy publicly (section 4).

---

## 2. Commands

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch, :4000) + Vite dev server (:5173, LAN-accessible, proxies `/api` and `/socket.io`) |
| `npm run db:migrate` | Apply Prisma migrations (`prisma migrate deploy`) |
| `npm run db:transfer` | Copy and validate all data from `SOURCE_DATABASE_URL` (PostgreSQL) into the empty MySQL database |
| `npm run db:migrate:dev` | Create a new migration after editing `schema.prisma` |
| `npm run db:seed` | Seed the 20-question "Mastering Claude AI" quiz (idempotent) |
| `npm run build` | Build the server (`server/dist`) and the client (`client/dist`) |
| `npm start` | Apply migrations, then start the production server (serves the API, WebSockets and the built app on one port) |
| `npm test` | Unit tests: scoring, state machine, leaderboard ordering, import, CSV safety |
| `npm run test:integration` | End-to-end test against a real server and DB: 1 admin, 1 presentation screen, 5 students |
| `npm run typecheck` | TypeScript check for both workspaces |

---

## 3. Running a live workshop

1. **Admin → Quizzes → Start live session.** Pick a **10 s or 15 s** timer and choose whether to lock new registrations when the quiz starts (the default).
2. Click **Presentation** (or press **P**) and drag that window to the projector. Press **F** for full screen. It shows the QR code, the 6-character code, a live player counter and joining names.
3. Students scan, type their **full name** (roll number optional) and see *"You're In! Waiting for the Quiz to Begin."*
4. Press **Enter** to start. Every screen shows "Get ready" for 3 seconds, then Question 1 appears on the projector and all phones at the same moment.
5. When the server timer reaches 0, every screen shows **Time's Up!** You control the pace from there:

| Stage | Press **Enter** to… |
|---|---|
| Lobby | Start the quiz |
| Time's Up | Reveal the correct answer, answer counts per option and the **Fastest Finger** |
| Answer reveal | Show the animated **Top 10 leaderboard** |
| Leaderboard | Start the next question, or show the **Final Winners** after the last one |

Enter does nothing while a question is running or counting down. Each command carries the state version it was issued for, and the server rejects stale ones, so a double-pressed Enter or two open admin tabs can never skip a stage.

**Other shortcuts on the control page:** **E** ends the current question early · **P** opens the presentation · **H** hides the correct answers on your laptop (useful if your own screen is visible to the class).

If the presentation window is opened in a browser where you are logged in as admin, **Enter works there too**. No controls or answers are ever drawn on that screen.

**During the session you can also:** watch who is online or offline and who has answered, remove a participant (for example an inappropriate name), toggle registration on or off, end the quiz early, and open the results page.

**After the quiz:** the results page shows the podium, final rankings, accuracy, average correct-answer time and a per-question breakdown. Download **Final rankings CSV** (one row per student, with per-question points) or **All responses CSV**.

### Editing questions
The **Quizzes → edit** page lets you add, edit, duplicate, delete and reorder questions (exactly four options A–D, one correct answer, an optional explanation). Press **Ctrl+S** to save. You can **Import** questions from CSV or JSON (append or replace) and **Export** them as JSON.

CSV columns (a template can be downloaded in the import dialog):
```csv
question,option_a,option_b,option_c,option_d,correct,explanation
"Which technique includes worked examples?",Zero-shot,Few-shot,Role prompting,Chaining,B,"Few-shot = examples"
```
JSON:
```json
[{ "text": "…", "options": ["A text", "B text", "C text", "D text"], "correct": "B", "explanation": "…" }]
```
`correct` accepts `A`–`D`, `1`–`4`, or the exact option text.

To create a whole quiz from a file (title, timer and questions), use **Import quiz** on the dashboard. It accepts the same JSON that **Export JSON** produces, e.g. the ready-made [`quizzes/claude-workshop-quiz.json`](quizzes/claude-workshop-quiz.json) (20 workshop questions on Projects, Skills, Artifacts, Web Search, Connectors and MCP).

**Bundled quizzes:** every `.json` file in the `quizzes/` folder is added to the database automatically when the server starts, once per file. Deleting such a quiz later does not bring it back, and a quiz with the same title is never duplicated. To ship a new quiz to the live site, add its file to `quizzes/` and push. Set `SEED_BUNDLED_QUIZZES=false` to turn this off.

Sessions take a **snapshot** of the questions when the quiz starts, so editing a quiz never disturbs a game in progress or the results of past games.

---

## 4. Deployment

The app is a **single Node.js service**: the same server delivers the REST API, Socket.IO and the built React app. It uses a MySQL 8+ database.

> **Run exactly one instance.** Live game state (timers and connected sockets) is held in that server's memory and written through to MySQL. If the server restarts mid-quiz, it reloads in-progress sessions from the database and students reconnect automatically.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL connection string: `mysql://USER:PASSWORD@HOST:3306/DATABASE` |
| `SOURCE_DATABASE_URL` | only for transfer | Existing PostgreSQL connection string; never used by the running app |
| `ADMIN_PASSWORD` | ✅ in production | Password for `/admin` |
| `SESSION_SECRET` | ✅ in production | 32+ random characters used to sign admin cookies |
| `PUBLIC_URL` | ✅ in production | The public `https://…` address. **This is what goes into the QR code.** Never localhost. |
| `NODE_ENV` | | `production` on the server |
| `PORT` | | Default `4000` (most hosts set this automatically) |
| `TRUST_PROXY` | | Number of reverse proxies in front (default `1` in production) |
| `SEED_DEMO_QUIZ` | | `false` disables auto-adding the demo quiz to a brand-new empty database |
| `MAX_PARTICIPANTS` | | Per session, default `300` |
| `GET_READY_MS` | | "Get ready" countdown before each question, default `3000` |
| `JOIN_RATE_LIMIT` | | Join attempts per minute per IP, default `300` (a whole classroom often shares one public IP) |

### Option A — Render (Blueprint included)
1. Push this folder to a GitHub repository.
2. In Render, go to **New → Blueprint** and select the repo.
3. Enter your external MySQL `DATABASE_URL`, `ADMIN_PASSWORD`, and `PUBLIC_URL`.
4. No seeding step is needed: on its first start with an empty database, the server adds the 20-question Claude AI quiz automatically (set `SEED_DEMO_QUIZ=false` to turn this off).

The blueprint creates only the web service; provision MySQL separately and keep its backups enabled.

### Option B — Docker (any VPS, Railway, Fly.io, etc.)
```bash
docker build -t scalive-quiz .
docker run -p 4000:4000 \
  -e DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE" \
  -e ADMIN_PASSWORD="…" -e SESSION_SECRET="…" \
  -e PUBLIC_URL="https://quiz.scalive.in" \
  scalive-quiz
```
Put it behind HTTPS (Caddy, Nginx or the platform's proxy) and make sure the proxy forwards WebSocket upgrades. Most platforms do this by default.

### Option C — Any Node host plus hosted MySQL
```bash
npm ci --include=dev && npm run build   # build
npm start                               # migrate + run (set the env vars above)
```

### Option D — Offline classroom LAN (no internet)
Run `npm run build` and then `npm start` on the instructor laptop with `NODE_ENV=production`. Students on the same Wi-Fi or hotspot open `http://<laptop-ip>:4000`, which the QR code uses automatically. Login cookies work over plain HTTP on a LAN.

---

## 5. One-time PostgreSQL to MySQL transfer

1. Stop the application briefly so PostgreSQL cannot change during the final copy, and take a PostgreSQL provider backup/snapshot.
2. Create an **empty** MySQL 8+ database with `utf8mb4` support.
3. Put the real URLs in `.env` as `SOURCE_DATABASE_URL` (old PostgreSQL) and `DATABASE_URL` (new MySQL). Do not commit `.env`.
4. Run `npm run db:migrate` to create the MySQL tables.
5. Run `npm run db:transfer`. The copier reads PostgreSQL in a repeatable, read-only transaction, writes MySQL in one transaction, refuses a non-empty target, and rolls back if any table count differs.
6. Start the app and verify quiz, session, participant, response, and results screens. Keep the PostgreSQL snapshot until that check is complete.

The running application only uses `DATABASE_URL`. New quizzes, sessions, participants, and answers are automatically written into the migrated MySQL tables through Prisma.

---

## 6. How scoring and timing work

**Fastest Finger First:**

```
Correct answer points = 500 + floor(500 × remaining time / total time)
Wrong answer or no answer = 0
```

| 10-second question | Points |
|---|---|
| Correct after 1 s | 950 |
| Correct after 3 s | 850 |
| Correct after 5 s | 750 |
| Correct after 9 s | 550 |

The calculation uses milliseconds, so an answer after 1.234 s scores 938.

- **The server is the only clock that counts.** When a question starts, the server records `questionStartedAt` and `questionEndsAt`. An answer's response time is *server receive time − server start time*. Student phone clocks are never trusted.
- Answers received after `questionEndsAt`, or after the instructor ends the question, are rejected with *"Time's up!"* and score nothing.
- Timers on screens are synchronised to the server clock with an NTP-style round-trip measurement, so a phone with a wrong clock still shows the right countdown.
- One answer per student per question is enforced twice: by an in-memory check that runs synchronously (simultaneous double-taps cannot both pass) and by a database unique constraint `(participantId, questionIndex)`.

> **About network latency:** response times are measured when the answer *reaches the server*. A student on a slow mobile connection may lose some tens or hundreds of milliseconds compared with a student on fast Wi-Fi, and the question also reaches each phone at slightly different moments. This is the same trade-off every live quiz platform makes. Trusting device clocks instead would allow cheating. For a classroom on one Wi-Fi network the differences are small. Mention it to students if a Fastest Finger result is very close.

**Leaderboard tie-breaking** (deterministic):
1. Highest total points
2. More correct answers
3. Lower cumulative response time on correct answers
4. (Final fallback, practically never needed) earlier join time

**Fastest Finger** for a question is the correct answer with the lowest response time. Exact ties go to the student who joined earlier.

Scores are only published at **reveal** time. During a question, students and the projector see who has answered but never who was right.

---

## 7. Architecture

```
client/                      React app (Vite)
  src/pages/StudentPage.tsx  mobile join + play flow
  src/pages/PresentPage.tsx  1920×1080 projector stage (scaled to fit)
  src/pages/admin/*          login, dashboard, quiz editor, live control, results
  src/components/*           timer ring, leaderboard, podium, stage, UI kit
server/
  prisma/schema.prisma       Quiz, Question, QuizSession, Participant, Response
  prisma/seed*.ts            20 seeded Claude AI questions
  src/game/stateMachine.ts   pure state machine (every transition validated)
  src/game/scoring.ts        Fastest Finger First formula
  src/game/standings.ts      leaderboard ordering, rank changes, fastest finger
  src/game/engine.ts         SessionRuntime: server-authoritative game + DB write-through
  src/realtime.ts            Socket.IO rooms, auth, rate limits, broadcasts
  src/routes/*               REST: auth, quizzes, sessions/results/CSV, public
  src/shared/protocol.ts     types shared with the client
```

**Session states (server-controlled):**

```
LOBBY → NEXT_QUESTION (3 s get-ready) → QUESTION_ACTIVE → TIME_UP → ANSWER_REVEAL → LEADERBOARD
                         ↑__________________________________________________________|   (next question)
LEADERBOARD (last question) → FINISHED          any state → FINISHED (End quiz)
```

- **Rooms:** `s:<session>` (students and presentation, public data only), `a:<session>` (admins), `p:<participant>` (personal score updates).
- **No answer leaks:** public state contains the correct option only in `ANSWER_REVEAL` and `LEADERBOARD`. This is checked by the integration test.
- **Reconnects:** on joining, a student gets a random secret token, and only its SHA-256 hash is stored. The token stays in the phone's `localStorage`, so after a refresh, network drop or browser restart the student is restored with the same answers and points. To prevent duplicate entries, names must be unique within a session (case- and space-insensitive), each participant is tied to one token, and new registrations lock when the quiz starts. Already registered students can always reconnect.
- **Resilience:** state is written to MySQL on every transition and answer. After a server restart, in-progress sessions are reloaded and their timers re-armed.

### Security
- Admin password compared in constant time. Login is rate-limited (10 attempts per 15 min per IP). Admin access uses a signed, `HttpOnly`, `SameSite=Lax` cookie with a 12 h lifetime, `Secure` over HTTPS. Socket admin commands re-verify the cookie on every call.
- Input validation with zod on every write. Names are cleaned of control and invisible characters.
- Rate limits on joins, code lookups and per-socket events. Payload size limits on HTTP and sockets.
- Helmet security headers with a strict Content Security Policy (scripts from self only).
- CSV exports are protected against spreadsheet formula injection.
- The presentation screen is read-only and never receives unrevealed answers.

---

## 8. Testing

```bash
npm test                    # 38 unit tests
npm run test:integration    # full live flow against the real server + DB
```

The integration test (`server/tests/integration.test.ts`) simulates **1 admin, 1 presentation screen and 5 students** and verifies:

1. Admin APIs require login and join codes work (including invalid codes).
2. The participant count updates live on the admin and presentation screens; duplicate names are rejected.
3. Starting a question reaches every client, and no correct answer is sent before the reveal.
4. The server timer closes submissions and late answers are rejected.
5. A participant cannot answer twice, even with two simultaneous submissions.
6. Wrong answers and missing answers get 0 points.
7. Faster correct answers get more points, and Fastest Finger is correct.
8. Leaderboard order is correct after each question.
9. Refreshing (reconnecting with the token) keeps the score; registrations are locked after the start.
10. Enter is ignored during a question, and a double Enter only advances once.
11. Final winners match the stored database results, and the per-student points sum to the stored totals and CSV.

---

## 9. Seeded question bank

**"Mastering Claude AI — Workshop Quiz"** has 20 medium-difficulty, mostly scenario-based questions covering zero-shot and few-shot prompting, role prompting, prompt structure and context, web search with citations, Projects, Skills and SKILL.md, Artifacts, Connectors, MCP, combined real-world workflows, and safe handling of connected apps (prompt injection and least privilege). Correct answers are spread evenly across A–D, and each question has a short explanation. It avoids fast-changing facts such as model names or pricing. All questions are editable in the admin panel.
