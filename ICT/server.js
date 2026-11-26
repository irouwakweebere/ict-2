"use strict";

/**
 * ICT Innovation Center — University of Nigeria, Nsukka
 * Website server: static files + request-intake API.
 *
 * Run with:  node server.js
 * Requires:  Node.js 18.17 or later (uses the built-in fetch API).
 *
 * No third-party dependencies. The file is organised in eight sections:
 *
 *   1. Configuration            — .env loading and settings
 *   2. HTTP helpers             — JSON responses, body reading, security
 *   3. Validation               — request schemas (single source of truth)
 *   4. Messages                 — email subject and body builders
 *   5. Delivery                 — Resend email, or the local JSONL store
 *   6. Rate limiting            — per-IP protection for the public forms
 *   7. Portal service desk       — student lookup, payments, tickets, staff
 *   8. Static files             — allow-list serving of the website
 *   9. Router and startup       — request handling, logging, shutdown
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/* ==========================================================================
   1. Configuration
   ========================================================================== */

const ROOT = __dirname;

/**
 * Read `.env` (if present) without overwriting variables already set in the
 * environment. Supports `KEY=value`, an optional `export` prefix, quoted
 * values, and comment lines. Deliberately dependency free.
 */
function loadEnvironment() {
  const envPath = path.join(ROOT, ".env");
  let contents;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || match[1] in process.env) continue;

    let value = match[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    process.env[match[1]] = value;
  }
}

loadEnvironment();

const EMAIL_MODES = new Set(["auto", "resend", "file"]);

const config = {
  root: ROOT,
  port: Number.parseInt(process.env.PORT, 10) > 0 ? Number.parseInt(process.env.PORT, 10) : 3000,
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: (process.env.NODE_ENV || "development").toLowerCase(),
  get isProduction() {
    return this.nodeEnv === "production";
  },
  emailMode: EMAIL_MODES.has((process.env.EMAIL_MODE || "auto").toLowerCase())
    ? (process.env.EMAIL_MODE || "auto").toLowerCase()
    : "auto",
  resendApiKey: (process.env.RESEND_API_KEY || "").trim(),
  resendFromEmail: (process.env.RESEND_FROM_EMAIL || "").trim(),
  innovationEmail: (process.env.INNOVATION_EMAIL || "ict@unn.edu.ng").trim(),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data"),
  maxBodyBytes: 64 * 1024,
  maxUploadBytes: 4 * 1024 * 1024,
  rateLimit: { windowMs: 10 * 60 * 1000, max: 12 },
  lookupRateLimit: { windowMs: 10 * 60 * 1000, max: 25 },

  // --- Portal service desk ------------------------------------------------
  // Access code for the staff dashboard (?page=staff). When it is not set a
  // random code is generated at startup and printed to the console.
  staffAccessCode: (process.env.STAFF_ACCESS_CODE || "").trim(),
  // The Innovation Unit runs its own desk with its own access code.
  innovationAccessCode: (process.env.INNOVATION_ACCESS_CODE || "").trim(),
  // Student records: a JSON file exported from the university, or the demo
  // dataset built into this file. See loadStudentRecords().
  studentRecordsFile: (process.env.STUDENT_RECORDS_FILE || "").trim(),

  // Payments. `simulated` runs the whole flow with no money moving and is the
  // safe default for development and presentations.
  paymentMode: ["simulated", "paystack", "remita"].includes((process.env.PAYMENT_MODE || "").toLowerCase())
    ? process.env.PAYMENT_MODE.toLowerCase()
    : "simulated",
  paystackSecretKey: (process.env.PAYSTACK_SECRET_KEY || "").trim(),
  remitaMerchantId: (process.env.REMITA_MERCHANT_ID || "").trim(),
  remitaServiceTypeId: (process.env.REMITA_SERVICE_TYPE_ID || "").trim(),
  remitaApiKey: (process.env.REMITA_API_KEY || "").trim(),
  remitaBaseUrl: (process.env.REMITA_BASE_URL || "https://remitademo.net").replace(/\/+$/, ""),

  // Bank account shown for "pay by transfer". Replace with the Center's
  // official account before going live.
  transferAccount: {
    bank: process.env.PAYMENT_BANK_NAME || "Zenith Bank",
    accountName: process.env.PAYMENT_ACCOUNT_NAME || "ICT Innovation Center, UNN",
    accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || "1012345678"
  }
};

/* ==========================================================================
   2. HTTP helpers
   ========================================================================== */

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'"
].join("; ");

function sendJson(response, status, body, extraHeaders = {}) {
  if (response.writableEnded || response.destroyed) return;
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
    ...extraHeaders
  });
  response.end(payload);
}

function sendHtml(response, status, html) {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    ...SECURITY_HEADERS
  });
  response.end(html);
}

/**
 * Read and parse a JSON request body with a hard size limit.
 * Rejects with an error carrying `status` so the router can answer correctly.
 */
function readJsonBody(request, limit = config.maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const fail = (status, message) => {
      if (settled) return;
      settled = true;
      const error = new Error(message);
      error.status = status;
      reject(error);
    };

    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        request.resume();
        fail(413, "This request is too large. Please shorten your message and try again.");
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error("Please submit a valid request.");
        error.status = 400;
        reject(error);
      }
    });

    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

/**
 * Decode a URL pathname without throwing on malformed percent-encoding.
 * Returns `null` when the path cannot be decoded, so the router answers 400
 * instead of letting a `URIError` take the whole process down.
 */
function safeDecodePathname(url) {
  let pathname;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    return null;
  }
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function requestHostname(request) {
  const candidates = [request.headers["x-forwarded-host"], request.headers.host];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const first = candidate.split(",")[0].trim();
    try {
      return new URL(`http://${first}`).host.toLowerCase();
    } catch {
      /* keep looking */
    }
  }
  return "";
}

function parseOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return { host: parsed.host.toLowerCase(), protocol: parsed.protocol, hostname: parsed.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Defence in depth for the JSON endpoints. The API is cookie-free, so this is
 * an anti-abuse measure rather than a CSRF boundary: cross-site form posts and
 * scripted spam are rejected, while requests from the same origin (including
 * behind a reverse proxy that reports `x-forwarded-host`) are accepted.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/**
 * In development the site is often opened from a different local port — VS
 * Code Live Server (5500), `python -m http.server` (8000) or straight from
 * disk (`file://`, which sends `Origin: null`). Those pages are still ours, so
 * while NODE_ENV is not production they may call the API. Production keeps the
 * strict same-origin rule.
 */
function isDevelopmentOrigin(origin) {
  if (config.isProduction) return false;
  if (origin === "null") return true; // file://
  const parsed = parseOrigin(origin);
  return Boolean(parsed && LOOPBACK_HOSTS.has(parsed.hostname));
}

function isAllowedOrigin(request, allowedOrigins = config.allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return true; // Non-browser client (curl, monitoring, server-to-server).
  if (isDevelopmentOrigin(origin)) return true;

  const parsed = parseOrigin(origin);
  if (!parsed) return false;

  const hostHeader = requestHostname(request);
  if (!hostHeader) return false;

  if (parsed.host === hostHeader) return true;

  for (const allowed of allowedOrigins) {
    const allowedOrigin = parseOrigin(allowed);
    if (allowedOrigin && allowedOrigin.host === parsed.host) return true;
  }

  // Tolerate proxies that switch http/https or add a default port.
  return parsed.hostname === hostHeader.split(":")[0] && (parsed.protocol === "http:" || parsed.protocol === "https:");
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return (request.socket && request.socket.remoteAddress) || "unknown";
}

/* ==========================================================================
   3. Validation
   --------------------------------------------------------------------------
   The option lists below are the single source of truth for the dropdowns in
   `index.html`. If they drift apart, requests fail with confusing errors —
   that is exactly the bug that used to break every student-portal submission,
   so the lists live here and are copied verbatim into the form markup.
   ========================================================================== */

const GENDER_OPTIONS = ["Female", "Male", "Prefer not to say"];

const WEBSITE_TYPES = [
  "Business or organization",
  "Personal portfolio",
  "Online store",
  "School or educational",
  "Other"
];

const DEVICE_TYPES = [
  "Laptop",
  "Desktop computer",
  "Printer",
  "Other computer appliance"
];

const PORTAL_ISSUE_TYPES = [
  "Cannot log in or access my account",
  "Student profile",
  "Change of email",
  "Upgrade of level",
  "Adding of course",
  "Dropping of course",
  "Extra unit (Final Year)",
  "Late course registration"
];

const SERVICE_SCHEMAS = {
  contact: {
    required: ["name", "gender", "email", "department", "description"],
    fields: { name: 120, gender: 40, email: 120, department: 120, description: 3000 },
    options: {}
  },
  software: {
    required: [
      "name", "gender", "phone", "email", "department",
      "websiteType", "timeline", "features", "description"
    ],
    fields: {
      name: 120, gender: 40, phone: 30, email: 120, department: 120, websiteType: 80,
      timeline: 120, features: 3000, description: 3000, domainHosting: 1000
    },
    options: { websiteType: WEBSITE_TYPES }
  },
  hardware: {
    required: ["name", "gender", "phone", "email", "deviceType", "makeModel", "issue"],
    fields: {
      name: 120, gender: 40, phone: 30, email: 120, department: 120, deviceType: 80,
      makeModel: 160, issue: 3000, details: 1500
    },
    options: { deviceType: DEVICE_TYPES }
  },
  portal: {
    required: [
      "name", "gender", "email", "phone", "registrationNumber",
      "department", "issueType", "description"
    ],
    fields: {
      name: 120, gender: 40, email: 120, phone: 30, registrationNumber: 40,
      department: 120, issueType: 80, description: 3000
    },
    options: { issueType: PORTAL_ISSUE_TYPES }
  },
  training: {
    required: ["name", "gender", "email", "guardianName", "guardianPhone", "course"],
    fields: {
      name: 120, gender: 40, email: 120, phone: 30,
      guardianName: 120, guardianPhone: 30, course: 20
    },
    options: { course: ["basic", "coding"] }
  }
};

const OPTION_LABELS = {
  websiteType: "website type",
  deviceType: "device type",
  issueType: "portal issue",
  course: "course"
};

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmailAddress(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(trimmed);
}

function isPhoneNumber(value) {
  return typeof value === "string" && /^[+()\d][\d\s().-]{5,28}$/.test(value.trim());
}

/**
 * The portal form historically posted `Email` with a capital E. Keep accepting
 * that spelling so cached copies of the old page keep working.
 */
function normalizePayload(payload) {
  if (!isPlainObject(payload)) return payload;
  const normalized = { ...payload };
  if (typeof normalized.Email === "string" && typeof normalized.email !== "string") {
    normalized.email = normalized.Email;
  }
  delete normalized.Email;
  return normalized;
}

function hasControlCharacters(value) {
  return Object.values(value).some(
    (content) => typeof content === "string" && CONTROL_CHARACTERS.test(content)
  );
}

function validateMeeting(payload) {
  const value = normalizePayload(payload);
  if (!isPlainObject(value)) return "Please submit a valid request.";

  const required = ["name", "gender", "phone", "email", "department", "description", "meetingType"];
  for (const key of required) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      return "Please complete all required fields.";
    }
  }

  if (!isEmailAddress(value.email)) return "Please enter a valid email address.";
  if (!isPhoneNumber(value.phone)) return "Please enter a valid phone number.";
  if (!GENDER_OPTIONS.includes(value.gender)) return "Choose a valid gender option.";
  if (!["facility", "outside"].includes(value.meetingType)) return "Choose a valid meeting type.";

  if (value.meetingType === "outside") {
    if (typeof value.location !== "string" || !value.location.trim()) {
      return "Please provide the meeting location.";
    }
  }

  const limits = { name: 120, phone: 30, email: 120, department: 120, description: 3000, location: 240 };
  for (const [key, maxLength] of Object.entries(limits)) {
    if (value[key] === undefined || value[key] === null) continue;
    if (typeof value[key] !== "string" || value[key].length > maxLength) {
      return "One or more fields are invalid or exceed the allowed length.";
    }
  }

  if (hasControlCharacters(value)) return "One or more fields contain characters that are not allowed.";

  return null;
}

function validateServiceRequest(payload) {
  const value = normalizePayload(payload);
  if (!isPlainObject(value)) return "Please submit a valid request.";

  const serviceType = typeof value.serviceType === "string" ? value.serviceType.trim() : "";
  if (!Object.hasOwn(SERVICE_SCHEMAS, serviceType)) return "Choose a valid service request type.";
  const schema = SERVICE_SCHEMAS[serviceType];

  for (const key of schema.required) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      return "Please complete all required fields.";
    }
  }

  if (!isEmailAddress(value.email)) return "Please enter a valid email address.";
  if (value.phone !== undefined && value.phone.trim() && !isPhoneNumber(value.phone)) {
    return "Please enter a valid phone number.";
  }
  if (!GENDER_OPTIONS.includes(value.gender)) return "Choose a valid gender option.";

  for (const [key, maxLength] of Object.entries(schema.fields)) {
    if (value[key] === undefined || value[key] === null) continue;
    if (typeof value[key] !== "string" || value[key].length > maxLength) {
      return "One or more fields are invalid or exceed the allowed length.";
    }
  }

  for (const [key, choices] of Object.entries(schema.options)) {
    if (!choices.includes(value[key])) {
      return `Choose a valid ${OPTION_LABELS[key] || key}.`;
    }
  }

  if (hasControlCharacters(value)) return "One or more fields contain characters that are not allowed.";

  return null;
}

/* ==========================================================================
   4. Messages
   ========================================================================== */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function renderText(heading, details) {
  return `${heading}\n\n${details.map(([label, value]) => `${label}: ${value}`).join("\n\n")}`;
}

