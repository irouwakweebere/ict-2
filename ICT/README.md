# ICT Innovation Center

The website and request-intake service for the **ICT Innovation Center,
University of Nigeria, Nsukka**.

Built with plain HTML, CSS and JavaScript on the front end and a
dependency-free Node.js server on the back end. There is no build step, no
package manager and no framework — the whole system is the files in this
repository.

---

## What the site does

The Center runs **nine service units**. The website is the single front door to
all of them:

| # | Unit | What a visitor can do |
|---|------|-----------------------|
| 1 | Website Unit | Contact the team about the university website or school email |
| 2 | Webometrics Unit | Enquire about research visibility work |
| 3 | Customer Service | Ask for help with results and ICT services |
| 4 | Innovation Unit | Request a meeting (facility or on-site) · register for a UNN ID card |
| 5 | Training Unit | Compare courses and register for Basic Computer or Coding |
| 6 | Networking Unit | Report network and Wi-Fi issues |
| 7 | Hardware Unit | Request a repair assessment |
| 8 | Software Unit | Commission a website build |
| 9 | Portal Unit | Get UNN student-portal support |

Every request form is validated in the browser **and** on the server, then
delivered to the Center's inbox as a formatted email.

### Key interactions

- **Unit showcase** — a hierarchical grid (one large tile, then standard tiles)
  showing five units at a time. A single arrow sits under the grid; pressing it
  flips the cards to the remaining four units and reveals the reverse arrow on
  the opposite side.
- **Directional card flip** — cards turn edge-on in a staggered wave, right to
  left when moving forward and left to right when moving back. Honours
  `prefers-reduced-motion`.
- **Single-page navigation** — each unit is a real, linkable page
  (`/?page=portal`), with working back/forward buttons and per-page titles.
- **Accessible by default** — skip link, keyboard focus management, labelled
  form controls, live-region status messages, mobile menu with `aria-expanded`.

---

## Student portal service desk

The Portal Unit is not just a contact form. It runs a four-step workflow
(`/?page=portal`) backed by a staff desk (`/?page=staff`), so a portal problem
is verified, paid for where a fee applies, tracked, fixed and confirmed
without leaving the site.

### Where the student records come from

Every lookup — on screen and on the server — reads from **one record store**:

- **Demo server (default).** `server.js` ships with `DEMO_STUDENT_TABLE`: 48
  students across Computer Science, Engineering, the Sciences, Social Sciences,
  Business Administration, Law, Arts, Education, Agriculture and the health
  programmes. Each row carries registration number, full name, department,
  faculty, programme, gender, phone, email and level.

  While that table is in use, the portal page shows a collapsible **Demo
  student records** panel under the search form. It lists all 48 records with a
  filter box; picking a row fills the registration number and name and runs the
  search immediately, so a demonstration can show exactly where the answer comes
  from.

- **Real export.** Set `STUDENT_RECORDS_FILE` to a JSON array of objects with
  the same fields (an object with a `students` array also works). The demo
  panel and its endpoint switch themselves off — `GET /api/portal/students`
  answers `403` — because real student data must not be browsable.

The list endpoint is also unavailable when `NODE_ENV=production`, even if the
demo table is still in place.

### The student side

