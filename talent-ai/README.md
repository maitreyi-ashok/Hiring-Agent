# Talent AI

Use AI to make hiring faster, find employee skill gaps, and improve retention — **starting small, learning from results, and improving gradually.** AI recommends; people decide.

## What's in it

| Phase | Page | What it does |
|---|---|---|
| 1 | **Hiring** | Create a job with must-have skills, add resumes (paste, `.txt`, `.md`, or `.pdf` with AI), get a ranked, *explained* shortlist (evidence, gaps, interview questions). Works with transparent rules; AI reads resumes more deeply. Blind review, CSV export. |
| 2 | **Skills** | Role profiles with target levels, rate people, individual and team skill gaps, learning plans. |
| 3 | **Retention** | A simple, explainable checklist of early-warning signals with suggested next steps. |
| 4 | **Agent** | **HR hiring agent**: candidates who match **7/10 or better** get a skills test by email; when they pass, it books a **video interview**. |
| — | **Overview** | Roadmap, next best step, and *Learning from results* (how often your team agrees with the recommendations). |

### How the hiring agent works

```
resume match ≥ 7/10  →  test link emailed  →  candidate takes the test (timer, server-graded)
   →  passed  →  video interview booked + invitation emailed  →  you interview, you decide
```

- **You set the rules** (threshold, pass mark, time limit, interview length and first slot) on the Agent page.
- **Ask first (default)** or **Automatic**. Automatic only acts on candidates screened *after* you switch it on, at most 10 per pass, only while the app is open, and only when email is configured. Without email the agent prepares ready-to-send drafts.
- **Tests**: build your own questions or have AI draft them. Multiple choice is graded automatically on the server (the answer key never reaches the candidate's browser). Written answers get an AI-suggested mark, but **anything with written answers, a late submission, or a score under the pass mark waits for a person**. The agent never declines anyone.
- **Interviews**: the candidate gets a page with a Join button that opens 15 minutes before the start, an "Add to calendar" file, and the time in their own time zone. With Daily configured, the room itself only opens around the scheduled time.
- **AI-prepared interview guide** (optional) uses the job, resume gaps and missed test topics — never the candidate's name or contact details.

## Run it with the built-in database (no setup)

```
npm install
npm run dev        # or: npm run build && npm start
```

With no `DATABASE_URL`, the app stores everything in a SQLite file at `data/talent-ai.db` (change the folder with `DATA_DIR`). Open the site, click **Create company account**, and you are in. `SESSION_SECRET` is optional locally but **required in production** (`openssl rand -base64 36`). **Back up the `data/` folder** — that is your database.

Hosting it for other companies: use any server whose disk persists (a VPS, or Docker):

```
docker build -t talent-ai .
docker run -p 3000:3000 -v talent-data:/app/data -e SESSION_SECRET=your-long-random-string talent-ai
```

## Deploy on Vercel (needs Postgres)

Vercel and other serverless hosts erase local files between requests, so the built-in database is switched off there.

1. Put this folder's contents at the root of your GitHub repo and import it in Vercel (Next.js is auto-detected).
2. **Add a database**: Project → Storage → Create Database → **Neon (Postgres)** → connect to the project. This sets `DATABASE_URL`. The app creates its tables on first use.
3. Add environment variables (Project → Settings → Environment Variables) — see `.env.example`:
   - **Required:** `DATABASE_URL` (from step 2) and `SESSION_SECRET` (any long random string).
   - **Optional:** `ANTHROPIC_API_KEY` (AI), `RESEND_API_KEY` + `MAIL_FROM` (agent sends email), `DAILY_API_KEY` (private video rooms).
4. Redeploy and open the site. Any company can **Create company account** on the sign-in page and gets its own private workspace. **Settings** shows what is connected.

## Where data lives

Everything — jobs, resumes, notes, employees, settings, agent activity, and the tests/interviews candidates open — is in **your database** (built-in SQLite, or Postgres if `DATABASE_URL` is set): a `ta_companies` table for accounts and one `ta_docs` table (company, kind, id, JSON data) for everything else. Changes appear instantly in the browser and are saved in the background; other people's changes arrive within ~20 seconds. Records candidates open (tests, interviews) are deleted after 60 days. Exports/imports are in Settings.

Security: each company signs in with email + password (scrypt-hashed) → a signed, HttpOnly session cookie (7 days) that carries the company id. Every data and AI endpoint is scoped to that company, so one company can never read another's jobs, candidates or employees. Cross-site writes are rejected; candidate links are unguessable (≈192-bit); per-IP rate limits; answer keys never leave the server; outgoing email links must point at this site. It is **one login per company**, not per-user accounts or SSO — add those if several people need separate logins and roles.

When AI is on, resume text (or PDF) and written test answers are sent to the AI provider for analysis; PDFs are never stored. Skill-gap plans and interview guides never include names.

## Responsible use

- Nothing is rejected automatically; the agent never declines anyone. Written answers and edge cases always get a human look.
- Screening is instructed to use job-related evidence only and ignore names, gender, age, nationality, photos and school prestige; resume text and test answers are treated as untrusted. **Blind review** hides names and emails.
- **Tests are not proctored.** You cannot know who took a test or whether they used help. Treat results as one signal and confirm in the interview.
- It can still be wrong or biased. Use scores to decide what to read first, not what to skip.
- Automated tools in hiring and employee monitoring are regulated in many places (e.g. EU AI Act, some US states/cities). Get HR/legal advice and tell candidates when AI or automated steps are used. Candidates should have a way to ask for adjustments — the emails invite it.
- Retention and skills outputs are simple checklists, not predictions; never use them for pay, promotion or discipline.

## Project layout

```
app/(app)/      recruiter pages: Overview, Hiring, Agent, Skills, Retention, Settings (behind sign-in)
app/(public)/   candidate pages: /test/[id], /interview/[id] (no login, no navigation, noindex)
app/api/        auth, db sync, screening, plans, agent (tests, interviews, email, AI helpers), public candidate endpoints
lib/            types, DB-backed store, Postgres access, sessions/guards, screening rules, grading, agent logic, AI helpers
components/     shell, sign-in gate, background agent runner, UI primitives
```