function renderHtml(heading, details, receivedAt) {
  const rows = details
    .map(
      ([label, value]) => `
        <tr>
          <th align="left" style="padding:10px 14px;border-bottom:1px solid #e5e5e5;vertical-align:top;width:210px;font:600 13px Arial,sans-serif;color:#111;">${escapeHtml(label)}</th>
          <td style="padding:10px 14px;border-bottom:1px solid #e5e5e5;font:400 13px/1.6 Arial,sans-serif;color:#222;white-space:pre-wrap;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f5f5f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;">
    <tr><td style="padding:22px 24px;border-bottom:1px solid #e5e5e5;">
      <div style="font:700 11px Arial,sans-serif;letter-spacing:1.4px;color:#111;">ICT INNOVATION CENTER</div>
      <div style="font:400 11px Arial,sans-serif;color:#555;margin-top:3px;">University of Nigeria, Nsukka</div>
      <h1 style="margin:14px 0 0;font:700 20px Arial,sans-serif;color:#111;">${escapeHtml(heading)}</h1>
      <div style="font:400 12px Arial,sans-serif;color:#666;margin-top:6px;">Received ${escapeHtml(receivedAt)}</div>
    </td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
    <tr><td style="padding:16px 24px;font:400 11px/1.6 Arial,sans-serif;color:#666;">
      Sent automatically by the ICT Innovation Center website. Reply directly to this email to answer the sender.
    </td></tr>
  </table>
</body></html>`;
}

function meetingMessage(payload, receivedAt = new Date()) {
  const typeLabel = payload.meetingType === "outside" ? "On-site meeting" : "Facility meeting";
  const details = [
    ["Meeting type", typeLabel],
    ["Name", clean(payload.name)],
    ["Gender", payload.gender],
    ["Email", clean(payload.email)],
    ["Phone number", clean(payload.phone)],
    ["Department / company", clean(payload.department)],
    ...(payload.meetingType === "outside" ? [["Location", clean(payload.location)]] : []),
    ["Meeting description", clean(payload.description)],
    ["Submitted", receivedAt.toISOString()]
  ];

  const heading = `New ${payload.meetingType === "outside" ? "on-site" : "facility"} meeting request`;
  return {
    kind: "meeting",
    subject: `Meeting request — ${clean(payload.name)}`,
    replyTo: clean(payload.email),
    heading,
    details,
    text: renderText(heading, details),
    html: renderHtml(heading, details, receivedAt.toUTCString())
  };
}

const SERVICE_LABELS = {
  contact: "contact message",
  software: "Software Unit request",
  hardware: "Hardware Unit request",
  portal: "Portal Unit request",
  training: "Training Unit registration"
};

const COURSE_NAMES = {
  basic: "Basic Computer (₦25,000)",
  coding: "Coding (₦35,000)"
};

const DETAIL_LABELS = [
  ["name", "Name"],
  ["gender", "Gender"],
  ["email", "Email"],
  ["phone", "Phone number"],
  ["guardianName", "Guardian’s name"],
  ["guardianPhone", "Guardian’s phone number"],
  ["department", "Department / company"],
  ["registrationNumber", "Student registration number"],
  ["websiteType", "Website type"],
  ["timeline", "Expected timeline"],
  ["features", "Pages and features"],
  ["deviceType", "Device type"],
  ["makeModel", "Make and model"],
  ["issueType", "Portal issue"],
  ["course", "Course"],
  ["issue", "Issue description"],
  ["description", "Description"],
  ["domainHosting", "Domain or hosting details"],
  ["details", "Additional details"]
];

function serviceMessage(payload, receivedAt = new Date()) {
  const labelOverrides = {};
  const valueOverrides = {};

  if (payload.serviceType === "software") {
    // For software requests "description" describes the project, not the message.
    labelOverrides.description = "Project description";
  }
  if (payload.serviceType === "training") {
    labelOverrides.description = "Additional notes";
    valueOverrides.course = COURSE_NAMES[payload.course] || clean(payload.course);
  }

  const details = [];
  for (const [key, label] of DETAIL_LABELS) {
    const value = key in valueOverrides ? valueOverrides[key] : clean(payload[key]);
    if (!value) continue;
    details.push([labelOverrides[key] || label, value]);
  }
  details.push(["Submitted", receivedAt.toISOString()]);

  const label = SERVICE_LABELS[payload.serviceType] || "request";
  const heading = `New ${label}`;
  const subject = `${label[0].toUpperCase()}${label.slice(1)} — ${clean(payload.name)}`;

  return {
    kind: payload.serviceType,
    subject,
    replyTo: clean(payload.email),
    heading,
    details,
    text: renderText(heading, details),
    html: renderHtml(heading, details, receivedAt.toUTCString())
  };
}

/* ==========================================================================
   5. Delivery
   --------------------------------------------------------------------------
   Requests leave the site in one of two ways:

     1. `resend` — emailed to the Innovation inbox through Resend's HTTP API.
     2. `file`   — appended to data/submissions/YYYY-MM.ndjson as JSON Lines.

   In `auto` mode email is used when Resend is configured and the local store
   otherwise, so a freshly cloned copy is fully functional before email has
   been set up and nothing a visitor sends is ever silently lost.
   ========================================================================== */

function resendConfigured() {
  return Boolean(
    config.resendApiKey &&
      config.resendFromEmail &&
      isEmailAddress(config.resendFromEmail) &&
      isEmailAddress(config.innovationEmail)
  );
}

async function sendWithResend(message, to = config.innovationEmail, timeoutMs = 12_000) {
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: config.resendFromEmail,
        to: [to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {})
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    console.error("[mail] Resend request failed:", error.message);
    return {
      ok: false,
      status: 502,
      error: "The email service could not be reached. Please try again in a moment."
    };
  }

  if (!response.ok) {
    const providerMessage = await response.text().catch(() => "");
    console.error(`[mail] Resend returned ${response.status}: ${providerMessage.slice(0, 500)}`);
    return {
      ok: false,
      status: 502,
      error: "Email delivery failed. Please try again, or contact the ICT Center directly."
    };
  }

  return { ok: true, channel: "email" };
}