| Step | What happens |
|------|--------------|
| 1. Your details | The student types a **registration number** and their full name. The server finds the record and **compares the typed name with the name on file** — tolerant of surname-first order, letter case, extra spaces and a single typo, but strict about a different person. A mismatch stops the flow with a specific message. |
| 2. Choose issue | Eight issues are offered, each labelled with its fee. The confirmed student record (name, department, phone, email) is shown again so the student checks it before continuing. **The page makes no promise about a visit** — that decision belongs to the Portal Unit. |
| 3. Payment (only when the issue carries a fee) | Two methods: **card** (hosted-style checkout page, receipt/invoice afterwards) or **bank transfer** (the Center's account, with receipt upload). |
| 4. Your problem | A short description, then submit. The ticket number, fee status and payment confirmation are shown on screen and in a printable invoice, together with a plain statement of what happens next: the Portal Unit reads the request and emails the outcome. |

Nothing about the issue itself tells the student whether to travel. The desk
decides that per ticket, and the email it sends says so — see below.

### The desk side

Open `/?page=staff` — the footer holds a **Staff desk** link on every page.
The desk has two sections, each with its **own access code**, and each code opens
only its own section:

| Section | Code variable | What it shows |
|---------|---------------|---------------|
| **Portal Unit** | `STAFF_ACCESS_CODE` | student portal tickets, receipts, resolve / ask to come in |
| **Innovation Unit** | `INNOVATION_ACCESS_CODE` | meeting bookings, with Accept / Decline and the client email |

A Portal code returns `403` on every Innovation endpoint and the other way
round, so signing in at one desk never exposes the other desk's requests. When a
variable is unset a random six-digit code is generated and printed at startup.

The Portal desk lists every ticket newest-first with the student's details, the
issue, the fee and payment state, the description and the uploaded receipt. It
keeps itself current over a **server-sent events stream**, so a new request
appears without refreshing, with an optional desktop notification.

Counts across the top read **new · awaiting visit · resolved**.

Every ticket has two ways to close it, and **each one sends exactly one email
to the student**:

| Action | Email the student receives | Ticket becomes |
|--------|---------------------------|----------------|
| **Resolved — email student** | "Your portal issue has been fixed", with the staff note | `resolved` |
| **Ask to come in** | "Please come to the ICT Innovation Center", with an optional date/time line and the staff note | `awaiting-visit` |

Both buttons open a small composer on the card for the message the student will
read. Asking a student in hides that button and replaces the other with *"They
have come in — mark resolved"*, so the pair can never be sent twice. Repeating
the same action returns `409`. Nothing is pre-decided by the issue: whether a
student must travel to the Center is the staff member's judgement after reading
the ticket.

## Innovation Unit meeting bookings

The Innovation page offers two buttons: **Book a meeting with us** and the
**UNN ID card** portal. The booking flow keeps the original request form and
adds a calendar in front of it:

| Step | What happens |
|------|--------------|
| 1. Where | **Book a meeting with our facilities** (at the ICT Center, 10:00 a.m. – 4:00 p.m.) or **book with us outside** (we come to you, 10:00 a.m. – 6:00 p.m.) |
| 2. Date | A month calendar with every bookable day, coloured by how much of the day is left. Days with no free slot are closed. |
| 3. Time | One-hour slots for the chosen day. A slot already held by another client is marked **Taken** and cannot be selected. |
| 4. Details | The existing form: name, gender, phone, email, department, and the site address for outside visits, plus the purpose of the meeting. |

Bookings are one per **section + date + time**. The check runs again when the
request is submitted, so two clients opening the calendar at the same moment
cannot both win: the second receives `409` and the calendar reloads with the
slot already taken. Declined bookings release their slot again.

The request goes to the **Innovation Unit section of the staff desk**, which
shows the date, the time frame, the section, the client's details and the
purpose. The officer presses **Accept** or **Decline**, an editable email to the
client is drafted from the decision, and pressing **Send** saves the decision
and emails the client. Payment is **never taken on the site** — the accepted
email says it is paid onsite, and the officer can arrange it in the same reply.

### Nothing is lost

Tickets and bookings are appended to `data/*.ndjson` as they happen and the
latest line per id is replayed on boot, so a refresh, a server restart or a busy
desk reloads the same list. The desk stream only carries a nudge that something
changed; the officer's browser refetches through the cookie-protected endpoint,
and the Innovation desk also polls every 20 seconds as a safety net.

### Payments and PCI scope

The site never collects card numbers, expiry dates or CVVs. In `simulated`
mode (the default) `/pay/:reference` is a demonstration checkout whose card
fields deliberately carry no `name` attribute, so the browser never submits
them; card details are not sent to this server in any mode. `PAYMENT_MODE`
switches to a **Paystack** or **Remita** adapter, where the student is handed to
the provider's own hosted checkout and only the reference comes back. This is
what keeps the Center out of PCI-DSS scope.

---

## Quick start

Requires **Node.js 18.17 or newer**. There is nothing to install.

```bash
node server.js
```

Open <http://localhost:3000>.

### If you are presenting today

There are now **two ways to run this**, and neither needs a terminal if the
first one is unavailable:

| Way | How | What you get |
|-----|-----|--------------|
| **Recommended** | `node server.js`, then <http://localhost:3000> | Everything: real HTTP API, tickets and bookings saved to `data/`, both staff desks with a live stream, email outbox |
| **No setup at all** | Double-click `index.html` (opens as `file://…`) | Complete portal and staff desk, running **entirely in the browser** from the same 48 demo records |

When no server answers, `app.js` switches itself to **offline demo mode**: it
serves the student roster, verifies the name, takes the fee (demo, no money),
accepts a transfer receipt, creates the ticket, signs staff in, resolves the
ticket and shows it on the desk. It also runs the meeting calendar: bookings
block their slot and appear on the Innovation desk, where they can be accepted
or declined. Tickets and bookings are stored in the browser (`localStorage`),
so one submitted in a tab shows up on the desk in another tab of the same
browser. A black **Demo mode** badge sits at the bottom of the screen so nobody
mistakes it for the live system.

The one thing offline mode cannot do is send email — resolving a ticket says
so explicitly: *"Demo mode: in the live system peace.okafor@unn.edu.ng is
emailed now."*

Codes in both modes:

| Desk | Code |
|------|------|
| Portal Unit | **246810** |
| Innovation Unit | **135790** |

Set `STAFF_ACCESS_CODE` and `INNOVATION_ACCESS_CODE` to change them on the
server; the offline demo uses the two fixed codes above.

Nothing about the site changes when the server *is* running: same pages, same
API, same staff sign-in.

With no configuration at all, submitted requests are saved to
`data/submissions/` (one JSON Lines file per month) so every form works end to
end during development and demonstrations.

### Run with email delivery

Create a `.env` file in this folder (it is already git-ignored):

```env
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM_EMAIL=website@your-verified-domain.com
INNOVATION_EMAIL=ict@unn.edu.ng
```

`RESEND_FROM_EMAIL` must be an address on a domain verified in
[Resend](https://resend.com). Restart the server; the console prints which
delivery channel is active.

---

## Configuration

All configuration is optional and read from the environment or a local `.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Set to `production` on a live server |
| `INNOVATION_EMAIL` | `ict@unn.edu.ng` | Inbox that receives every submission |
| `RESEND_API_KEY` | — | Resend API key |
| `RESEND_FROM_EMAIL` | — | Verified sender address |
| `EMAIL_MODE` | `auto` | `auto` (email, else local store) · `resend` (email only) · `file` (local only) |
| `ALLOWED_ORIGINS` | — | Extra origins allowed to POST to the API, comma separated |
| `DATA_DIR` | `./data` | Where the local submission and portal stores live |
| `STAFF_ACCESS_CODE` | random, printed at boot | Access code for the **Portal Unit** section of `/?page=staff` |
| `INNOVATION_ACCESS_CODE` | random, printed at boot | Access code for the **Innovation Unit** section of `/?page=staff` |
| `STUDENT_RECORDS_FILE` | built-in demo roster (48 students) | JSON export of student records (registration number, full name, department, faculty, programme, gender, phone, email, level) used by the portal lookup |
| `PAYMENT_MODE` | `simulated` | `simulated` (no money moves) · `paystack` · `remita` |
| `PAYSTACK_SECRET_KEY` | — | Required when `PAYMENT_MODE=paystack` |
| `REMITA_MERCHANT_ID`, `REMITA_SERVICE_TYPE_ID`, `REMITA_API_KEY` | — | Required when `PAYMENT_MODE=remita` |
| `REMITA_BASE_URL` | `https://remitademo.net` | Remita endpoint (demo or live) |
| `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NAME`, `PAYMENT_ACCOUNT_NUMBER` | Zenith Bank / ICT Innovation Center, UNN / `1012345678` | Account shown for bank transfers — replace with the Center's official account |

---

## API

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/service-requests` | Contact, software, hardware, portal and training submissions |
| `POST` | `/api/meeting-requests` | Facility and on-site meeting requests |
| `GET` | `/api/meetings/availability` | Bookable days and hourly slots: `?type=facility\|outside&days=120&from=YYYY-MM-DD`. `taken` is per section + date + time |
| `POST` | `/api/meetings` | Book a slot; `409 SLOT_TAKEN` when another client already holds it |
| `GET` | `/api/health` | Readiness probe: status, active delivery channel, uptime |

Student portal:

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/portal/lookup` | Verify a registration number and the typed name; returns the record and the issue list |
| `GET` | `/api/portal/issues` | Issue catalogue with fees and visit requirements |
| `GET` | `/api/portal/students` | Demo roster only: the built-in records, searchable with `?q=`. `403` once a real export is connected or in production |
| `POST` | `/api/portal/payments` | Start a card or transfer payment for an issue |
| `GET` | `/api/portal/payments/:reference` | Payment status (used when the student returns from checkout) |
| `POST` | `/api/portal/payments/:reference/confirm` | Confirm a simulated payment (provider modes use a webhook/verify step) |
| `GET` | `/pay/:reference` | Checkout page (simulated mode only) |
| `POST` | `/api/portal/tickets` | Submit the ticket; requires a settled fee where one applies |

Service desk (session cookie required):

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`/`POST` | `/api/staff/session` | Check the session / sign in with either code; returns which desk the session belongs to (`portal` or `innovation`) |
| `POST` | `/api/staff/logout` | Sign out |
| `GET` | `/api/staff/tickets` | Portal desk only: all tickets with new / awaiting / resolved counts |
| `GET` | `/api/staff/meetings` | Innovation desk only: every booking with pending / accepted / declined counts |
| `POST` | `/api/staff/meetings/:id/respond` | Innovation desk only: `{outcome:"accepted"\|"declined", note}` — saves the decision, emails the client, and releases the slot when declined |
| `POST` | `/api/staff/tickets/:id/respond` | `{outcome:"resolved"\|"visit", note, visitWhen}` — closes the ticket and emails the student either the fix or the request to come in |
| `POST` | `/api/staff/tickets/:id/resolve` | Shorthand for `respond` with `outcome:"resolved"` |
| `GET` | `/api/staff/receipts/:id` | Download the uploaded transfer receipt (staff only) |
| `GET` | `/api/staff/stream` | Server-sent events: new tickets, resolutions, heartbeats |

Every response is JSON. A successful submission returns:

```json
{ "message": "Request sent.", "channel": "email", "reference": null }
```

`channel` is `email` or `file`, so the front end never claims an email was sent
when it was actually stored locally.

### Validation

Each request type has an explicit schema in the **Validation** section of
`server.js`: required fields, maximum lengths, allowed option values, email and
phone formats, and a check for control characters in free text. Invalid input
returns `400` with a human-readable `error`.

The dropdown option lists (`GENDER_OPTIONS`, `WEBSITE_TYPES`, `DEVICE_TYPES`,
`PORTAL_ISSUE_TYPES`) are defined once in `server.js` and copied verbatim into
`index.html`. They must stay identical — if they drift apart, visitors get
confusing rejections. This is enforced by a comment at both sites.

---

## Project files

```
ICT/
├── index.html     All views: home, the eight unit pages, the student portal, meeting booking and the two staff desks
├── styles.css     Design system, layout, responsive rules, animations
├── app.js         Router, unit carousel, mobile menu, form handling, booking calendar, desk client
├── server.js      Static file server + request-intake API (all back-end logic)
├── README.md      This file
├── .gitignore     Keeps .env, data/ and logs out of version control
├── .vscode/       Optional VS Code run task
├── image.png      Reference image for the unit grid layout
└── webapp_idea.md Original feature notes for the unit section
```

### How `server.js` is organised

The file is one unit of deployment, divided into nine labelled sections:

| Section | Contents |
|---------|----------|
| 1. Configuration | `.env` loading, settings, defaults |
| 2. HTTP helpers | JSON responses, body reading with limits, security headers, safe URL decoding, origin checks |
| 3. Validation | Option lists and one schema per request type |
| 4. Messages | Email subject, plain-text body and HTML body builders |
| 5. Delivery | Resend email, or the local JSONL store |
| 6. Rate limiting | Per-IP protection for the public forms and portal lookups |
| 7. Portal service desk | Student records and name matching, issue catalogue, payment adapters, ticket and receipt stores, the two staff desks, meeting bookings and the event stream |
| 8. Static files | Allow-list serving of website files and the 404 page |
| 9. Router and startup | Request handling, logging, graceful shutdown |

### Request lifecycle

```
POST /api/service-requests
  → method check (405 for GET)
  → origin check (403 for cross-site)
  → rate limit (429 + Retry-After)
  → read JSON body, max 64 KB (413 if larger, 400 if malformed)
  → normalise legacy field names
  → validate against the schema (400 + human-readable error)
  → build the message (subject + text + escaped HTML)
  → deliver: Resend email, or append to data/submissions/YYYY-MM.ndjson
  → 200 { message, channel, reference }
```

---

## Security

- **Only website files are served.** `server.js`, `.env`, `.git/`, `data/`,
  `README.md`, `image.png` and `webapp_idea.md` are not reachable from the
  browser. Only an explicit allow-list (`index.html`, `styles.css`, `app.js`
  and an optional `assets/` folder) is public — everything else returns 404.
- **Secrets stay server-side.** Nothing is injected into the HTML.
- Request bodies are size-limited (64 KB) and strictly parsed as JSON.
- Submissions are rate limited per IP (12 per 10 minutes by default).
- Cross-site submissions are rejected; same-origin requests behind a reverse
  proxy are accepted via `X-Forwarded-Host`.
- All user input is HTML-escaped before it enters a notification email, which
  is sent with both a plain-text and an HTML part.
- Security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- Malformed URLs and path-traversal attempts return `400`/`404` instead of
  crashing the process.

---

## Open the page the right way (and what happens if you don’t)

The API and the pages live in the same Node process, so the simplest setup is:

```bash
node server.js          # then open http://localhost:3000
```

If you instead open `index.html` **straight from disk** (`file://…`) or through
a **static-only dev server** such as VS Code Live Server (`:5500`) or
`python -m http.server`, the HTML loads but `"/api/..."` no longer points at
Node. That is the classic “works locally, fails in the browser” trap: the page
is on port 5500, the API is on 3000, and nothing bridges them.

The code now handles both cases by itself:

1. On load, `app.js` asks its own origin for `/api/health`. If our server
   answers (`service: "ict-innovation-center"`), relative URLs are used.
2. If it does not — `file://`, Live Server, any other port — the app switches
   to `http://<same hostname>:3000` and logs
   `[ICT] API not served from this origin; using …` in the console.
3. `server.js` allows **loopback origins on any port** (and `file://`, which
   arrives as `Origin: null`) **only while `NODE_ENV` is not production**, and
   answers the CORS preflight. In production the old strict same-origin rule
   stands: a cross-site POST still returns `403`, and the staff cookie goes back
   to `SameSite=Strict`.

So: any of the three ways of opening the page now work. Serving it from
`node server.js` is still the recommended route — it is the only origin where
staff sign-in and the live ticket stream run without extra hops. If neither
the page's own origin nor `:3000` answers, the site falls back to the offline
demo described above instead of showing an error.

## Troubleshooting

**“The website could not reach its server.”** The page loaded, but the API call
found nothing listening. Start the server (`node server.js`) and try again —
this is also what appears when a hosting proxy answers with its own error page
because the app process stopped. The portal shows this message instead of a
generic failure on purpose: it names the actual cause.

The page already handles this without a reload: a single dropped response is
retried quietly after 1.2 s, and if the server is really down the message comes
with a **Try again** button that repeats the failed lookup. An
`uncaughtException` handler also keeps the process alive through stray errors
so one bad request cannot take the site down mid-demonstration.

**“That name does not correspond with the name attached to this registration
number.”** The registration number exists but the typed name did not match the
record. This is deliberate — the server never reveals the name on file, so a
stranger cannot harvest student names by guessing registration numbers. Check
spelling, or use the Demo student records panel on the portal page.

**Stale data while testing.** Everything a submission or ticket writes lives in
`data/` (git-ignored). Delete that folder to start from zero.

---

## Deployment

Any Node host works (Railway, Render, Fly.io, a university VM behind nginx, …).

1. Set `NODE_ENV=production` and the environment variables above.
2. Start with `node server.js` (or keep it alive with `systemd`/`pm2`).
3. Point the reverse proxy at the server's port and keep TLS termination at the
   proxy. The server already trusts `X-Forwarded-Host` for origin checks.
4. Verify `GET /api/health` returns `{"status":"ok"}` and send one test request
   from the live site.

---

## Fixes and upgrades in this revision

The design, the nine units, the copy and the five-at-a-time unit grid are
unchanged. Everything below fixes defects or strengthens the existing system.

### Critical defects fixed

| # | Defect | Fix |
|---|--------|-----|
| 1 | **One malformed URL crashed the server.** `decodeURIComponent()` was called on the request path outside any try/catch, so `/%E0%A4%A` threw `URIError` and killed the Node process. | `safeDecodePathname()` returns `null` on bad encoding and the router answers `400`; the whole handler is wrapped in try/catch. |
| 2 | **`.env` was downloadable**, exposing `RESEND_API_KEY` — along with `server.js`, `.git/config` and other internal files. | Static serving uses an allow-list, so anything not part of the website answers 404. Path traversal is blocked in the same function. |
| 3 | **Every student-portal request failed.** The form posted `name="Email"` while the server expected `email`, *and* the dropdown offered six options that did not overlap the server's seven allowed values. | Field renamed (with a backwards-compatible alias for `Email`); the portal issue list is now the union of both lists; both sides share one source of truth. |
| 4 | **The Training form collected data and discarded it.** The submit handler only scrolled to a notice, and the Pay button was disabled, so the page had no working control at all. | Training registration is a real request type: validated on both sides, delivered like every other unit, with the fee stated and a note that payment is arranged by the Training Unit. |
| 5 | **Unit grid overflowed on tablets and phones.** The wide-tile `grid-column` rules were never reset at smaller breakpoints because the override had lower CSS specificity. | Breakpoints rebuilt mobile-first; the wide tile only applies above 960px. Horizontal overflow is now 0px at 390px, 480px and 820px. |
| 6 | **No navigation on phones.** `.main-nav` was hidden below 680px with no replacement. | Menu button with `aria-expanded`/`aria-controls`, closes on Escape, outside click and resize. |
| 7 | **Accessibility defects.** A `<section>` sat outside `<main>`, `<label>` elements wrapped whole headlines, there was no skip link, page titles never changed, and "Back to top" was a dead anchor on every subpage. | Correct landmarks and heading order, labels wrap only their control, skip link added, `document.title` updates per view, "Back to top" is a real button. |
| 8 | **54 dead CSS rules** for components that no longer exist, plus a duplicated "skin" layer that re-declared every component. | Stylesheet consolidated into one system driven by CSS variables. |
| 9 | **`novalidate` defeated the JavaScript.** Forms had `novalidate` while the code called `reportValidity()`, so the browser never showed the visitor what was wrong. | `novalidate` removed; every form is validated by the browser, then by the server. |

### Portal desk defects found during testing

| # | Defect | Fix |
|---|--------|-----|
| 1 | **Bank-transfer tickets were rejected with `402 unpaid`.** A transfer can only be "settled" by uploading a receipt, but tickets are what carry receipts — a circular dependency that made the transfer route impossible to complete. | `paymentSatisfied()` accepts a transfer in `awaiting-transfer`/`receipt-submitted` when the ticket arrives with a receipt, and records `paymentStatus: "receipt-submitted"` for the desk to verify. |
| 2 | **The checkout button did nothing.** The page relied on an inline `<script>`, which the site's own Content-Security-Policy correctly blocks. | The checkout is a plain HTML form that posts the reference back; the handler answers with a `303` redirect to the portal for browsers and JSON for API clients. No inline script remains anywhere in `server.js`. |
| 3 | **Resolved tickets appeared twice on the desk.** Resolution appends a new copy of the record to the ticket log; the reader loaded both copies, and double resolution sent the student two emails. | The log is collapsed by ticket id on load (last write wins), and resolving an already-resolved ticket returns `409` instead of emailing again. |
| 4 | **The step indicator claimed a payment step that did not exist** for free issues, and skipped a number before an issue was chosen. | The Payment chip is only shown once a fee-bearing issue is selected; a single `[hidden]` rule guarantees the attribute beats component `display` rules. |

### Innovation Unit round

| # | Change | Detail |
|---|--------|--------|
| 1 | **Meeting booking is a real booking** | The Innovation page offers *Book a meeting with us* and the ID card. The form now opens with a month calendar and one-hour slots: 10am–4pm at the Center, 10am–6pm outside. |
| 2 | **No double-booking** | A slot is unique per section + date + time. Taken slots are drawn as *Taken* and cannot be selected; the server re-checks on submit and answers `409 SLOT_TAKEN`, and the calendar reloads. Declining releases the slot. |
| 3 | **Two desks, two codes** | `STAFF_ACCESS_CODE` opens the Portal section, `INNOVATION_ACCESS_CODE` the Innovation section. Each code is refused (`403`) on the other section's endpoints. |
| 4 | **Accept or decline, then email** | The Innovation desk shows date, time frame, section and client. Accept or Decline drafts an editable email; sending saves the decision and emails the client. Payment is onsite, never on the site. |
| 5 | **Nothing is ever lost** | Bookings append to `data/meetings.ndjson` and replay on boot. The desk refetches over its cookie-protected endpoint and polls every 20 s as a safety net. |
| 6 | **Payment method glitch fixed** | The transfer panel and the card receipt are both cleared before a method opens, so exactly one method is visible whichever order you click — previously card → transfer left both on screen. |

### Engineering upgrades

- **The site works before Resend is configured.** `EMAIL_MODE=auto` sends email
  when credentials exist and otherwise appends each submission to
  `data/submissions/`. The response and `/api/health` report which channel was
  used, so nothing is silently lost (previously a request simply returned 503).
- **Hardening.** 64 KB body limit, per-IP rate limiting with `Retry-After`,
  cross-site POST rejection, phone-format checks, HTML-escaped email templates
  with a plain-text alternative, and graceful shutdown on `SIGINT`/`SIGTERM`.
- **Front-end correctness.** A deterministic animation state machine
  (`idle → leaving → entering → settling`) replaces chained `setTimeout` calls;
  `prefers-reduced-motion` is honoured; double-clicks during a flip are blocked
  with `aria-busy`; the layout shift on successful submission is gone; and the
  last-page "next" arrow now disappears instead of staying clickable.
- **Navigation fixes.** The logo and "Back to home" return to the top of the
  homepage, while unit-level links jump to the services grid.

---

## Still to be supplied by the Center

These are business integrations, not code defects:

- **Payment credentials** — the portal runs in `simulated` payment mode until
  the Center supplies either Paystack keys or Remita merchant credentials.
- **Official bank account** — transfers currently point at a placeholder
  account (`1012345678`); set `PAYMENT_ACCOUNT_NUMBER` and friends to the real
  one before students are told to send money.
- **Student records export** — the lookup uses the 48-record demo roster until
  a JSON export from the university's records system is placed at
  `STUDENT_RECORDS_FILE`.
- **Payment for training** — fees are shown (₦25,000 Basic Computer; ₦35,000
  Coding) and registrations are captured, but no payment gateway is connected
  yet. The Training Unit confirms each place and shares payment details.
- **Verified Resend sender domain** — required before email delivery can be
  switched on in production.
- **Final contact details** — the public address is `ict@unn.edu.ng`; update if
  the Center publishes a different inbox or phone line.
- **ID card link** — registration continues to the supplied
  `https://bit.ly/IDQR-UNN` page.

---

## License

Internal project of the ICT Innovation Center, University of Nigeria, Nsukka.