function storeLocally(message, payload, to = config.innovationEmail, date = new Date()) {
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const filePath = path.join(config.dataDir, "submissions", `${month}.ndjson`);

  const record = {
    id: crypto.randomUUID(),
    receivedAt: date.toISOString(),
    kind: message.kind,
    to,
    subject: message.subject,
    replyTo: message.replyTo || null,
    details: Object.fromEntries(message.details),
    text: message.text,
    payload
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  console.log(`[mail] Stored ${record.kind} request ${record.id} in ${path.relative(ROOT, filePath)}`);

  return { ok: true, channel: "file", id: record.id };
}

/**
 * Deliver one message. `to` defaults to the Innovation inbox; pass a student
 * address to send them a notification or update.
 */
async function deliver(message, payload, to = config.innovationEmail) {
  if (config.emailMode === "file") return storeLocally(message, payload, to);

  if (config.emailMode === "resend") {
    if (!resendConfigured()) {
      return {
        ok: false,
        status: 503,
        error: "Email is not configured yet. Please contact the ICT Center directly."
      };
    }
    return sendWithResend(message, to);
  }

  // auto
  if (resendConfigured()) {
    const result = await sendWithResend(message, to);
    if (result.ok || config.isProduction) return result;
    console.warn("[mail] Falling back to the local submission store.");
    return storeLocally(message, payload, to);
  }

  return storeLocally(message, payload, to);
}

function deliveryLabel() {
  if (config.emailMode === "file") return "local";
  if (config.emailMode === "resend") return "email";
  return resendConfigured() ? "email" : "local";
}

/* ==========================================================================
   6. Rate limiting
   ========================================================================== */

function createLimiter({ windowMs, max }) {
  const hits = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  timer.unref();

  return {
    check(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      entry.count += 1;
      if (entry.count > max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    }
  };
}

const rateLimiter = createLimiter(config.rateLimit);
const lookupLimiter = createLimiter(config.lookupRateLimit);

/* ==========================================================================
   7. Portal service desk
   --------------------------------------------------------------------------
   The student-portal workflow lives here:

     1. Identify  — the student enters a registration number and full name.
                    The name is matched against the name on record for that
                    number; a mismatch is reported, not silently accepted.
     2. Confirm   — the details the university holds (department, gender,
                    phone, email, level) are shown for the student to confirm.
     3. Issue     — the student picks an issue. Some issues carry a fee, and
                    some require the student to come to the ICT Center.
     4. Payment   — when a fee applies: pay by card on a hosted checkout, or
                    transfer to the Center's account and upload the receipt.
     5. Describe  — the student explains the problem and submits.
     6. Dispatch  — the desk gets an email plus a live notification on the
                    staff dashboard (?page=staff). Staff resolve the ticket,
                    which emails the student automatically.

   STUDENT RECORDS
   ---------------
   Every lookup reads from one store: STUDENT_RECORDS_FILE (a JSON export)
   when set, otherwise the DEMO_STUDENT_TABLE below (48 records covering the
   main UNN departments). While the built-in table is in use the server also
   publishes it at /api/portal/students, which powers the "Demo student
   records" panel on the portal page and switches itself off automatically
   once a real export is connected or NODE_ENV=production.

   CARD PAYMENTS
   -------------
   Card numbers are never collected, transmitted or stored by this server. The
   `card` option always redirects to a hosted checkout — Paystack or Remita when
   configured, or a clearly marked local simulator for demos. Handling raw card
   data on a university web server would breach PCI DSS and expose students to
   fraud; the provider holds the card details and we receive only a reference.
   ========================================================================== */

/* -------------------------------------------------------------------------- */
/* Demo student records                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The demo records the portal search reads from. One row per student:
 *
 *   [registration number, full name, department, faculty, programme,
 *    gender, phone, email, level]
 *
 * Keep the rows alphabetical by surname within each department group; the
 * portal lists them in this order. Replace the whole table with the real UNN
 * export by setting STUDENT_RECORDS_FILE (a JSON array of objects with the
 * same fields) — no code change is needed.
 */
const DEMO_STUDENT_TABLE = [
  // Computer Science
  ["2021/240001", "Peace Chidinma Okafor", "Computer Science", "Physical Sciences", "B.Sc. Computer Science", "Female", "+234 803 123 4567", "peace.okafor@unn.edu.ng", "400 Level"],
  ["2021/243755", "Daniel Ifeanyi Nwafor", "Computer Science", "Physical Sciences", "B.Sc. Computer Science", "Male", "+234 812 334 9908", "daniel.nwafor@unn.edu.ng", "400 Level"],
  ["2022/246775", "Chukwudi Kingsley Anyanwu", "Software Engineering", "Physical Sciences", "B.Sc. Software Engineering", "Male", "+234 704 887 2213", "chukwudi.anyanwu@unn.edu.ng", "300 Level"],
  ["2020/245019", "Adewale Kunle Ojo", "Architecture", "Environmental Studies", "B.Sc. Architecture", "Male", "+234 805 776 1120", "adewale.ojo@unn.edu.ng", "500 Level"],

  // Engineering
  ["2020/241882", "Emeka Daniel Nwosu", "Mechanical Engineering", "Engineering", "B.Eng. Mechanical Engineering", "Male", "+234 806 765 4321", "emeka.nwosu@unn.edu.ng", "500 Level"],
  ["2022/247122", "Musa Danjuma Bala", "Mechanical Engineering", "Engineering", "B.Eng. Mechanical Engineering", "Male", "+234 809 664 8891", "musa.bala@unn.edu.ng", "300 Level"],
  ["2022/241377", "Kelechi Samuel Obi", "Electrical Engineering", "Engineering", "B.Eng. Electrical Engineering", "Male", "+234 809 556 2210", "kelechi.obi@unn.edu.ng", "300 Level"],
  ["2021/241208", "Peter Ifeanyi Alozie", "Electronic Engineering", "Engineering", "B.Eng. Electronic Engineering", "Male", "+234 807 556 4412", "peter.alozie@unn.edu.ng", "400 Level"],
  ["2019/240116", "Obinna Godwin Aneke", "Civil Engineering", "Engineering", "B.Eng. Civil Engineering", "Male", "+234 815 220 7731", "obinna.aneke@unn.edu.ng", "600 Level"],
  ["2019/237210", "Ifeanyi Chukwuemeka Nnamdi", "Metallurgical and Materials Engineering", "Engineering", "B.Eng. Metallurgical Engineering", "Male", "+234 810 334 5521", "ifeanyi.nnamdi@unn.edu.ng", "600 Level"],
  ["2019/245233", "Mustapha Aliyu Bello", "Chemical Engineering", "Engineering", "B.Eng. Chemical Engineering", "Male", "+234 810 887 6654", "mustapha.bello@unn.edu.ng", "600 Level"],

  // Social Sciences
  ["2022/243105", "Aisha Bello", "Mass Communication", "Social Sciences", "B.A. Mass Communication", "Female", "+234 703 998 8776", "aisha.bello@unn.edu.ng", "300 Level"],
  ["2021/239994", "Ezinne Favour Ude", "Mass Communication", "Social Sciences", "B.A. Mass Communication", "Female", "+234 812 445 6678", "ezinne.ude@unn.edu.ng", "400 Level"],
  ["2019/238744", "Chinedu Paul Eze", "Economics", "Social Sciences", "B.Sc. Economics", "Male", "+234 812 345 6789", "chinedu.eze@unn.edu.ng", "600 Level"],
  ["2022/245230", "Ibrahim Musa Sule", "Political Science", "Social Sciences", "B.Sc. Political Science", "Male", "+234 813 667 2288", "ibrahim.sule@unn.edu.ng", "300 Level"],
  ["2021/244487", "Hauwa Adamu Bello", "Sociology and Anthropology", "Social Sciences", "B.Sc. Sociology", "Female", "+234 704 552 7788", "hauwa.bello@unn.edu.ng", "400 Level"],
  ["2020/238213", "Ada Chiamaka Obiora", "Psychology", "Social Sciences", "B.Sc. Psychology", "Female", "+234 703 556 2201", "ada.obiora@unn.edu.ng", "500 Level"],
  ["2021/247994", "Precious Adaeze Nnaji", "Public Administration", "Social Sciences", "B.Sc. Public Administration", "Female", "+234 902 776 1123", "precious.nnaji@unn.edu.ng", "400 Level"],
  ["2022/250388", "Nasiru Umar Faruk", "Geography", "Social Sciences", "B.Sc. Geography", "Male", "+234 809 778 4456", "nasiru.faruk@unn.edu.ng", "300 Level"],

  // Business Administration
  ["2021/242967", "Tunde Olawale Adebayo", "Accounting", "Business Administration", "B.Sc. Accounting", "Male", "+234 814 455 6677", "tunde.adebayo@unn.edu.ng", "400 Level"],
  ["2019/239677", "Bolanle Folake Ajayi", "Business Administration", "Business Administration", "B.Sc. Business Administration", "Female", "+234 802 887 3310", "bolanle.ajayi@unn.edu.ng", "600 Level"],
  ["2019/241558", "Oluwaseun Tobi Akinyemi", "Banking and Finance", "Business Administration", "B.Sc. Banking and Finance", "Male", "+234 803 112 5544", "oluwaseun.akinyemi@unn.edu.ng", "600 Level"],
  ["2023/247560", "Rukayat Omolara Yusuf", "Marketing", "Business Administration", "B.Sc. Marketing", "Female", "+234 905 112 4478", "rukayat.yusuf@unn.edu.ng", "200 Level"],
  ["2019/246048", "Chioma Faith Ibe", "Insurance", "Business Administration", "B.Sc. Insurance", "Female", "+234 803 556 3321", "chioma.ibe@unn.edu.ng", "600 Level"],

  // Health Sciences
  ["2023/245610", "Fatima Sani Ibrahim", "Medicine and Surgery", "Health Sciences", "MBBS", "Female", "+234 905 123 4567", "fatima.ibrahim@unn.edu.ng", "200 Level"],
  ["2023/251142", "Amina Binta Suleiman", "Medicine and Surgery", "Health Sciences", "MBBS", "Female", "+234 903 667 2214", "amina.suleiman@unn.edu.ng", "200 Level"],
  ["2023/243888", "Halima Abubakar Isa", "Nursing", "Health Sciences", "B.NSc. Nursing", "Female", "+234 903 445 6677", "halima.isa@unn.edu.ng", "200 Level"],
  ["2023/248407", "Yusuf Kabir Sadiq", "Medical Laboratory Science", "Health Sciences", "B.MLS", "Male", "+234 905 778 9902", "yusuf.sadiq@unn.edu.ng", "200 Level"],

  // Biological Sciences
  ["2021/238855", "Blessing Ifeoma Okonkwo", "Microbiology", "Biological Sciences", "B.Sc. Microbiology", "Female", "+234 803 991 4477", "blessing.okonkwo@unn.edu.ng", "400 Level"],
  ["2020/243761", "Amaka Grace Nwankwo", "Biochemistry", "Biological Sciences", "B.Sc. Biochemistry", "Female", "+234 807 445 9912", "amaka.nwankwo@unn.edu.ng", "500 Level"],
  ["2022/240789", "Nneka Joy Ezeani", "Zoology and Environmental Biology", "Biological Sciences", "B.Sc. Zoology", "Female", "+234 806 889 3322", "nneka.ezeani@unn.edu.ng", "300 Level"],

  // Physical Sciences
  ["2023/246058", "Segun Ayodele Ogunleye", "Statistics", "Physical Sciences", "B.Sc. Statistics", "Male", "+234 902 118 3366", "segun.ogunleye@unn.edu.ng", "200 Level"],
  ["2020/244330", "Ahmed Sani Garba", "Physics and Astronomy", "Physical Sciences", "B.Sc. Physics", "Male", "+234 815 667 1109", "ahmed.garba@unn.edu.ng", "500 Level"],
  ["2019/243447", "Amina Hauwa Lawal", "Chemistry", "Physical Sciences", "B.Sc. Chemistry", "Female", "+234 810 223 9987", "amina.lawal@unn.edu.ng", "600 Level"],
  ["2021/245882", "David Chinedu Ilo", "Geology", "Physical Sciences", "B.Sc. Geology", "Male", "+234 803 778 9934", "david.ilo@unn.edu.ng", "400 Level"],
  ["2023/250301", "Chidera Franklin Eze", "Surveying and Geoinformatics", "Environmental Studies", "B.Sc. Surveying", "Male", "+234 815 334 7790", "chidera.eze@unn.edu.ng", "200 Level"],
  ["2020/241073", "Kayode Emmanuel Ilesanmi", "Estate Management", "Environmental Studies", "B.Sc. Estate Management", "Male", "+234 806 445 7781", "kayode.ilesanmi@unn.edu.ng", "500 Level"],

  // Law
  ["2020/239508", "Ngozi Adaobi Umeh", "Law", "Law", "LL.B.", "Female", "+234 802 774 1123", "ngozi.umeh@unn.edu.ng", "500 Level"],
  ["2023/249015", "Grace Onyinye Mba", "Law", "Law", "LL.B.", "Female", "+234 902 334 7781", "grace.mba@unn.edu.ng", "200 Level"],

  // Pharmaceutical and Veterinary Sciences
  ["2023/244902", "Zainab Yusuf Mohammed", "Pharmacy", "Pharmaceutical Sciences", "Pharm.D.", "Female", "+234 706 334 8890", "zainab.mohammed@unn.edu.ng", "200 Level"],
  ["2020/240921", "Tobenna Charles Uche", "Veterinary Medicine", "Veterinary Medicine", "D.V.M.", "Male", "+234 812 990 3345", "tobenna.uche@unn.edu.ng", "500 Level"],

  // Arts
  ["2022/242664", "Chinaza Precious Okafor", "English and Literary Studies", "Arts", "B.A. English", "Female", "+234 806 220 3344", "chinaza.okafor@unn.edu.ng", "300 Level"],
  ["2020/246608", "Mariam Yetunde Balogun", "Theatre and Film Studies", "Arts", "B.A. Theatre Arts", "Female", "+234 703 887 4456", "mariam.balogun@unn.edu.ng", "500 Level"],
  ["2022/248617", "Ijeoma Blessing Okoro", "Philosophy", "Arts", "B.A. Philosophy", "Female", "+234 704 112 3399", "ijeoma.okoro@unn.edu.ng", "300 Level"],
  ["2020/247991", "Yetunde Ayo Salami", "Music", "Arts", "B.A. Music", "Female", "+234 815 990 2244", "yetunde.salami@unn.edu.ng", "500 Level"],

  // Education and Agriculture
  ["2021/246301", "Uchenna Vincent Okeke", "Computer Education", "Education", "B.Sc. Ed. Computer Science", "Male", "+234 811 223 4456", "uchenna.okeke@unn.edu.ng", "400 Level"],
  ["2019/244015", "Esther Ngozi Ali", "Library and Information Science", "Education", "B.LIS", "Female", "+234 806 334 8876", "esther.ali@unn.edu.ng", "600 Level"],
  ["2022/243390", "Samuel Osita Ngwu", "Agricultural Economics", "Agriculture", "B.Sc. Agricultural Economics", "Male", "+234 809 445 1123", "samuel.ngwu@unn.edu.ng", "300 Level"]
];

const DEMO_STUDENT_RECORDS = DEMO_STUDENT_TABLE.map(
  ([registrationNumber, fullName, department, faculty, programme, gender, phone, email, level]) => ({
    registrationNumber,
    fullName,
    department,
    faculty,
    programme,
    gender,
    phone,
    email,
    level
  })
);

/* -------------------------------------------------------------------------- */
/* Portal issue catalogue                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every issue a student can raise from the portal, in the order they appear.
 * `fee` is in naira. Whether the student must visit the ICT Center is NOT a
 * property of the issue: staff decide that per ticket, after reading it, and
 * say so in the email they send (see /api/staff/tickets/:id/respond). Labels
 * mirror PORTAL_ISSUE_TYPES so the contact form and the stepper agree.
 */
const PORTAL_ISSUES = [
  {
    id: "access",
    label: "Cannot log in or access my account",
    summary: "Password resets and locked accounts.",
    fee: 0
  },
  {
    id: "profile",
    label: "Student profile",
    summary: "Names, date of birth, passport photo and other profile data.",
    fee: 0
  },
  {
    id: "email",
    label: "Change of email address",
    summary: "Move your portal account to a new email address.",
    fee: 2000
  },
  {
    id: "level",
    label: "Upgrade of level",
    summary: "Promote your portal record to the next level of study.",
    fee: 0
  },
  {
    id: "add-course",
    label: "Adding of course",
    summary: "Register an additional course for the semester.",
    fee: 2000
  },
  {
    id: "drop-course",
    label: "Dropping of course",
    summary: "Remove a registered course from the semester.",
    fee: 2000
  },
  {
    id: "extra-unit",
    label: "Extra unit (Final Year)",
    summary: "Extra units carried over from an earlier session.",
    fee: 5000
  },
  {
    id: "late-registration",
    label: "Late course registration",
    summary: "Registration after the portal window has closed.",
    fee: 10000
  }
];

const issuesById = new Map(PORTAL_ISSUES.map((issue) => [issue.id, issue]));

function normalizeRegistrationNumber(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/^UNN[/\s-]*/, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
}

function loadStudentRecords() {
  const records = new Map();

  const add = (record) => {
    if (!record || typeof record !== "object") return;
    const key = normalizeRegistrationNumber(record.registrationNumber);
    if (!key || typeof record.fullName !== "string") return;
    records.set(key, {
      registrationNumber: String(record.registrationNumber).trim(),
      fullName: record.fullName.trim(),
      department: String(record.department || "").trim(),
      faculty: String(record.faculty || "").trim(),
      programme: String(record.programme || "").trim(),
      gender: String(record.gender || "").trim(),
      phone: String(record.phone || "").trim(),
      email: String(record.email || "").trim(),
      level: String(record.level || "").trim()
    });
  };

  if (config.studentRecordsFile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.resolve(config.studentRecordsFile), "utf8"));
      const list = Array.isArray(parsed) ? parsed : parsed.students;
      if (!Array.isArray(list)) throw new Error("expected a JSON array of student records");
      list.forEach(add);
      console.log(`[portal] Loaded ${records.size} student record(s) from ${config.studentRecordsFile}`);
      return { records, source: config.studentRecordsFile, demo: false };
    } catch (error) {
      console.error(`[portal] Could not read STUDENT_RECORDS_FILE: ${error.message}`);
      console.error("[portal] Falling back to the built-in demo records.");
    }
  }

  DEMO_STUDENT_RECORDS.forEach(add);
  return { records, source: "Built-in demo roster", demo: true };
}

const studentDirectory = loadStudentRecords();
const studentRecords = studentDirectory.records;
const studentRecordsAreDemo = studentDirectory.demo;

/** The fields of a student record that the browser is allowed to see. */
function publicStudent(student) {
  return {
    registrationNumber: student.registrationNumber,
    fullName: student.fullName,
    department: student.department,
    faculty: student.faculty,
    programme: student.programme,
    gender: student.gender,
    phone: student.phone,
    email: student.email,
    level: student.level
  };
}

/* --- Name matching -------------------------------------------------------- */

function nameTokens(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s']/g, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

function nameSimilarity(a, b) {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

/**
 * Compare the name a visitor typed with the name on record. Order is ignored
 * (surname first is common), middle names are optional, and small spelling
 * differences are tolerated. Anything beyond that is a mismatch.
 */
function namesMatch(entered, onRecord) {
  const typed = nameTokens(entered);
  const record = nameTokens(onRecord);
  if (typed.length < 2 || record.length < 2) return false;

  const sortedTyped = [...typed].sort().join(" ");
  const sortedRecord = [...record].sort().join(" ");
  if (sortedTyped === sortedRecord) return true;

  // Middle names present on one side only.
  const [shorter, longer] = typed.length <= record.length ? [typed, record] : [record, typed];
  if (shorter.length >= 2 && shorter.every((token) => longer.includes(token))) return true;

  return nameSimilarity(sortedTyped, sortedRecord) >= 0.86;
}

/* --- Persistent stores ---------------------------------------------------- */

const portalDir = path.join(config.dataDir, "portal");
const paymentsFile = path.join(portalDir, "payments.ndjson");
const ticketsFile = path.join(portalDir, "tickets.ndjson");
const receiptsDir = path.join(portalDir, "receipts");

function readJsonLines(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

const payments = new Map();
for (const payment of readJsonLines(paymentsFile)) {
  if (payment && typeof payment.reference === "string") payments.set(payment.reference, payment);
}

// The ticket log is append-only: resolving writes a fresh copy of the record.
// Collapse it by id on load so each ticket appears once, in its latest state.
const tickets = [];
{
  const latestById = new Map();
  for (const ticket of readJsonLines(ticketsFile)) {
    if (ticket && typeof ticket.id === "string") latestById.set(ticket.id, ticket);
  }
  tickets.push(...latestById.values());
}

let ticketSequence = tickets.reduce((highest, ticket) => {
  const match = typeof ticket.id === "string" ? ticket.id.match(/(\d+)$/) : null;
  return match ? Math.max(highest, Number(match[1])) : highest;
}, 0);

function persistPayment(payment) {
  payments.set(payment.reference, payment);
  appendJsonLine(paymentsFile, payment);
  return payment;
}

function persistTicket(ticket) {
  tickets.push(ticket);
  appendJsonLine(ticketsFile, ticket);
  return ticket;
}

function nextTicketId() {
  ticketSequence += 1;
  return `ICT-P-${new Date().getFullYear()}-${String(ticketSequence).padStart(4, "0")}`;
}

function newPaymentReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `ICT-${stamp}-${random}`;
}

/** A Remita-style Retrieval Reference, derived from the payment reference. */
function retrievalReference(reference) {
  const digest = crypto.createHash("sha256").update(`rrr:${reference}`).digest();
  const value = digest.readUIntBE(0, 6) % 900000000000;
  return String(value + 100000000000);
}

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

function publicIssue(issue) {
  return {
    id: issue.id,
    label: issue.label,
    summary: issue.summary,
    fee: issue.fee,
    feeLabel: issue.fee > 0 ? formatNaira(issue.fee) : "Free",
    requiresPayment: issue.fee > 0
  };
}

/* --- Student lookup ------------------------------------------------------- */

function findStudent(registrationNumber, name) {
  const key = normalizeRegistrationNumber(registrationNumber);
  if (!key) return { status: "missing" };

  const record = studentRecords.get(key);
  if (!record) return { status: "not-found" };

  if (!namesMatch(name, record.fullName)) return { status: "mismatch", student: record };
  return { status: "ok", student: record };
}

/* --- Payments ------------------------------------------------------------- */

const PAYSTACK_API = "https://api.paystack.co";

function paymentConfigured() {
  if (config.paymentMode === "paystack") return Boolean(config.paystackSecretKey);
  if (config.paymentMode === "remita") {
    return Boolean(config.remitaMerchantId && config.remitaServiceTypeId && config.remitaApiKey);
  }
  return true; // simulated always works
}

function siteOrigin(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (request.socket && request.socket.encrypted ? "https" : "http");
  const host = requestHostname(request) || `localhost:${config.port}`;
  return `${proto}://${host}`;
}

async function createPaystackCheckout(payment, origin) {
  const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.paystackSecretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: payment.student.email,
      amount: payment.amount * 100,
      reference: payment.reference,
      currency: "NGN",
      callback_url: `${origin}/?page=portal&payment=${encodeURIComponent(payment.reference)}`,
      metadata: { issueId: payment.issueId, registrationNumber: payment.registrationNumber }
    }),
    signal: AbortSignal.timeout(12000)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.status || !body.data || !body.data.authorization_url) {
    throw new Error((body && body.message) || `Paystack rejected the request (${response.status})`);
  }
  return body.data.authorization_url;
}

async function verifyPaystackPayment(payment) {
  const response = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(payment.reference)}`,
    {
      headers: { Authorization: `Bearer ${config.paystackSecretKey}` },
      signal: AbortSignal.timeout(12000)
    }
  );
  const body = await response.json().catch(() => ({}));
  return Boolean(body.status && body.data && body.data.status === "success");
}

async function createRemitaRrr(payment) {
  const { remitaMerchantId, remitaServiceTypeId, remitaApiKey, remitaBaseUrl } = config;
  const orderId = payment.reference;
  const hash = crypto
    .createHash("sha512")
    .update(`${remitaMerchantId}${remitaServiceTypeId}${orderId}${payment.amount}${remitaApiKey}`)
    .digest("hex");

  const response = await fetch(
    `${remitaBaseUrl}/remita/exapp/api/v1/send/api/echannelsvc/merchant/api/paymentinit`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `remitaConsumerKey=${remitaMerchantId},remitaConsumerToken=${hash}`
      },
      body: JSON.stringify({
        serviceTypeId: remitaServiceTypeId,
        amount: String(payment.amount),
        orderId,
        payerName: payment.student.fullName,
        payerEmail: payment.student.email,
        payerPhone: payment.student.phone,
        description: `ICT Center — ${payment.issueLabel}`
      }),
      signal: AbortSignal.timeout(15000)
    }
  );

  const raw = await response.text();
  let body = {};
  try {
    body = JSON.parse(raw.replace(/^jsonp\s*\(|\)\s*;?$/g, ""));
  } catch {
    throw new Error(`Remita returned an unexpected response (${response.status})`);
  }
  if (!body.RRR) throw new Error(body.statusMessage || "Remita did not return a reference");
  return body.RRR;
}

/**
 * Create a payment for an issue and return whatever the browser needs next:
 * a hosted checkout URL for card payments, or the account details for a
 * transfer. No card data passes through this server.
 */
async function createPayment({ student, issue, method, origin }) {
  const payment = {
    reference: newPaymentReference(),
    amount: issue.fee,
    currency: "NGN",
    method,
    status: method === "transfer" ? "awaiting-transfer" : "pending",
    provider: config.paymentMode,
    registrationNumber: student.registrationNumber,
    student: {
      fullName: student.fullName,
      email: student.email,
      phone: student.phone,
      department: student.department
    },
    issueId: issue.id,
    issueLabel: issue.label,
    createdAt: new Date().toISOString(),
    paidAt: null
  };

  if (method === "transfer") {
    payment.rrr = retrievalReference(payment.reference);
    persistPayment(payment);
    return { payment, account: config.transferAccount };
  }

  if (config.paymentMode === "paystack" && config.paystackSecretKey) {
    payment.checkoutUrl = await createPaystackCheckout(payment, origin);
  } else if (config.paymentMode === "remita" && paymentConfigured()) {
    payment.rrr = await createRemitaRrr(payment);
    payment.checkoutUrl =
      `${config.remitaBaseUrl}/remita/ecomm/finalize.ics` +
      `?merchantId=${encodeURIComponent(config.remitaMerchantId)}` +
      `&rrr=${encodeURIComponent(payment.rrr)}` +
      `&responseurl=${encodeURIComponent(`${origin}/?page=portal&payment=${encodeURIComponent(payment.reference)}`)}`;
  } else {
    // Simulated: the checkout page lives on this site but card fields are
    // never submitted — see the notice on that page.
    payment.rrr = retrievalReference(payment.reference);
    payment.checkoutUrl = `${origin}/pay/${encodeURIComponent(payment.reference)}`;
  }

  persistPayment(payment);
  return { payment, account: null };
}

async function confirmPayment(payment, { verifiedBy }) {
  if (payment.status === "paid") return payment;
  payment.status = "paid";
  payment.paidAt = new Date().toISOString();
  payment.verifiedBy = verifiedBy;
  appendJsonLine(paymentsFile, payment);
  return payment;
}

/** Re-check a payment's real status with the configured provider. */
async function refreshPaymentStatus(payment) {
  if (payment.status === "paid" || payment.status === "awaiting-transfer" || payment.status === "receipt-submitted") {
    return payment;
  }

  try {
    if (payment.provider === "paystack" && config.paystackSecretKey) {
      if (await verifyPaystackPayment(payment)) await confirmPayment(payment, { verifiedBy: "paystack" });
    } else if (payment.provider === "remita" && payment.rrr) {
      const response = await fetch(
        `${config.remitaBaseUrl}/remita/ecomm/${encodeURIComponent(config.remitaMerchantId)}/` +
          `${encodeURIComponent(payment.rrr)}/status.reg`,
        { signal: AbortSignal.timeout(10000) }
      );
      const body = await response.json().catch(() => ({}));
      const flag = String(body.status || body.statusCode || "");
      const label = String(body.message || body.statusMessage || "");
      if (flag.startsWith("00") && /success|paid/i.test(label)) {
        await confirmPayment(payment, { verifiedBy: "remita" });
      }
    }
  } catch (error) {
    console.error("[portal] Could not refresh payment status:", error.message);
  }
  return payment;
}

/* --- Receipts ------------------------------------------------------------- */

const RECEIPT_TYPES = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf"
};

function saveReceipt(ticketId, dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;

  const match = dataUrl.match(/^data:([a-z/+-]+);base64,(.+)$/i);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const extension = RECEIPT_TYPES[mime];
  if (!extension) return null;

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > config.maxUploadBytes) return null;

  fs.mkdirSync(receiptsDir, { recursive: true });
  const filePath = path.join(receiptsDir, `${ticketId}${extension}`);
  fs.writeFileSync(filePath, buffer, { mode: 0o600 });
  return { filePath, mime, size: buffer.length, extension };
}

function findReceipt(ticketId) {
  for (const [mime, extension] of Object.entries(RECEIPT_TYPES)) {
    const filePath = path.join(receiptsDir, `${ticketId}${extension}`);
    if (fs.existsSync(filePath)) return { filePath, mime };
  }
  return null;
}

/* --- Messages ------------------------------------------------------------- */

function portalTicketMessage(ticket) {
  const details = [
    ["Ticket", ticket.id],
    ["Student", ticket.student.fullName],
    ["Registration number", ticket.student.registrationNumber],
    ["Department", ticket.student.department],
    ["Level", ticket.student.level],
    ["Gender", ticket.student.gender],
    ["Phone number", ticket.student.phone],
    ["Email", ticket.student.email],
    ["Portal issue", ticket.issue.label],
    ["Service fee", ticket.payment ? formatNaira(ticket.payment.amount) : "Free"],
    [
      "Payment status",
      ticket.paymentStatus === "paid"
        ? "Paid"
        : ticket.paymentStatus === "receipt-submitted"
          ? "Transfer receipt uploaded — verify before starting"
          : "Not required"
    ],
    ["Payment reference", ticket.payment ? ticket.payment.reference : "—"],
    ["RRR", ticket.payment && ticket.payment.rrr ? ticket.payment.rrr : "—"],
    ["Problem description", ticket.description],
    ["Submitted", ticket.createdAt]
  ];

  const heading = `New portal request — ${ticket.issue.label}`;
  return {
    kind: "portal-ticket",
    subject: `${ticket.id} — ${ticket.issue.label} — ${ticket.student.fullName}`,
    replyTo: ticket.student.email,
    heading,
    details,
    text: renderText(heading, details),
    html: renderHtml(heading, details, new Date(ticket.createdAt).toUTCString())
  };
}

function studentResolvedMessage(ticket, note) {
  const firstName = ticket.student.fullName.split(" ")[0];
  const lines = [
    `Hello ${firstName},`,
    "",
    "Your portal issue has been fixed.",
    "",
    `Ticket: ${ticket.id}`,
    `Issue: ${ticket.issue.label}`,
    ...(note ? [`Note from the team: ${note}`] : []),
    "",
    "If the problem continues, reply to this email or visit the ICT Center and quote your ticket number.",
    "",
    "ICT Innovation Center",
    "University of Nigeria, Nsukka"
  ];

  const text = lines.join("\n");
  const html = `<div style="font:400 14px/1.7 Arial,sans-serif;color:#111;max-width:600px;">
    <p>Hello ${escapeHtml(firstName)},</p>
    <p><strong>Your portal issue has been fixed.</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font:400 13px/1.8 Arial,sans-serif;color:#222;">
      <tr><td style="padding-right:14px;color:#555;">Ticket</td><td>${escapeHtml(ticket.id)}</td></tr>
      <tr><td style="padding-right:14px;color:#555;">Issue</td><td>${escapeHtml(ticket.issue.label)}</td></tr>
      ${note ? `<tr><td style="padding-right:14px;color:#555;">Note</td><td>${escapeHtml(note)}</td></tr>` : ""}
    </table>
    <p>If the problem continues, reply to this email or visit the ICT Center and quote your ticket number.</p>
    <p style="color:#555;">ICT Innovation Center<br>University of Nigeria, Nsukka</p>
  </div>`;

  return {
    kind: "portal-resolved",
    subject: `Your portal issue has been fixed — ${ticket.id}`,
    replyTo: config.innovationEmail,
    heading: "Portal issue resolved",
    details: [
      ["Ticket", ticket.id],
      ["Issue", ticket.issue.label],
      ...(note ? [["Note", note]] : [])
    ],
    text,
    html
  };
}

/**
 * The "please come to the ICT Center" email. Sent instead of the resolved
 * email when staff decide the matter cannot be finished remotely.
 */
function studentVisitMessage(ticket, note, visitWhen) {
  const firstName = ticket.student.fullName.split(" ")[0];
  const when = (visitWhen || "").trim();

  const lines = [
    `Hello ${firstName},`,
    "",
    "We have looked at your portal request. To finish it, please come to the ICT Innovation Center in person.",
    "",
    `Ticket: ${ticket.id}`,
    `Issue: ${ticket.issue.label}`,
    ...(when ? [`Please come: ${when}`] : []),
    ...(note ? [`Note from the team: ${note}`] : []),
    "",
    "Bring your student ID card and quote the ticket number above at the front desk.",
    "",
    "ICT Innovation Center",
    "University of Nigeria, Nsukka"
  ];

  const text = lines.join("\n");
  const html = `<div style="font:400 14px/1.7 Arial,sans-serif;color:#111;max-width:600px;">
    <p>Hello ${escapeHtml(firstName)},</p>
    <p><strong>Please come to the ICT Innovation Center to finish your portal request.</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font:400 13px/1.8 Arial,sans-serif;color:#222;">
      <tr><td style="padding-right:14px;color:#555;">Ticket</td><td>${escapeHtml(ticket.id)}</td></tr>
      <tr><td style="padding-right:14px;color:#555;">Issue</td><td>${escapeHtml(ticket.issue.label)}</td></tr>
      ${when ? `<tr><td style="padding-right:14px;color:#555;">Please come</td><td>${escapeHtml(when)}</td></tr>` : ""}
      ${note ? `<tr><td style="padding-right:14px;color:#555;">Note</td><td>${escapeHtml(note)}</td></tr>` : ""}
    </table>
    <p>Bring your student ID card and quote the ticket number above at the front desk.</p>
    <p style="color:#555;">ICT Innovation Center<br>University of Nigeria, Nsukka</p>
  </div>`;

  return {
    kind: "portal-visit",
    subject: `Please come to the ICT Center — ${ticket.id}`,
    replyTo: config.innovationEmail,
    heading: "Portal request — visit required",
    details: [
      ["Ticket", ticket.id],
      ["Issue", ticket.issue.label],
      ...(when ? [["Please come", when]] : []),
      ...(note ? [["Note", note]] : [])
    ],
    text,
    html
  };
}

/* -------------------------------------------------------------------------- */
/* Innovation: meeting bookings                                              */
/* -------------------------------------------------------------------------- */
/*
 * A meeting is booked for one section (facility or outside), one date and one
 * hourly slot. The time ranges are the Center's working hours:
 *
 *   facility 10:00 – 16:00      outside 10:00 – 18:00
 *
 * Only one client can hold a given section + date + time. Bookings live on disk
 * (data/meetings.ndjson) so a refresh, a restart or a busy day never loses one.
 */

const MEETING_SECTIONS = {
  facility: {
    id: "facility",
    label: "At an ICT Center facility",
    summary: "Conference room or other Center facility",
    startHour: 10,
    endHour: 16
  },
  outside: {
    id: "outside",
    label: "At my location (outside the Center)",
    summary: "The team comes to you",
    startHour: 10,
    endHour: 18
  }
};

const meetingsFile = path.join(config.dataDir, "meetings.ndjson");

const meetings = [];
{
  const latestById = new Map();
  for (const meeting of readJsonLines(meetingsFile)) {
    if (meeting && typeof meeting.id === "string") latestById.set(meeting.id, meeting);
  }
  meetings.push(...latestById.values());
}

let meetingSequence = meetings.reduce((highest, meeting) => {
  const match = typeof meeting.id === "string" ? meeting.id.match(/(\d+)$/) : null;
  return match ? Math.max(highest, Number(match[1])) : highest;
}, 0);

function nextMeetingId() {
  meetingSequence += 1;
  return `ICT-M-${new Date().getFullYear()}-${String(meetingSequence).padStart(4, "0")}`;
}

function persistMeeting(meeting) {
  const index = meetings.findIndex((entry) => entry.id === meeting.id);
  if (index >= 0) meetings[index] = meeting;
  else meetings.push(meeting);
  appendJsonLine(meetingsFile, meeting);
  return meeting;
}

/** "Thursday, 20 November 2026" for a YYYY-MM-DD string. */
function longDate(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(dateString || "");
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

/** Today's date at the Center, as YYYY-MM-DD. */
function centerToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Every hourly slot a section offers, as "HH:00". */
function sectionSlots(section) {
  const slots = [];
  for (let hour = section.startHour; hour < section.endHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return slots;
}

function slotLabel(time) {
  const hour = Number(String(time).split(":")[0]);
  const shape = (value) => {
    const suffix = value >= 12 ? "pm" : "am";
    const twelve = value % 12 === 0 ? 12 : value % 12;
    return `${twelve}${suffix}`;
  };
  return `${shape(hour)} – ${shape(hour + 1)}`;
}

/** Bookings that still hold their slot. Declined or cancelled ones release it. */
function activeMeetings() {
  return meetings.filter((meeting) => meeting.status === "pending" || meeting.status === "accepted");
}

function slotTaken(meetingType, date, time, ignoreId = null) {
  return activeMeetings().some(
    (meeting) =>
      meeting.meetingType === meetingType &&
      meeting.date === date &&
      meeting.time === time &&
      meeting.id !== ignoreId
  );
}

function meetingAvailability(meetingType, fromDate, dayCount) {
  const section = MEETING_SECTIONS[meetingType];
  const taken = new Set(
    activeMeetings()
      .filter((meeting) => meeting.meetingType === meetingType)
      .map((meeting) => `${meeting.date} ${meeting.time}`)
  );

  const days = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(fromDate, offset);
    const slots = sectionSlots(section).map((time) => ({
      time,
      label: slotLabel(time),
      taken: taken.has(`${date} ${time}`)
    }));
    days.push({
      date,
      weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
      slots,
      free: slots.filter((slot) => !slot.taken).length
    });
  }

  return {
    section: {
      id: section.id,
      label: section.label,
      summary: section.summary,
      opens: `${String(section.startHour).padStart(2, "0")}:00`,
      closes: `${String(section.endHour).padStart(2, "0")}:00`,
      opensLabel: slotLabel(`${String(section.startHour).padStart(2, "0")}:00`).split(" – ")[0],
      closesLabel: slotLabel(`${String(section.endHour - 1).padStart(2, "0")}:00`).split(" – ")[1]
    },
    from: fromDate,
    today: centerToday(),
    days
  };
}

function meetingSummary(meeting) {
  const section = MEETING_SECTIONS[meeting.meetingType] || MEETING_SECTIONS.facility;
  return {
    id: meeting.id,
    status: meeting.status,
    createdAt: meeting.createdAt,
    decidedAt: meeting.decidedAt || null,
    meetingType: meeting.meetingType,
    meetingTypeLabel: section.label,
    sectionLabel: section.label,
    date: meeting.date,
    dateLabel: longDate(meeting.date),
    time: meeting.time,
    timeLabel: slotLabel(meeting.time),
    name: meeting.name,
    gender: meeting.gender,
    phone: meeting.phone,
    email: meeting.email,
    department: meeting.department,
    location: meeting.location || "",
    description: meeting.description,
    note: meeting.note || "",
    emailedAt: meeting.emailedAt || null
  };
}

function validateMeetingBooking(payload) {
  const value = normalizePayload(payload);

  const required = ["name", "gender", "phone", "email", "department", "description", "meetingType", "date", "time"];
  for (const key of required) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      return "Please complete all required fields, including the date and time.";
    }
  }

  if (!isEmailAddress(value.email)) return "Please enter a valid email address.";
  if (!isPhoneNumber(value.phone)) return "Please enter a valid phone number.";
  if (!GENDER_OPTIONS.includes(value.gender)) return "Choose a valid gender option.";

  const section = MEETING_SECTIONS[value.meetingType];
  if (!section) return "Choose a valid meeting type.";

  if (!isValidDateString(value.date)) return "Choose a valid date from the calendar.";

  const today = centerToday();
  if (value.date < today) return "That date has already passed. Choose another day.";
  if (value.date > addDays(today, 120)) return "Bookings open 120 days ahead. Choose an earlier date.";

  if (!sectionSlots(section).includes(value.time)) {
    return `Choose a time between ${slotLabel(sectionSlots(section)[0]).split(" – ")[0]} and ${
      slotLabel(sectionSlots(section)[sectionSlots(section).length - 1]).split(" – ")[1]
    }.`;
  }

  if (value.meetingType === "outside" && (typeof value.location !== "string" || !value.location.trim())) {
    return "Please provide the meeting location.";
  }

  const limits = { name: 120, phone: 30, email: 120, department: 120, description: 3000, location: 240 };
  for (const [key, maxLength] of Object.entries(limits)) {
    if (value[key] === undefined || value[key] === null) continue;
    if (typeof value[key] !== "string" || value[key].length > maxLength) {
      return "One or more fields are invalid or exceed the allowed length.";
    }
  }

  if (hasControlCharacters(value)) return "One or more fields contain characters that are not allowed.";
  return null;
}

function meetingDeskMessage(meeting) {
  const summary = meetingSummary(meeting);
  const details = [
    ["Meeting request", meeting.id],
    ["Section", summary.meetingTypeLabel],
    ["Date", longDate(meeting.date)],
    ["Time", `${summary.timeLabel} (WAT)`],
    ["Name", meeting.name],
    ["Gender", meeting.gender],
    ["Email", meeting.email],
    ["Phone number", meeting.phone],
    ["Department / company", meeting.department],
    ...(meeting.location ? [["Location", meeting.location]] : []),
    ["Details", meeting.description],
    ["Payment", "Onsite, after the meeting is confirmed"],
    ["Submitted", meeting.createdAt]
  ];
  const heading = `New meeting request — ${summary.meetingTypeLabel}`;
  return {
    kind: "meeting-request",
    subject: `${meeting.id} — ${summary.meetingTypeLabel} — ${longDate(meeting.date)} ${summary.timeLabel}`,
    replyTo: meeting.email,
    heading,
    details,
    text: renderText(heading, details),
    html: renderHtml(heading, details, new Date(meeting.createdAt).toUTCString())
  };
}

function meetingDecisionMessage(meeting, action, note) {
  const summary = meetingSummary(meeting);
  const firstName = String(meeting.name).split(" ")[0];
  const accepted = action === "accepted";
  const when = `${longDate(meeting.date)} at ${summary.timeLabel} (WAT)`;

  const lines = [
    `Hello ${firstName},`,
    "",
    accepted
      ? `Your meeting request has been accepted. We will see you on ${when}.`
      : "We are sorry, but we cannot host this meeting on the date you chose.",
    "",
    `Reference: ${meeting.id}`,
    `Section: ${summary.meetingTypeLabel}`,
    ...(meeting.location ? [`Location: ${meeting.location}`] : []),
    ...(note ? [`Message from the team: ${note}`] : []),
    "",
    accepted
      ? "Payment for the service is made onsite on the day, so there is nothing to pay now."
      : "You are welcome to send another request for a different date.",
    "",
    "ICT Innovation Center",
    "University of Nigeria, Nsukka"
  ];

  const text = lines.join("\n");
  const html = `<div style="font:400 14px/1.7 Arial,sans-serif;color:#111;max-width:600px;">
    <p>Hello ${escapeHtml(firstName)},</p>
    <p><strong>${
      accepted
        ? `Your meeting request has been accepted for ${escapeHtml(when)}.`
        : "We are sorry, but we cannot host this meeting on the date you chose."
    }</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font:400 13px/1.8 Arial,sans-serif;color:#222;">
      <tr><td style="padding-right:14px;color:#555;">Reference</td><td>${escapeHtml(meeting.id)}</td></tr>
      <tr><td style="padding-right:14px;color:#555;">Section</td><td>${escapeHtml(summary.meetingTypeLabel)}</td></tr>
      ${meeting.location ? `<tr><td style="padding-right:14px;color:#555;">Location</td><td>${escapeHtml(meeting.location)}</td></tr>` : ""}
      ${note ? `<tr><td style="padding-right:14px;color:#555;">Message</td><td>${escapeHtml(note)}</td></tr>` : ""}
    </table>
    <p>${
      accepted
        ? "Payment for the service is made onsite on the day, so there is nothing to pay now."
        : "You are welcome to send another request for a different date."
    }</p>
    <p style="color:#555;">ICT Innovation Center<br>University of Nigeria, Nsukka</p>
  </div>`;

  return {
    kind: accepted ? "meeting-accepted" : "meeting-declined",
    subject: accepted
      ? `Your meeting is confirmed — ${longDate(meeting.date)} — ${meeting.id}`
      : `Meeting request declined — ${meeting.id}`,
    replyTo: config.innovationEmail,
    heading: accepted ? "Meeting confirmed" : "Meeting declined",
    details: [
      ["Reference", meeting.id],
      ["Section", summary.meetingTypeLabel],
      ["Date", longDate(meeting.date)],
      ["Time", summary.timeLabel],
      ...(note ? [["Message", note]] : [])
    ],
    text,
    html
  };
}

/* --- Staff sessions and live notifications -------------------------------- */

const staffSessions = new Map();
const staffListeners = new Set();
const STAFF_SESSION_MS = 8 * 60 * 60 * 1000;

/*
 * Two desks, two codes:
 *   portal     — the Portal Unit request desk (STAFF_ACCESS_CODE)
 *   innovation — the Innovation Unit meeting desk (INNOVATION_ACCESS_CODE)
 * Each desk has its own cookie and its own session, so a code opens exactly
 * one section. Signing in at one desk clears the other desk's cookie in that
 * browser, which keeps the tab from bouncing back to the previous section.
 * Two officers on two machines are unaffected.
 */
const STAFF_DESKS = {
  portal: {
    id: "portal",
    label: "Portal Unit",
    cookie: "ict_staff_session",
    code: config.staffAccessCode || String(crypto.randomInt(100000, 999999))
  },
  innovation: {
    id: "innovation",
    label: "Innovation Unit",
    cookie: "ict_innovation_session",
    code: config.innovationAccessCode || String(crypto.randomInt(100000, 999999))
  }
};

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Which desk does this code belong to, if any? */
function deskForCode(code) {
  for (const desk of Object.values(STAFF_DESKS)) {
    if (constantTimeEqual(code, desk.code)) return desk.id;
  }
  return null;
}

function createStaffSession(code) {
  const desk = deskForCode(code);
  if (!desk) return null;
  const id = crypto.randomBytes(24).toString("hex");
  staffSessions.set(id, { expiresAt: Date.now() + STAFF_SESSION_MS, desk });
  return { id, desk };
}

function getCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  const match = cookies.map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

/** The desk this request's session belongs to, or null. */
function staffDeskOf(request) {
  for (const desk of Object.values(STAFF_DESKS)) {
    const id = getCookie(request, desk.cookie);
    if (!id) continue;
    const session = staffSessions.get(id);
    if (!session) continue;
    if (session.expiresAt <= Date.now()) {
      staffSessions.delete(id);
      continue;
    }
    if (session.desk === desk.id) return desk.id;
  }
  return null;
}

function staffSessionValid(request, deskId = "portal") {
  return staffDeskOf(request) === deskId;
}

function staffCookie(deskId, value, maxAgeSeconds) {
  const desk = STAFF_DESKS[deskId] || STAFF_DESKS.portal;
  const secure = config.isProduction ? "; Secure" : "";
  // Cross-port dev pages cannot read Strict cookies; production stays Strict.
  const sameSite = config.isProduction ? "Strict" : "Lax";
  return `${desk.cookie}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secure}`;
}

function broadcastToStaff(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of staffListeners) {
    try {
      client.write(payload);
    } catch {
      staffListeners.delete(client);
    }
  }
}

function ticketSummary(ticket) {
  return {
    id: ticket.id,
    status: ticket.status,
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt || null,
    student: ticket.student,
    issue: {
      id: ticket.issue.id,
      label: ticket.issue.label,
      fee: ticket.issue.fee,
      feeLabel: formatNaira(ticket.issue.fee)
    },
    payment: ticket.payment
      ? {
          reference: ticket.payment.reference,
          amount: ticket.payment.amount,
          amountLabel: formatNaira(ticket.payment.amount),
          method: ticket.payment.method,
          rrr: ticket.payment.rrr || null,
          status: ticket.paymentStatus
        }
      : null,
    paymentStatus: ticket.paymentStatus,
    description: ticket.description,
    hasReceipt: Boolean(ticket.receiptFile),
    // null until staff decide: "resolved" or "visit" (summoned to the Center)
    outcome: ticket.outcome || null,
    summonedAt: ticket.summonedAt || null,
    note: ticket.note || "",
    messages: Array.isArray(ticket.messages) ? ticket.messages : []
  };
}

/* ==========================================================================
   8. Static files
   --------------------------------------------------------------------------
   Only files that are part of the website may be served. Everything else —
   `.env`, `server.js`, `.git/`, `data/`, README — answers 404, so a
   misconfiguration can never leak credentials or server source.
   ========================================================================== */

const PUBLIC_FILES = new Set(["index.html", "styles.css", "app.js"]);
const PUBLIC_DIRS = ["assets"];

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function isPublicRequest(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (PUBLIC_FILES.has(normalized)) return true;
  return PUBLIC_DIRS.some((dir) => normalized.startsWith(`${dir}/`));
}

function etagFor(stats) {
  return `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
}

function serveFile(request, response, filePath, status = 200) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendNotFound(request, response);
      return;
    }

    const etag = etagFor(stats);
    const isHtml = filePath.endsWith(".html");
    const headers = {
      "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stats.size,
      "Last-Modified": stats.mtime.toUTCString(),
      ETag: etag,
      "Cache-Control": isHtml ? "no-cache" : "public, max-age=3600",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      ...SECURITY_HEADERS
    };

    const inm = request.headers["if-none-match"];
    if (status === 200 && typeof inm === "string" && inm.split(",").some((tag) => tag.trim() === etag)) {
      response.writeHead(304, { ETag: etag, "Cache-Control": headers["Cache-Control"] });
      response.end();
      return;
    }

    response.writeHead(status, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", (error) => {
      console.error("[static] read failed:", error.message);
      if (!response.writableEnded) response.destroy();
    });
    stream.pipe(response);
  });
}

function notFoundPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Page not found | ICT Innovation Center</title>
    <meta name="robots" content="noindex">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
             background: #fff; color: #111; font: 400 15px/1.6 Arial, Helvetica, sans-serif; }
      main { width: min(560px, 100%); }
      .brand { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 42px; text-decoration: none; color: #111; }
      .brand-mark { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 4px; background: #111; color: #fff; font: 700 12px Arial, sans-serif; }
      .brand strong { display: block; font-size: 10px; letter-spacing: 1.2px; }
      .brand small { display: block; color: #555; font-size: 10px; }
      .code { font: 700 11px Arial, sans-serif; letter-spacing: 1.6px; color: #555; }
      h1 { margin: 14px 0 12px; font: 700 clamp(30px, 6vw, 42px)/1.15 Arial, Helvetica, sans-serif; letter-spacing: -1.4px; }
      p { margin: 0 0 28px; color: #333; max-width: 440px; }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; }
      a.button { display: inline-flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 18px;
                 border-radius: 4px; background: #111; color: #fff; font-size: 12px; font-weight: 700; text-decoration: none; }
      a.mail { display: inline-flex; align-items: center; min-height: 46px; color: #111; font-size: 12px;
               font-weight: 700; text-decoration: none; border-bottom: 1px solid #111; }
    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">ICT</span>
        <span><strong>ICT INNOVATION CENTER</strong><small>University of Nigeria, Nsukka</small></span>
      </a>
      <p class="code">ERROR 404</p>
      <h1>This page doesn’t exist.</h1>
      <p>The link may be outdated, or the address may have been typed incorrectly. Head back to the homepage and find the team you need.</p>
      <div class="actions">
        <a class="button" href="/">Back to home <span aria-hidden="true">↗</span></a>
        <a class="mail" href="mailto:ict@unn.edu.ng">ict@unn.edu.ng</a>
      </div>
    </main>
  </body>
</html>`;
}

function sendNotFound(request, response) {
  sendHtml(response, 404, notFoundPage());
}

function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/" || pathname === "" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT, `.${path.posix.normalize(requestedPath)}`);
  const relativePath = path.relative(ROOT, filePath);

  const outsideRoot = relativePath.startsWith("..") || path.isAbsolute(relativePath);
  if (outsideRoot || !isPublicRequest(relativePath)) {
    sendNotFound(request, response);
    return;
  }

  serveFile(request, response, filePath);
}

/* ==========================================================================
   9. Router and startup
   ========================================================================== */

/* --- Shared guards -------------------------------------------------------- */

function guardSubmit(request, response, limiter = rateLimiter, bucket = "submit") {
  if (!isAllowedOrigin(request)) {
    sendJson(response, 403, { error: "This request was blocked for security reasons." });
    return false;
  }
  const limit = limiter.check(`${bucket}:${clientIp(request)}`);
  if (!limit.allowed) {
    sendJson(
      response,
      429,
      { error: "You have sent several requests in a short time. Please wait a few minutes and try again." },
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
    return false;
  }
  return true;
}

async function readPortalBody(request) {
  // Portal submissions may carry a receipt image, so they get a larger cap.
  return readJsonBody(request, config.maxUploadBytes + 256 * 1024);
}

/* --- Original contact / unit requests ------------------------------------- */

async function handleRequestEndpoint(request, response, route) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }
  if (!guardSubmit(request, response)) return;

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || "Please submit a valid request." });
    return;
  }

  const normalized = normalizePayload(payload);
  const validationError =
    route === "meeting" ? validateMeeting(normalized) : validateServiceRequest(normalized);

  if (validationError) {
    sendJson(response, 400, { error: validationError });
    return;
  }

  const now = new Date();
  const message = route === "meeting" ? meetingMessage(normalized, now) : serviceMessage(normalized, now);

  let result;
  try {
    result = await deliver(message, normalized);
  } catch (error) {
    console.error("[api] delivery crashed:", error.message);
    sendJson(response, 500, { error: "Your request could not be processed. Please try again later." });
    return;
  }

  if (!result.ok) {
    sendJson(response, result.status || 502, { error: result.error });
    return;
  }

  sendJson(response, 200, { message: "Request sent.", channel: result.channel, reference: result.id || null });
}

/* --- Portal: identify ----------------------------------------------------- */

/**
 * The demo roster, so a presenter can show where the search reads from.
 * Only available while the built-in demo records are in use and the server is
 * not in production — a real student export is never exposed here.
 */
function handleDemoRoster(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
    return;
  }
  if (!studentRecordsAreDemo || config.isProduction) {
    sendJson(response, 403, {
      error: "The demo roster is only available while the built-in demo records are in use."
    });
    return;
  }

  const query = (new URL(request.url, siteOrigin(request)).searchParams.get("q") || "").trim().toLowerCase();
  const all = [...studentRecords.values()];
  const matches = query
    ? all.filter((student) =>
        [student.fullName, student.registrationNumber, student.department, student.faculty, student.level]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
    : all;

  sendJson(response, 200, {
    demo: true,
    source: studentDirectory.source,
    total: all.length,
    returned: matches.length,
    students: matches.slice(0, 200).map(publicStudent)
  });
}

async function handlePortalLookup(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }
  if (!guardSubmit(request, response, lookupLimiter, "lookup")) return;

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || "Please submit a valid request." });
    return;
  }

  const registrationNumber = typeof payload.registrationNumber === "string" ? payload.registrationNumber.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!registrationNumber) {
    sendJson(response, 400, { error: "Enter your registration number to continue." });
    return;
  }
  if (registrationNumber.length > 24) {
    sendJson(response, 400, { error: "That registration number is too long. Check the number and try again." });
    return;
  }
  if (name.length < 2) {
    sendJson(response, 400, { error: "Enter your full name exactly as the university has it." });
    return;
  }
  if (name.length > 120) {
    sendJson(response, 400, { error: "That name is too long. Check the spelling and try again." });
    return;
  }

  const result = findStudent(registrationNumber, name);

  if (result.status === "not-found") {
    sendJson(response, 404, {
      code: "NOT_FOUND",
      error:
        "We couldn’t find a student with that registration number. Check the number, then try again — or visit the ICT Center with your ID card."
    });
    return;
  }

  if (result.status === "mismatch") {
    // Deliberately does not reveal the name on record.
    sendJson(response, 409, {
      code: "NAME_MISMATCH",
      error:
        "That name does not correspond with the name attached to this registration number. Check the spelling of your full name, or visit the ICT Center with your ID card."
    });
    return;
  }

  const student = result.student;
  sendJson(response, 200, {
    student: publicStudent(student),
    recordSource: studentDirectory.source,
    issues: PORTAL_ISSUES.map(publicIssue),
    paymentsEnabled: paymentConfigured(),
    paymentMode: config.paymentMode
  });
}

/* --- Portal: issues ------------------------------------------------------- */

function handlePortalIssues(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" });
    return;
  }
  sendJson(response, 200, {
    issues: PORTAL_ISSUES.map(publicIssue),
    paymentsEnabled: paymentConfigured(),
    paymentMode: config.paymentMode
  });
}

/* --- Portal: payments ----------------------------------------------------- */

async function handlePortalPaymentCreate(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }
  if (!guardSubmit(request, response, lookupLimiter, "payment")) return;

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || "Please submit a valid request." });
    return;
  }

  const method = payload.method === "transfer" ? "transfer" : payload.method === "card" ? "card" : "";
  if (!method) {
    sendJson(response, 400, { error: "Choose how you would like to pay." });
    return;
  }

  const lookup = findStudent(payload.registrationNumber, payload.name);
  if (lookup.status !== "ok") {
    sendJson(response, lookup.status === "mismatch" ? 409 : 404, {
      error:
        lookup.status === "mismatch"
          ? "Those details no longer match the student record. Start again from your registration number."
          : "We couldn’t find that student record. Start again from your registration number."
    });
    return;
  }

  const issue = issuesById.get(String(payload.issueId || ""));
  if (!issue) {
    sendJson(response, 400, { error: "Choose a valid portal issue." });
    return;
  }
  if (issue.fee <= 0) {
    sendJson(response, 400, { error: "This issue does not require payment." });
    return;
  }

  try {
    const { payment, account } = await createPayment({
      student: lookup.student,
      issue,
      method,
      origin: siteOrigin(request)
    });

    sendJson(response, 200, {
      payment: {
        reference: payment.reference,
        amount: payment.amount,
        amountLabel: formatNaira(payment.amount),
        method: payment.method,
        status: payment.status,
        rrr: payment.rrr || null,
        checkoutUrl: payment.checkoutUrl || null,
        provider: payment.provider
      },
      account: account || null,
      transferNote:
        method === "transfer"
          ? "Transfer the exact amount, then upload your receipt below. The desk verifies every transfer before work starts."
          : null
    });
  } catch (error) {
    console.error("[portal] Could not start payment:", error.message);
    sendJson(response, 502, {
      error: "The payment service could not be reached. Please try the transfer option, or try again shortly."
    });
  }
}

function handlePortalPaymentStatus(request, response, reference) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
    return;
  }
  const payment = payments.get(reference);
  if (!payment) {
    sendJson(response, 404, { error: "That payment reference was not found." });
    return;
  }

  refreshPaymentStatus(payment)
    .catch(() => payment)
    .then((current) => {
      sendJson(response, 200, {
        payment: {
          reference: current.reference,
          amount: current.amount,
          amountLabel: formatNaira(current.amount),
          method: current.method,
          status: current.status,
          rrr: current.rrr || null,
          paidAt: current.paidAt || null,
          provider: current.provider,
          issueId: current.issueId,
          issueLabel: current.issueLabel,
          registrationNumber: current.registrationNumber,
          student: current.student
        }
      });
    });
}

async function handlePortalPaymentConfirm(request, response, reference) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }
  const payment = payments.get(reference);
  if (!payment) {
    sendJson(response, 404, { error: "That payment reference was not found." });
    return;
  }
  if (payment.provider !== "simulated") {
    sendJson(response, 400, { error: "This payment is confirmed by the payment provider, not by the site." });
    return;
  }
  if (payment.status === "paid") {
    sendJson(response, 200, { payment: { reference, status: "paid" } });
    return;
  }

  await confirmPayment(payment, { verifiedBy: "simulated-checkout" });
  console.log(`[portal] Simulated card payment ${reference} marked paid (${formatNaira(payment.amount)})`);

  // A browser posting the checkout form goes straight back to the portal;
  // an API client receives JSON.
  if (String(request.headers.accept || "").includes("text/html")) {
    response.writeHead(303, {
      Location: `/?page=portal&payment=${encodeURIComponent(reference)}`,
      ...SECURITY_HEADERS
    });
    response.end();
    return;
  }

  sendJson(response, 200, { payment: { reference, status: "paid" } });
}

/* --- Portal: tickets ------------------------------------------------------ */

/**
 * A ticket may only be filed once the fee is settled: a card payment must be
 * confirmed, and a transfer must be claimed together with its receipt, which
 * the desk then verifies.
 */
function paymentSatisfied(ticketPayment, issue) {
  if (issue.fee <= 0) return { ok: true, status: "not-required" };
  if (!ticketPayment) return { ok: false, error: "This issue requires payment before it can be submitted." };
  if (ticketPayment.issueId !== issue.id) {
    return { ok: false, error: "That payment was made for a different issue. Start the payment again." };
  }
  if (ticketPayment.status === "paid") return { ok: true, status: "paid" };
  if (
    ticketPayment.method === "transfer" &&
    (ticketPayment.status === "awaiting-transfer" || ticketPayment.status === "receipt-submitted")
  ) {
    return { ok: true, status: "receipt-submitted" };
  }
  return { ok: false, error: "That payment has not been completed yet." };
}

async function handlePortalTicketCreate(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }
  if (!guardSubmit(request, response, lookupLimiter, "ticket")) return;

  let payload;
  try {
    payload = await readPortalBody(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || "Please submit a valid request." });
    return;
  }

  const lookup = findStudent(payload.registrationNumber, payload.name);
  if (lookup.status !== "ok") {
    sendJson(response, 404, { error: "We couldn’t match those details to a student record. Start again from step one." });
    return;
  }

  const issue = issuesById.get(String(payload.issueId || ""));
  if (!issue) {
    sendJson(response, 400, { error: "Choose a valid portal issue." });
    return;
  }

  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  if (description.length < 15) {
    sendJson(response, 400, {
      error: "Please describe the problem in a little more detail (at least 15 characters)."
    });
    return;
  }
  if (description.length > 3000) {
    sendJson(response, 400, { error: "That description is too long. Please keep it under 3000 characters." });
    return;
  }

  const payment = payload.paymentReference ? payments.get(String(payload.paymentReference)) : null;
  if (payment && payment.registrationNumber !== lookup.student.registrationNumber) {
    sendJson(response, 403, { error: "That payment belongs to a different student." });
    return;
  }

  const settlement = paymentSatisfied(payment, issue);
  if (!settlement.ok) {
    sendJson(response, 402, { error: settlement.error });
    return;
  }

  let receiptFile = null;
  if (issue.fee > 0 && payment && payment.method === "transfer") {
    if (!payload.receiptDataUrl) {
      sendJson(response, 400, { error: "Upload your transfer receipt so the desk can verify the payment." });
      return;
    }
  }

  const ticket = {
    id: nextTicketId(),
    status: "open",
    createdAt: new Date().toISOString(),
    student: {
      fullName: lookup.student.fullName,
      registrationNumber: lookup.student.registrationNumber,
      department: lookup.student.department,
      faculty: lookup.student.faculty,
      programme: lookup.student.programme,
      level: lookup.student.level,
      gender: lookup.student.gender,
      phone: lookup.student.phone,
      email: lookup.student.email
    },
    issue: {
      id: issue.id,
      label: issue.label,
      fee: issue.fee
    },
    payment: payment
      ? {
          reference: payment.reference,
          amount: payment.amount,
          method: payment.method,
          rrr: payment.rrr || null
        }
      : null,
    paymentStatus: settlement.status,
    description,
    receiptFile: null,
    // Filled in by staff when they respond (see /api/staff/tickets/:id/respond).
    status: "open",
    outcome: null,
    resolvedAt: null,
    summonedAt: null,
    note: "",
    messages: []
  };

  if (payload.receiptDataUrl) {
    receiptFile = saveReceipt(ticket.id, payload.receiptDataUrl);
    if (!receiptFile) {
      sendJson(response, 400, { error: "That receipt could not be read. Upload a JPG, PNG, WebP or PDF under 4 MB." });
      return;
    }
    ticket.receiptFile = path.relative(ROOT, receiptFile.filePath);
    ticket.receiptMime = receiptFile.mime;
  }

  if (payment && payment.method === "transfer" && payment.status !== "paid") {
    payment.status = "receipt-submitted";
    payment.ticketId = ticket.id;
    appendJsonLine(paymentsFile, payment);
  } else if (payment) {
    payment.ticketId = ticket.id;
    appendJsonLine(paymentsFile, payment);
  }

  persistTicket(ticket);
  console.log(`[portal] Ticket ${ticket.id} created for ${ticket.student.registrationNumber} (${issue.label})`);

  // Email the desk, then notify any staff dashboard that is open.
  const message = portalTicketMessage(ticket);
  deliver(message, { ticketId: ticket.id }).catch((error) =>
    console.error("[portal] Could not email the desk:", error.message)
  );

  broadcastToStaff("ticket", { type: "created", ticket: ticketSummary(ticket) });

  sendJson(response, 201, {
    ticket: {
      id: ticket.id,
      status: ticket.status,
      createdAt: ticket.createdAt,
      issueLabel: ticket.issue.label,
      feeLabel: formatNaira(ticket.issue.fee),
      paymentStatus: ticket.paymentStatus,
      payment: ticket.payment,
      studentEmail: ticket.student.email
    }
  });
}

/* --- Meetings: booking and availability ----------------------------------- */

function handleMeetingAvailability(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
    return;
  }

  const query = new URL(request.url, siteOrigin(request)).searchParams;
  const meetingType = query.get("type") === "outside" ? "outside" : "facility";
  const days = Math.min(Math.max(Number(query.get("days")) || 42, 1), 120);
  const from = isValidDateString(query.get("from")) && query.get("from") >= centerToday()
    ? query.get("from")
    : centerToday();

  sendJson(response, 200, meetingAvailability(meetingType, from, days));
}

async function handleMeetingCreate(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
    return;
  }
  if (!guardSubmit(request, response)) return;

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || "Please submit a valid request." });
    return;
  }

  const error = validateMeetingBooking(payload);
  if (error) {
    sendJson(response, 400, { error });
    return;
  }

  const value = normalizePayload(payload);
  if (slotTaken(value.meetingType, value.date, value.time)) {
    sendJson(response, 409, {
      code: "SLOT_TAKEN",
      error: `That ${value.time} slot on ${longDate(value.date)} was just taken. Please choose another time.`
    });
    return;
  }

  const meeting = {
    id: nextMeetingId(),
    status: "pending",
    createdAt: new Date().toISOString(),
    meetingType: value.meetingType,
    date: value.date,
    time: value.time,
    name: value.name.trim(),
    gender: value.gender,
    phone: value.phone.trim(),
    email: value.email.trim(),
    department: value.department.trim(),
    location: value.meetingType === "outside" ? value.location.trim() : "",
    description: value.description.trim(),
    note: "",
    decidedAt: null,
    emailedAt: null
  };

  persistMeeting(meeting);
  console.log(
    `[meetings] ${meeting.id} booked: ${meeting.meetingType} ${meeting.date} ${meeting.time} (${meeting.name})`
  );

  deliver(meetingDeskMessage(meeting), { meetingId: meeting.id }).catch((deliveryError) =>
    console.error("[meetings] Could not email the Innovation desk:", deliveryError.message)
  );

  // The stream itself is not desk-authenticated, so it only carries a nudge.
  // Officers refetch through the cookie-protected endpoint to see the booking.
  broadcastToStaff("meeting", { type: "changed" });

  sendJson(response, 201, { meeting: meetingSummary(meeting) });
}

/* --- Staff ---------------------------------------------------------------- */

async function handleStaffRoutes(request, response, pathname) {
  if (pathname === "/api/staff/session" && request.method === "GET") {
    const desk = staffDeskOf(request);
    sendJson(response, 200, {
      signedIn: Boolean(desk),
      desk: desk || null,
      desks: ["portal", "innovation"]
    });
    return;
  }

  if (pathname === "/api/staff/session") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET, POST" });
      return;
    }
    if (!isAllowedOrigin(request)) {
      sendJson(response, 403, { error: "This request was blocked for security reasons." });
      return;
    }
    const limit = lookupLimiter.check(`staff-login:${clientIp(request)}`);
    if (!limit.allowed) {
      sendJson(response, 429, { error: "Too many attempts. Please wait a few minutes." });
      return;
    }

    let payload;
    try {
      payload = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: "Please submit a valid request." });
      return;
    }

    const session = createStaffSession(String(payload.code || ""));
    if (!session) {
      console.warn(`[staff] Failed sign-in from ${clientIp(request)}`);
      sendJson(response, 401, { error: "That access code is not correct." });
      return;
    }

    console.log(`[staff] ${STAFF_DESKS[session.desk].label} officer signed in`);

    // One desk per browser: signing in here closes the other desk's session,
    // so the tab can never bounce back to the section that was open before.
    const cookies = [staffCookie(session.desk, session.id, Math.floor(STAFF_SESSION_MS / 1000))];
    for (const other of Object.values(STAFF_DESKS)) {
      if (other.id === session.desk) continue;
      const otherId = getCookie(request, other.cookie);
      if (otherId) staffSessions.delete(otherId);
      cookies.push(staffCookie(other.id, "", 0));
    }

    sendJson(response, 200, { ok: true, desk: session.desk }, { "Set-Cookie": cookies });
    return;
  }

  if (pathname === "/api/staff/logout") {
    const cookies = [];
    for (const desk of Object.values(STAFF_DESKS)) {
      const id = getCookie(request, desk.cookie);
      if (id) staffSessions.delete(id);
      cookies.push(staffCookie(desk.id, "", 0));
    }
    sendJson(response, 200, { ok: true }, { "Set-Cookie": cookies });
    return;
  }

  const signedInDesk = staffDeskOf(request);
  if (!signedInDesk) {
    sendJson(response, 401, { error: "Sign in to the service desk to continue." });
    return;
  }

  // Portal endpoints belong to the Portal desk only.
  if (
    (pathname === "/api/staff/tickets" || pathname.startsWith("/api/staff/tickets/") || pathname.startsWith("/api/staff/receipts/")) &&
    signedInDesk !== "portal"
  ) {
    sendJson(response, 403, { error: "This is the Innovation desk. Sign in with the Portal Unit code." });
    return;
  }

  // --- Innovation desk -----------------------------------------------------
  if (pathname.startsWith("/api/staff/meetings")) {
    if (signedInDesk !== "innovation") {
      sendJson(response, 403, { error: "This is the Portal desk. Sign in with the Innovation Unit code." });
      return;
    }

    if (pathname === "/api/staff/meetings") {
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
        return;
      }
      const ordered = [...meetings].reverse().map(meetingSummary);
      sendJson(response, 200, {
        meetings: ordered,
        counts: {
          pending: meetings.filter((meeting) => meeting.status === "pending").length,
          accepted: meetings.filter((meeting) => meeting.status === "accepted").length,
          declined: meetings.filter((meeting) => meeting.status === "declined").length
        }
      });
      return;
    }

    const respond = pathname.match(/^\/api\/staff\/meetings\/([A-Za-z0-9-]+)\/respond$/);
    if (respond) {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
        return;
      }

      const meeting = meetings.find((entry) => entry.id === respond[1]);
      if (!meeting) {
        sendJson(response, 404, { error: "That meeting request was not found." });
        return;
      }
      if (meeting.status !== "pending") {
        sendJson(response, 409, { error: `That request is already ${meeting.status}.`, meeting: meetingSummary(meeting) });
        return;
      }

      let payload = {};
      try {
        payload = await readJsonBody(request, 16 * 1024);
      } catch {
        payload = {};
      }

      const action = String(payload.outcome || "").trim();
      if (action !== "accepted" && action !== "declined") {
        sendJson(response, 400, { error: "Choose whether to accept or decline this request." });
        return;
      }

      const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 1500) : "";
      const now = new Date().toISOString();

      meeting.status = action;
      meeting.note = note;
      meeting.decidedAt = now;
      meeting.emailedAt = now;
      persistMeeting(meeting);

      deliver(meetingDecisionMessage(meeting, action, note), { meetingId: meeting.id }, meeting.email).catch(
        (deliveryError) => console.error("[meetings] Could not email the client:", deliveryError.message)
      );

      broadcastToStaff("meeting", { type: "changed" });
      console.log(`[meetings] ${meeting.id} ${action}; email queued for ${meeting.email}`);

      // Return the whole desk so the officer's screen stays in sync after a decision.
      const ordered = [...meetings]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
        .map(meetingSummary);

      sendJson(response, 200, {
        meeting: meetingSummary(meeting),
        emailed: meeting.email,
        meetings: ordered,
        counts: {
          pending: meetings.filter((entry) => entry.status === "pending").length,
          accepted: meetings.filter((entry) => entry.status === "accepted").length,
          declined: meetings.filter((entry) => entry.status === "declined").length
        }
      });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
    return;
  }

  if (pathname === "/api/staff/tickets") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
      return;
    }
    const ordered = [...tickets].reverse().map(ticketSummary);
    sendJson(response, 200, {
      tickets: ordered,
      counts: {
        open: tickets.filter((ticket) => ticket.status === "open").length,
        awaiting: tickets.filter((ticket) => ticket.status === "awaiting-visit").length,
        resolved: tickets.filter((ticket) => ticket.status === "resolved").length
      }
    });
    return;
  }

  // Staff respond to a ticket. Two outcomes, both of which email the student:
  //   "resolved" — done remotely, tell them it is fixed.
  //   "visit"    — cannot be finished remotely; ask them to come to the Center.
  // /resolve is kept as a shorthand for { outcome: "resolved" }.
  const respondMatch = pathname.match(/^\/api\/staff\/tickets\/([A-Za-z0-9-]+)\/(respond|resolve)$/);
  if (respondMatch) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." }, { Allow: "POST" });
      return;
    }

    const ticket = tickets.find((entry) => entry.id === respondMatch[1]);
    if (!ticket) {
      sendJson(response, 404, { error: "That ticket was not found." });
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(request, 16 * 1024);
    } catch {
      payload = {};
    }

    const outcome = respondMatch[2] === "resolve" ? "resolved" : String(payload.outcome || "").trim();
    if (outcome !== "resolved" && outcome !== "visit") {
      sendJson(response, 400, {
        error: "Choose what happens next: the issue is resolved, or the student should come to the Center."
      });
      return;
    }

    if (outcome === "resolved" && ticket.status === "resolved") {
      sendJson(response, 409, { error: "That ticket is already resolved.", ticket: ticketSummary(ticket) });
      return;
    }
    if (outcome === "visit" && ticket.status === "awaiting-visit") {
      sendJson(response, 409, {
        error: "The student has already been asked to come in.",
        ticket: ticketSummary(ticket)
      });
      return;
    }

    const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 800) : "";
    const visitWhen = typeof payload.visitWhen === "string" ? payload.visitWhen.trim().slice(0, 120) : "";
    const now = new Date().toISOString();

    ticket.status = outcome === "resolved" ? "resolved" : "awaiting-visit";
    ticket.outcome = outcome;
    ticket.note = note;
    if (outcome === "resolved") ticket.resolvedAt = now;
    else ticket.summonedAt = now;

    ticket.messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    ticket.messages.push({ outcome, note, visitWhen, at: now, to: ticket.student.email });

    appendJsonLine(ticketsFile, ticket);

    const message =
      outcome === "resolved"
        ? studentResolvedMessage(ticket, note)
        : studentVisitMessage(ticket, note, visitWhen);

    deliver(message, { ticketId: ticket.id }, ticket.student.email).catch((error) =>
      console.error("[portal] Could not email the student:", error.message)
    );

    broadcastToStaff("ticket", {
      type: outcome === "resolved" ? "resolved" : "summoned",
      ticket: ticketSummary(ticket)
    });
    console.log(
      `[portal] Ticket ${ticket.id} marked ${outcome === "resolved" ? "resolved" : "visit required"}; ` +
        `email queued for ${ticket.student.email}`
    );

    sendJson(response, 200, { ticket: ticketSummary(ticket), emailed: ticket.student.email });
    return;
  }

  const receiptMatch = pathname.match(/^\/api\/staff\/receipts\/([A-Za-z0-9-]+)$/);
  if (receiptMatch) {
    const receipt = findReceipt(receiptMatch[1]);
    if (!receipt) {
      sendJson(response, 404, { error: "No receipt was uploaded for that ticket." });
      return;
    }
    fs.readFile(receipt.filePath, (error, content) => {
      if (error) {
        sendJson(response, 404, { error: "That receipt could not be read." });
        return;
      }
      response.writeHead(200, {
        "Content-Type": receipt.mime,
        "Content-Length": content.length,
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${path.basename(receipt.filePath)}"`,
        ...SECURITY_HEADERS
      });
      response.end(content);
    });
    return;
  }

  if (pathname === "/api/staff/stream") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...SECURITY_HEADERS
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ open: tickets.filter((t) => t.status === "open").length })}\n\n`);

    staffListeners.add(response);
    const heartbeat = setInterval(() => {
      try {
        response.write(": ping\n\n");
      } catch {
        /* cleaned up on close */
      }
    }, 25_000);
    heartbeat.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      staffListeners.delete(response);
    };
    request.on("close", cleanup);
    response.on("close", cleanup);
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

/* --- Simulated checkout page ---------------------------------------------- */

function checkoutPage(payment) {
  const simulated = payment.provider === "simulated";
  const issue = issuesById.get(payment.issueId);
  const amount = formatNaira(payment.amount);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pay ${escapeHtml(amount)} | ICT Innovation Center</title>
    <meta name="robots" content="noindex">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
             background: #f6f6f6; color: #111; font: 400 15px/1.6 Arial, Helvetica, sans-serif; }
      .shell { width: min(560px, 100%); }
      .top { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
      .mark { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 4px;
              background: #111; color: #fff; font: 700 12px Arial, sans-serif; letter-spacing: -.5px; }
      .top strong { display: block; font-size: 10px; letter-spacing: 1.2px; }
      .top small { display: block; color: #555; font-size: 10px; }
      .card { background: #fff; border: 1px solid #dedede; border-radius: 6px; padding: 24px; }
      .sim { display: flex; gap: 9px; padding: 11px 12px; margin-bottom: 18px; border: 1px solid #e6c98a;
             border-radius: 4px; background: #fdf7ea; color: #6b4c11; font-size: 12px; line-height: 1.6; }
      h1 { margin: 0 0 4px; font: 700 22px Arial, sans-serif; letter-spacing: -.6px; }
      .sub { margin: 0 0 20px; color: #555; font-size: 12px; }
      .summary { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; padding: 14px;
                 border: 1px solid #dedede; border-radius: 4px; background: #f6f6f6; margin-bottom: 18px; font-size: 12px; }
      .summary span:nth-child(odd) { color: #555; }
      .summary strong { text-align: right; }
      .total { font: 700 18px Arial, sans-serif; }
      label { display: block; margin-bottom: 12px; color: #111; font-size: 11px; font-weight: 700; }
      input { width: 100%; margin-top: 5px; min-height: 42px; padding: 9px 11px; border: 1px solid #bbb;
              border-radius: 4px; font: 400 13px Arial, sans-serif; }
      input:focus { outline: 0; border-color: #111; box-shadow: 0 0 0 3px rgba(17,17,17,.08); }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      button { width: 100%; min-height: 46px; margin-top: 6px; border: 0; border-radius: 4px;
               background: #111; color: #fff; font: 700 12px Arial, sans-serif; cursor: pointer; }
      button:disabled { opacity: .55; cursor: progress; }
      .foot { margin: 14px 0 0; color: #555; font-size: 11px; text-align: center; }
      a.back { color: #111; font-weight: 700; }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="top">
        <span class="mark" aria-hidden="true">ICT</span>
        <span><strong>ICT INNOVATION CENTER</strong><small>University of Nigeria, Nsukka</small></span>
      </div>
      <div class="card">
        ${
          simulated
            ? `<div class="sim"><span aria-hidden="true">ⓘ</span><span><strong>Simulated payment — no money moves.</strong> This page exists so the flow can be demonstrated. Card details are never submitted to the ICT server; use the test number shown below.</span></div>`
            : ""
        }
        <h1>Complete your payment</h1>
        <p class="sub">${escapeHtml(payment.student.fullName)} · ${escapeHtml(payment.registrationNumber)}</p>

        <div class="summary">
          <span>Service</span><strong>${escapeHtml(issue ? issue.label : payment.issueLabel)}</strong>
          <span>Amount</span><strong>${escapeHtml(amount)}</strong>
          <span>Remita RRR</span><strong>${escapeHtml(payment.rrr || "—")}</strong>
          <span>Reference</span><strong>${escapeHtml(payment.reference)}</strong>
        </div>

        <form id="pay-form" method="post" action="/api/portal/payments/${encodeURIComponent(payment.reference)}/confirm">
          <label>Card number
            <input inputmode="numeric" autocomplete="off" value="${simulated ? "4084 0840 8408 4081" : ""}" placeholder="0000 0000 0000 0000">
          </label>
          <div class="row">
            <label>Expiry
              <input autocomplete="off" value="${simulated ? "12/30" : ""}" placeholder="MM/YY">
            </label>
            <label>CVV
              <input autocomplete="off" value="${simulated ? "408" : ""}" placeholder="123">
            </label>
          </div>
          <button type="submit">Pay ${escapeHtml(amount)}</button>
        </form>

        <p class="foot">No card details are sent to this server — the fields above carry no
        <code>name</code> attribute, so the browser never submits them.${
          simulated ? " Simulated checkout — nothing is charged." : " Secure payment handled by the provider."
        }<br><a class="back" href="/?page=portal">Cancel and go back</a></p>
      </div>
    </main>
  </body>
</html>`;
}

function serveCheckout(request, response, reference) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" });
    return;
  }
  const payment = payments.get(reference);
  if (!payment || payment.provider !== "simulated") {
    sendNotFound(request, response);
    return;
  }
  if (payment.status === "paid") {
    response.writeHead(302, { Location: `/?page=portal&payment=${encodeURIComponent(reference)}` });
    response.end();
    return;
  }
  sendHtml(response, 200, checkoutPage(payment));
}

/* --- Top-level router ----------------------------------------------------- */

/**
 * When the page is served from a different local port than the API (Live
 * Server, a `file://` page), the browser treats the call as cross-origin and
 * needs explicit permission. Echo the caller's origin back only when it has
 * already passed the origin check above. Nothing is relaxed in production.
 */
function applyCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (!origin) return;

  // A page opened from disk (file://) is an opaque origin and cannot be named
  // in Access-Control-Allow-Origin. It carries no cookie, so a wildcard is safe
  // here and still limited to development by isAllowedOrigin().
  if (origin === "null") {
    if (!isAllowedOrigin(request)) return;
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Vary", "Origin");
    return;
  }
  if (!isAllowedOrigin(request)) return;
  if (parseOrigin(origin)?.host === requestHostname(request)) return; // same origin

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");
}

const server = http.createServer(async (request, response) => {
  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`${request.method} ${request.url} ${response.statusCode} ${ms.toFixed(1)}ms`);
  });

  try {
    const pathname = safeDecodePathname(request.url || "/");
    if (pathname === null) {
      sendJson(response, 400, { error: "Invalid request path." });
      return;
    }

    if (pathname.startsWith("/api/")) {
      applyCorsHeaders(request, response);

      // Preflight for the cross-origin JSON POSTs described above.
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
          ...SECURITY_HEADERS
        });
        response.end();
        return;
      }
    }

    if (pathname === "/api/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "ict-innovation-center",
        emailDelivery: deliveryLabel(),
        payments: config.paymentMode,
        moneyMoving: config.paymentMode !== "simulated",
        tickets: tickets.length,
        uptimeSeconds: Math.round(process.uptime())
      });
      return;
    }

    if (pathname === "/api/staff" || pathname.startsWith("/api/staff/")) {
      await handleStaffRoutes(request, response, pathname);
      return;
    }

    if (pathname === "/api/portal/issues") {
      handlePortalIssues(request, response);
      return;
    }

    if (pathname === "/api/meetings/availability") {
      handleMeetingAvailability(request, response);
      return;
    }

    if (pathname === "/api/meetings") {
      await handleMeetingCreate(request, response);
      return;
    }

    if (pathname === "/api/portal/students") {
      handleDemoRoster(request, response);
      return;
    }

    if (pathname === "/api/portal/lookup") {
      await handlePortalLookup(request, response);
      return;
    }

    if (pathname === "/api/portal/payments") {
      await handlePortalPaymentCreate(request, response);
      return;
    }

    const paymentConfirmMatch = pathname.match(/^\/api\/portal\/payments\/([A-Za-z0-9-]+)\/confirm$/);
    if (paymentConfirmMatch) {
      await handlePortalPaymentConfirm(request, response, paymentConfirmMatch[1]);
      return;
    }

    const paymentStatusMatch = pathname.match(/^\/api\/portal\/payments\/([A-Za-z0-9-]+)$/);
    if (paymentStatusMatch) {
      handlePortalPaymentStatus(request, response, paymentStatusMatch[1]);
      return;
    }

    if (pathname === "/api/portal/tickets") {
      await handlePortalTicketCreate(request, response);
      return;
    }

    if (pathname === "/api/service-requests" || pathname === "/api/meeting-requests") {
      await handleRequestEndpoint(request, response, pathname === "/api/meeting-requests" ? "meeting" : "service");
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Not found." });
      return;
    }

    const checkoutMatch = pathname.match(/^\/pay\/([A-Za-z0-9-]+)$/);
    if (checkoutMatch) {
      serveCheckout(request, response, checkoutMatch[1]);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" });
      return;
    }

    serveStatic(request, response, pathname);
  } catch (error) {
    console.error("[app] unhandled error:", (error && error.stack) || error);
    if (!response.writableEnded) {
      sendJson(response, 500, { error: "Something went wrong. Please try again." });
    }
  }
});

// Keep-alive and header timeouts: cheap protection against slow clients.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 30_000;

server.listen(config.port, config.host, () => {
  const shownHost = config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;
  console.log("");
  console.log("  ICT Innovation Center");
  console.log(`  → http://${shownHost}:${config.port}`);
  console.log(`  → environment: ${config.nodeEnv}`);
  console.log(`  → request delivery: ${describeDelivery()}`);
  console.log(`  → portal payments: ${describePayments()}`);
  console.log(
    `  → student records: ${studentDirectory.source} (${studentRecords.size} students${studentRecordsAreDemo ? ", demo" : ""})`
  );
  console.log(`  → staff desk: http://${shownHost}:${config.port}/?page=staff`);
  console.log(`     Portal Unit code: ${STAFF_DESKS.portal.code}${config.staffAccessCode ? " (from STAFF_ACCESS_CODE)" : " (random this run)"}`);
  console.log(`     Innovation Unit code: ${STAFF_DESKS.innovation.code}${config.innovationAccessCode ? " (from INNOVATION_ACCESS_CODE)" : " (random this run)"}`);
  if (!config.staffAccessCode || !config.innovationAccessCode) {
    console.log("     Set STAFF_ACCESS_CODE and INNOVATION_ACCESS_CODE in .env to fix these.");
  }
  console.log("");
  if (!resendConfigured() && config.emailMode !== "file") {
    console.log("  Resend is not configured, so requests are saved to data/submissions/.");
    console.log("  Add RESEND_API_KEY and RESEND_FROM_EMAIL to .env to send them by email instead.");
    console.log("");
  }
});

function describePayments() {
  if (config.paymentMode === "paystack") {
    return config.paystackSecretKey ? "Paystack (live card checkout)" : "Paystack selected but PAYSTACK_SECRET_KEY is missing";
  }
  if (config.paymentMode === "remita") {
    return paymentConfigured() ? "Remita (live RRR)" : "Remita selected but merchant settings are missing";
  }
  return "simulated — no money moves (demo)";
}

function describeDelivery() {
  if (config.emailMode === "file") return "local store (EMAIL_MODE=file)";
  if (config.emailMode === "resend") return "Resend email (required)";
  return resendConfigured() ? "Resend email" : "local store (Resend not configured)";
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Set PORT in .env or stop the other process.`);
    process.exit(1);
  }
  console.error("Server error:", error);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

/*
 * A stray error in one request must never take the whole site down — during a
 * demonstration that would look like the server "disappearing". Log it loudly
 * and keep serving; every request handler already catches its own failures.
 */
process.on("uncaughtException", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Set PORT in .env or stop the other process.`);
    process.exit(1);
  }
  console.error("[server] Uncaught error (still running):", error);
});
