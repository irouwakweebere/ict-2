"use strict";

/**
 * ICT Innovation Center — client application.
 *
 * Sections:
 *   1. Helpers
 *   2. Page router (single-page views driven by ?page=…)
 *   3. Mobile navigation
 *   4. Unit carousel (hierarchical grid + directional flip)
 *   5. Meeting request flow
 *   6. Training registration
 *   7. Shared service-request forms
 *   8. Contact panel and page utilities
 */

/* -------------------------------------------------------------------------- */
/* 1. Helpers                                                                  */
/* -------------------------------------------------------------------------- */

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const currentYear = document.querySelector("#current-year");
if (currentYear) currentYear.textContent = new Date().getFullYear();

/* -------------------------------------------------------------------------- */
/* Offline demo mode                                                          */
/* -------------------------------------------------------------------------- */
/*
 * For a presentation the site must work by simply opening index.html — no
 * Node, no terminal, no port. When no server answers, the portal and the
 * service desk run entirely in this browser, from the same demo records the
 * server would have used. Everything the visitor sees is identical; the only
 * difference is that tickets live in localStorage instead of data/ and the
 * "student emailed" step is announced rather than sent.
 */

const DEMO_ROSTER_TABLE = [
  ["2021/240001", "Peace Chidinma Okafor", "Computer Science", "Physical Sciences", "B.Sc. Computer Science", "Female", "+234 803 123 4567", "peace.okafor@unn.edu.ng", "400 Level"],
  ["2021/243755", "Daniel Ifeanyi Nwafor", "Computer Science", "Physical Sciences", "B.Sc. Computer Science", "Male", "+234 812 334 9908", "daniel.nwafor@unn.edu.ng", "400 Level"],
  ["2022/246775", "Chukwudi Kingsley Anyanwu", "Software Engineering", "Physical Sciences", "B.Sc. Software Engineering", "Male", "+234 704 887 2213", "chukwudi.anyanwu@unn.edu.ng", "300 Level"],
  ["2020/245019", "Adewale Kunle Ojo", "Architecture", "Environmental Studies", "B.Sc. Architecture", "Male", "+234 805 776 1120", "adewale.ojo@unn.edu.ng", "500 Level"],
  ["2020/241882", "Emeka Daniel Nwosu", "Mechanical Engineering", "Engineering", "B.Eng. Mechanical Engineering", "Male", "+234 806 765 4321", "emeka.nwosu@unn.edu.ng", "500 Level"],
  ["2022/247122", "Musa Danjuma Bala", "Mechanical Engineering", "Engineering", "B.Eng. Mechanical Engineering", "Male", "+234 809 664 8891", "musa.bala@unn.edu.ng", "300 Level"],
  ["2022/241377", "Kelechi Samuel Obi", "Electrical Engineering", "Engineering", "B.Eng. Electrical Engineering", "Male", "+234 809 556 2210", "kelechi.obi@unn.edu.ng", "300 Level"],
  ["2021/241208", "Peter Ifeanyi Alozie", "Electronic Engineering", "Engineering", "B.Eng. Electronic Engineering", "Male", "+234 807 556 4412", "peter.alozie@unn.edu.ng", "400 Level"],
  ["2019/240116", "Obinna Godwin Aneke", "Civil Engineering", "Engineering", "B.Eng. Civil Engineering", "Male", "+234 815 220 7731", "obinna.aneke@unn.edu.ng", "600 Level"],
  ["2019/237210", "Ifeanyi Chukwuemeka Nnamdi", "Metallurgical and Materials Engineering", "Engineering", "B.Eng. Metallurgical Engineering", "Male", "+234 810 334 5521", "ifeanyi.nnamdi@unn.edu.ng", "600 Level"],
  ["2019/245233", "Mustapha Aliyu Bello", "Chemical Engineering", "Engineering", "B.Eng. Chemical Engineering", "Male", "+234 810 887 6654", "mustapha.bello@unn.edu.ng", "600 Level"],
  ["2022/243105", "Aisha Bello", "Mass Communication", "Social Sciences", "B.A. Mass Communication", "Female", "+234 703 998 8776", "aisha.bello@unn.edu.ng", "300 Level"],
  ["2021/239994", "Ezinne Favour Ude", "Mass Communication", "Social Sciences", "B.A. Mass Communication", "Female", "+234 812 445 6678", "ezinne.ude@unn.edu.ng", "400 Level"],
  ["2019/238744", "Chinedu Paul Eze", "Economics", "Social Sciences", "B.Sc. Economics", "Male", "+234 812 345 6789", "chinedu.eze@unn.edu.ng", "600 Level"],
  ["2022/245230", "Ibrahim Musa Sule", "Political Science", "Social Sciences", "B.Sc. Political Science", "Male", "+234 813 667 2288", "ibrahim.sule@unn.edu.ng", "300 Level"],
  ["2021/244487", "Hauwa Adamu Bello", "Sociology and Anthropology", "Social Sciences", "B.Sc. Sociology", "Female", "+234 704 552 7788", "hauwa.bello@unn.edu.ng", "400 Level"],
  ["2020/238213", "Ada Chiamaka Obiora", "Psychology", "Social Sciences", "B.Sc. Psychology", "Female", "+234 703 556 2201", "ada.obiora@unn.edu.ng", "500 Level"],
  ["2021/247994", "Precious Adaeze Nnaji", "Public Administration", "Social Sciences", "B.Sc. Public Administration", "Female", "+234 902 776 1123", "precious.nnaji@unn.edu.ng", "400 Level"],
  ["2022/250388", "Nasiru Umar Faruk", "Geography", "Social Sciences", "B.Sc. Geography", "Male", "+234 809 778 4456", "nasiru.faruk@unn.edu.ng", "300 Level"],
  ["2021/242967", "Tunde Olawale Adebayo", "Accounting", "Business Administration", "B.Sc. Accounting", "Male", "+234 814 455 6677", "tunde.adebayo@unn.edu.ng", "400 Level"],
  ["2019/239677", "Bolanle Folake Ajayi", "Business Administration", "Business Administration", "B.Sc. Business Administration", "Female", "+234 802 887 3310", "bolanle.ajayi@unn.edu.ng", "600 Level"],
  ["2019/241558", "Oluwaseun Tobi Akinyemi", "Banking and Finance", "Business Administration", "B.Sc. Banking and Finance", "Male", "+234 803 112 5544", "oluwaseun.akinyemi@unn.edu.ng", "600 Level"],
  ["2023/247560", "Rukayat Omolara Yusuf", "Marketing", "Business Administration", "B.Sc. Marketing", "Female", "+234 905 112 4478", "rukayat.yusuf@unn.edu.ng", "200 Level"],
  ["2019/246048", "Chioma Faith Ibe", "Insurance", "Business Administration", "B.Sc. Insurance", "Female", "+234 803 556 3321", "chioma.ibe@unn.edu.ng", "600 Level"],
  ["2023/245610", "Fatima Sani Ibrahim", "Medicine and Surgery", "Health Sciences", "MBBS", "Female", "+234 905 123 4567", "fatima.ibrahim@unn.edu.ng", "200 Level"],
  ["2023/251142", "Amina Binta Suleiman", "Medicine and Surgery", "Health Sciences", "MBBS", "Female", "+234 903 667 2214", "amina.suleiman@unn.edu.ng", "200 Level"],
  ["2023/243888", "Halima Abubakar Isa", "Nursing", "Health Sciences", "B.NSc. Nursing", "Female", "+234 903 445 6677", "halima.isa@unn.edu.ng", "200 Level"],
  ["2023/248407", "Yusuf Kabir Sadiq", "Medical Laboratory Science", "Health Sciences", "B.MLS", "Male", "+234 905 778 9902", "yusuf.sadiq@unn.edu.ng", "200 Level"],
  ["2021/238855", "Blessing Ifeoma Okonkwo", "Microbiology", "Biological Sciences", "B.Sc. Microbiology", "Female", "+234 803 991 4477", "blessing.okonkwo@unn.edu.ng", "400 Level"],
  ["2020/243761", "Amaka Grace Nwankwo", "Biochemistry", "Biological Sciences", "B.Sc. Biochemistry", "Female", "+234 807 445 9912", "amaka.nwankwo@unn.edu.ng", "500 Level"],
  ["2022/240789", "Nneka Joy Ezeani", "Zoology and Environmental Biology", "Biological Sciences", "B.Sc. Zoology", "Female", "+234 806 889 3322", "nneka.ezeani@unn.edu.ng", "300 Level"],
  ["2023/246058", "Segun Ayodele Ogunleye", "Statistics", "Physical Sciences", "B.Sc. Statistics", "Male", "+234 902 118 3366", "segun.ogunleye@unn.edu.ng", "200 Level"],
  ["2020/244330", "Ahmed Sani Garba", "Physics and Astronomy", "Physical Sciences", "B.Sc. Physics", "Male", "+234 815 667 1109", "ahmed.garba@unn.edu.ng", "500 Level"],
  ["2019/243447", "Amina Hauwa Lawal", "Chemistry", "Physical Sciences", "B.Sc. Chemistry", "Female", "+234 810 223 9987", "amina.lawal@unn.edu.ng", "600 Level"],
  ["2021/245882", "David Chinedu Ilo", "Geology", "Physical Sciences", "B.Sc. Geology", "Male", "+234 803 778 9934", "david.ilo@unn.edu.ng", "400 Level"],
  ["2023/250301", "Chidera Franklin Eze", "Surveying and Geoinformatics", "Environmental Studies", "B.Sc. Surveying", "Male", "+234 815 334 7790", "chidera.eze@unn.edu.ng", "200 Level"],
  ["2020/241073", "Kayode Emmanuel Ilesanmi", "Estate Management", "Environmental Studies", "B.Sc. Estate Management", "Male", "+234 806 445 7781", "kayode.ilesanmi@unn.edu.ng", "500 Level"],
  ["2020/239508", "Ngozi Adaobi Umeh", "Law", "Law", "LL.B.", "Female", "+234 802 774 1123", "ngozi.umeh@unn.edu.ng", "500 Level"],
  ["2023/249015", "Grace Onyinye Mba", "Law", "Law", "LL.B.", "Female", "+234 902 334 7781", "grace.mba@unn.edu.ng", "200 Level"],
  ["2023/244902", "Zainab Yusuf Mohammed", "Pharmacy", "Pharmaceutical Sciences", "Pharm.D.", "Female", "+234 706 334 8890", "zainab.mohammed@unn.edu.ng", "200 Level"],
  ["2020/240921", "Tobenna Charles Uche", "Veterinary Medicine", "Veterinary Medicine", "D.V.M.", "Male", "+234 812 990 3345", "tobenna.uche@unn.edu.ng", "500 Level"],
  ["2022/242664", "Chinaza Precious Okafor", "English and Literary Studies", "Arts", "B.A. English", "Female", "+234 806 220 3344", "chinaza.okafor@unn.edu.ng", "300 Level"],
  ["2020/246608", "Mariam Yetunde Balogun", "Theatre and Film Studies", "Arts", "B.A. Theatre Arts", "Female", "+234 703 887 4456", "mariam.balogun@unn.edu.ng", "500 Level"],
  ["2022/248617", "Ijeoma Blessing Okoro", "Philosophy", "Arts", "B.A. Philosophy", "Female", "+234 704 112 3399", "ijeoma.okoro@unn.edu.ng", "300 Level"],
  ["2020/247991", "Yetunde Ayo Salami", "Music", "Arts", "B.A. Music", "Female", "+234 815 990 2244", "yetunde.salami@unn.edu.ng", "500 Level"],
  ["2021/246301", "Uchenna Vincent Okeke", "Computer Education", "Education", "B.Sc. Ed. Computer Science", "Male", "+234 811 223 4456", "uchenna.okeke@unn.edu.ng", "400 Level"],
  ["2019/244015", "Esther Ngozi Ali", "Library and Information Science", "Education", "B.LIS", "Female", "+234 806 334 8876", "esther.ali@unn.edu.ng", "600 Level"],
  ["2022/243390", "Samuel Osita Ngwu", "Agricultural Economics", "Agriculture", "B.Sc. Agricultural Economics", "Male", "+234 809 445 1123", "samuel.ngwu@unn.edu.ng", "300 Level"]
];

const DEMO_ROSTER = DEMO_ROSTER_TABLE.map(
  ([registrationNumber, fullName, department, faculty, programme, gender, phone, email, level]) => ({
    registrationNumber, fullName, department, faculty, programme, gender, phone, email, level
  })
);

const DEMO_ISSUES = [
  { id: "access", label: "Cannot log in or access my account", summary: "Password resets and locked accounts.", fee: 0 },
  { id: "profile", label: "Student profile", summary: "Names, date of birth, passport photo and other profile data.", fee: 0 },
  { id: "email", label: "Change of email address", summary: "Move your portal account to a new email address.", fee: 2000 },
  { id: "level", label: "Upgrade of level", summary: "Promote your portal record to the next level of study.", fee: 0 },
  { id: "add-course", label: "Adding of course", summary: "Register an additional course for the semester.", fee: 2000 },
  { id: "drop-course", label: "Dropping of course", summary: "Remove a registered course from the semester.", fee: 2000 },
  { id: "extra-unit", label: "Extra unit (Final Year)", summary: "Extra units carried over from an earlier session.", fee: 5000 },
  { id: "late-registration", label: "Late course registration", summary: "Registration after the portal window has closed.", fee: 10000 }
];

const DEMO_TRANSFER_ACCOUNT = {
  bank: "Zenith Bank",
  accountName: "ICT Innovation Center, UNN",
  accountNumber: "1012345678"
};

const DEMO_STAFF_CODE = "246810";
const DEMO_STORAGE_KEY = "ict-innovation-demo-v1";

function demoPublicIssue(issue) {
  return {
    ...issue,
    feeLabel: issue.fee > 0 ? naira(issue.fee) : "Free",
    requiresPayment: issue.fee > 0
  };
}

function demoLoadState() {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private browsing — fall back to memory */
  }
  return { tickets: [], payments: {}, meetings: [], signedIn: false, sequence: 0, meetingSequence: 0 };
}

let demoState = demoLoadState();

function demoSaveState() {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(demoState));
  } catch {
    /* storage full or blocked — the session still works in memory */
  }
}

const demoNormaliseReg = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/^UNN[/\s-]*/, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "/");

function demoFindStudent(registrationNumber, name) {
  const key = demoNormaliseReg(registrationNumber);
  const student = DEMO_ROSTER.find((entry) => demoNormaliseReg(entry.registrationNumber) === key);
  if (!student) return { status: "not-found" };

  // Same tolerance as the server: order, case, spacing and one typo.
  const tidy = (value) =>
    String(value || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).sort();
  const typed = tidy(name);
  const record = tidy(student.fullName);
  if (!typed.length) return { status: "mismatch", student };

  let matches = typed.length === record.length && typed.every((part, index) => part === record[index]);
  if (!matches) {
    const joinedTyped = typed.join("");
    const joinedRecord = record.join("");
    let differences = Math.abs(joinedTyped.length - joinedRecord.length);
    for (let i = 0; i < Math.min(joinedTyped.length, joinedRecord.length); i += 1) {
      if (joinedTyped[i] !== joinedRecord[i]) differences += 1;
    }
    matches = differences <= 1;
  }
  return matches ? { status: "ok", student } : { status: "mismatch", student };
}

function demoNewReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `ICT-${stamp}-${random}`;
}

function demoTicketSummary(ticket) {
  const issue = DEMO_ISSUES.find((entry) => entry.id === ticket.issueId) || DEMO_ISSUES[0];
  return {
    id: ticket.id,
    status: ticket.status,
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt || null,
    student: ticket.student,
    issue: {
      id: issue.id,
      label: issue.label,
      fee: issue.fee,
      feeLabel: issue.fee > 0 ? naira(issue.fee) : "Free"
    },
    payment: ticket.payment
      ? {
          reference: ticket.payment.reference,
          amount: ticket.payment.amount,
          amountLabel: naira(ticket.payment.amount),
          method: ticket.payment.method,
          rrr: ticket.payment.rrr || null,
          status: ticket.paymentStatus
        }
      : null,
    paymentStatus: ticket.paymentStatus,
    description: ticket.description,
    hasReceipt: Boolean(ticket.receiptDataUrl),
    receiptDataUrl: ticket.receiptDataUrl || null,
    outcome: ticket.outcome || null,
    summonedAt: ticket.summonedAt || null,
    note: ticket.note || "",
    messages: Array.isArray(ticket.messages) ? ticket.messages : []
  };
}

/* --- demo meeting helpers (mirror of the server rules) ------------------- */

const DEMO_MEETING_SECTIONS = {
  facility: { id: "facility", label: "At an ICT Center facility", startHour: 10, endHour: 16 },
  outside: { id: "outside", label: "At my location (outside the Center)", startHour: 10, endHour: 18 }
};

const DEMO_INNOVATION_CODE = "135790";

function demoCenterToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function demoAddDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function demoLongDate(dateString) {
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

function demoSlotLabel(time) {
  const hour = Number(String(time).split(":")[0]);
  const shape = (value) => {
    const suffix = value >= 12 ? "pm" : "am";
    const twelve = value % 12 === 0 ? 12 : value % 12;
    return `${twelve}${suffix}`;
  };
  return `${shape(hour)} – ${shape(hour + 1)}`;
}

function demoSectionSlots(section) {
  const slots = [];
  for (let hour = section.startHour; hour < section.endHour; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return slots;
}

function demoMeetings() {
  return Array.isArray(demoState.meetings) ? demoState.meetings : [];
}

function demoActiveMeetings() {
  return demoMeetings().filter((meeting) => meeting.status === "pending" || meeting.status === "accepted");
}

function demoSlotTaken(type, date, time) {
  return demoActiveMeetings().some(
    (meeting) => meeting.meetingType === type && meeting.date === date && meeting.time === time
  );
}

function demoMeetingAvailability(type) {
  const section = DEMO_MEETING_SECTIONS[type] || DEMO_MEETING_SECTIONS.facility;
  const from = demoCenterToday();
  const days = [];

  for (let offset = 0; offset < 120; offset += 1) {
    const date = demoAddDays(from, offset);
    const slots = demoSectionSlots(section).map((time) => ({
      time,
      label: demoSlotLabel(time),
      taken: demoSlotTaken(section.id, date, time)
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
      summary: "",
      opens: `${String(section.startHour).padStart(2, "0")}:00`,
      closes: `${String(section.endHour).padStart(2, "0")}:00`,
      opensLabel: "10am",
      closesLabel: section.endHour === 16 ? "4pm" : "6pm"
    },
    from,
    today: from,
    days
  };
}

function demoMeetingSummary(meeting) {
  const section = DEMO_MEETING_SECTIONS[meeting.meetingType] || DEMO_MEETING_SECTIONS.facility;
  return {
    ...meeting,
    meetingTypeLabel: section.label,
    sectionLabel: section.label,
    dateLabel: demoLongDate(meeting.date),
    timeLabel: demoSlotLabel(meeting.time)
  };
}

function demoJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Answers the portal and desk endpoints locally, with the same shapes as the server. */
async function demoApi(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const url = new URL(path, "http://demo.local");
  const route = url.pathname;

  await wait(220); // keeps the loading states visible, as with a real request

  if (route === "/api/health") {
    return demoJson({ status: "ok", service: "ict-innovation-center", demo: true });
  }

  if (route === "/api/portal/students") {
    return demoJson({
      demo: true,
      source: "Built-in demo roster (offline)",
      total: DEMO_ROSTER.length,
      returned: DEMO_ROSTER.length,
      students: DEMO_ROSTER
    });
  }

  if (route === "/api/portal/issues") {
    return demoJson({ issues: DEMO_ISSUES.map(demoPublicIssue), paymentsEnabled: true, paymentMode: "simulated" });
  }

  if (route === "/api/portal/lookup") {
    const result = demoFindStudent(body.registrationNumber, body.name);
    if (result.status === "not-found") {
      return demoJson(
        { code: "NOT_FOUND", error: "We couldn’t find a student with that registration number. Check the number, then try again — or visit the ICT Center with your ID card." },
        404
      );
    }
    if (result.status === "mismatch") {
      return demoJson(
        { code: "NAME_MISMATCH", error: "That name does not correspond with the name attached to this registration number. Check the spelling of your full name, or visit the ICT Center with your ID card." },
        409
      );
    }
    return demoJson({
      student: result.student,
      recordSource: "Built-in demo roster (offline)",
      issues: DEMO_ISSUES.map(demoPublicIssue),
      paymentsEnabled: true,
      paymentMode: "simulated"
    });
  }

  if (route === "/api/portal/payments" && method === "POST") {
    const issue = DEMO_ISSUES.find((entry) => entry.id === body.issueId);
    const found = demoFindStudent(body.registrationNumber, body.name);
    if (!issue) return demoJson({ error: "That issue is not offered." }, 400);
    if (found.status !== "ok") return demoJson({ error: "We could not verify that student record." }, 403);
    if (!issue.fee) return demoJson({ error: "This issue does not require payment." }, 400);

    const reference = demoNewReference();
    const payment = {
      reference,
      amount: issue.fee,
      amountLabel: naira(issue.fee),
      method: body.method === "transfer" ? "transfer" : "card",
      status: body.method === "transfer" ? "awaiting-transfer" : "pending",
      rrr: String(Math.floor(100000000000 + Math.random() * 899999999999)),
      issueId: issue.id,
      registrationNumber: found.student.registrationNumber,
      student: found.student,
      createdAt: new Date().toISOString()
    };
    demoState.payments[reference] = payment;
    demoSaveState();

    return demoJson({
      payment: { ...payment, checkoutUrl: null, provider: "Demo (offline)" },
      account: DEMO_TRANSFER_ACCOUNT,
      transferNote: "Demo mode: no money moves. Upload any image as the receipt to continue."
    });
  }

  const payMatch = route.match(/^\/api\/portal\/payments\/([A-Za-z0-9-]+)\/confirm$/);
  if (payMatch && method === "POST") {
    const payment = demoState.payments[payMatch[1]];
    if (!payment) return demoJson({ error: "That payment reference was not found." }, 404);
    payment.status = "paid";
    payment.paidAt = new Date().toISOString();
    demoSaveState();
    return demoJson({ payment: { reference: payment.reference, status: "paid" } });
  }

  const payStatusMatch = route.match(/^\/api\/portal\/payments\/([A-Za-z0-9-]+)$/);
  if (payStatusMatch) {
    const payment = demoState.payments[payStatusMatch[1]];
    if (!payment) return demoJson({ error: "That payment reference was not found." }, 404);
    const issue = DEMO_ISSUES.find((entry) => entry.id === payment.issueId);
    return demoJson({
      payment: {
        ...payment,
        issueLabel: issue ? issue.label : "",
        paidAt: payment.paidAt || null,
        provider: "Demo (offline)"
      }
    });
  }

  if (route === "/api/portal/tickets" && method === "POST") {
    const issue = DEMO_ISSUES.find((entry) => entry.id === body.issueId);
    const found = demoFindStudent(body.registrationNumber, body.name);
    if (!issue || found.status !== "ok") return demoJson({ error: "That ticket could not be verified." }, 400);

    const description = String(body.description || "").trim();
    if (description.length < 15) {
      return demoJson({ error: "Describe the problem in at least 15 characters so the team can help." }, 400);
    }

    let paymentStatus = "not-required";
    let payment = null;
    if (issue.fee > 0) {
      const reference = body.paymentReference;
      const stored = reference ? demoState.payments[reference] : null;
      if (!stored || stored.issueId !== issue.id) {
        return demoJson({ error: "That payment could not be matched to this request." }, 402);
      }
      if (stored.method === "transfer") {
        if (!body.receiptDataUrl) return demoJson({ error: "Upload your transfer receipt to continue." }, 400);
        paymentStatus = "receipt-submitted";
      } else if (stored.status !== "paid") {
        return demoJson({ error: "That payment has not been completed yet." }, 402);
      } else {
        paymentStatus = "paid";
      }
      payment = { reference: stored.reference, amount: stored.amount, method: stored.method, rrr: stored.rrr };
    }

    demoState.sequence += 1;
    const ticket = {
      id: `ICT-P-${new Date().getFullYear()}-${String(demoState.sequence).padStart(4, "0")}`,
      status: "open",
      createdAt: new Date().toISOString(),
      issueId: issue.id,
      description,
      student: found.student,
      payment,
      paymentStatus,
      receiptDataUrl: body.receiptDataUrl || null,
      outcome: null,
      summonedAt: null,
      resolvedAt: null,
      note: "",
      messages: []
    };
    demoState.tickets.unshift(ticket);
    demoSaveState();

    const summary = demoTicketSummary(ticket);
    return demoJson(
      {
        ticket: {
          id: summary.id,
          status: summary.status,
          createdAt: summary.createdAt,
          issueLabel: summary.issue.label,
          feeLabel: summary.issue.feeLabel,
          paymentStatus,
          payment: summary.payment,
          studentEmail: found.student.email
        }
      },
      201
    );
  }

  if (route === "/api/staff/session" && method === "GET") {
    const desk = demoState.desk || null;
    return demoJson({ signedIn: Boolean(demoState.signedIn && desk), desk, desks: ["portal", "innovation"] });
  }

  if (route === "/api/staff/session" && method === "POST") {
    const code = String(body.code || "").trim();
    const desk = code === DEMO_STAFF_CODE ? "portal" : code === DEMO_INNOVATION_CODE ? "innovation" : null;
    if (!desk) return demoJson({ error: "That access code is not correct." }, 401);
    demoState.signedIn = true;
    demoState.desk = desk;
    demoSaveState();
    return demoJson({ ok: true, desk });
  }

  if (route === "/api/staff/logout") {
    demoState.signedIn = false;
    demoState.desk = null;
    demoSaveState();
    return demoJson({ ok: true });
  }

  /* --- public meeting booking ------------------------------------------- */

  if (route === "/api/meetings/availability" && method === "GET") {
    const type = DEMO_MEETING_SECTIONS[url.searchParams.get("type")] ? url.searchParams.get("type") : "facility";
    return demoJson(demoMeetingAvailability(type));
  }

  if (route === "/api/meetings" && method === "POST") {
    const type = DEMO_MEETING_SECTIONS[body.meetingType] ? body.meetingType : null;
    if (!type) return demoJson({ error: "Choose where the meeting should hold." }, 400);

    const date = String(body.date || "");
    const time = String(body.time || "");
    const today = demoCenterToday();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return demoJson({ error: "Choose a date from the calendar." }, 400);
    if (date < today) return demoJson({ error: "That date has already passed. Choose another day." }, 400);
    if (demoSectionSlots(DEMO_MEETING_SECTIONS[type]).indexOf(time) === -1) {
      return demoJson({ error: "That time is outside the hours this meeting can hold." }, 400);
    }
    if (demoSlotTaken(type, date, time)) {
      return demoJson(
        { code: "SLOT_TAKEN", error: "That time was just taken by another booking. Pick another slot." },
        409
      );
    }
    if (type === "outside" && !String(body.location || "").trim()) {
      return demoJson({ error: "Tell us where the meeting should hold." }, 400);
    }

    demoState.meetingSequence = Number(demoState.meetingSequence || 0) + 1;
    const meeting = {
      id: `ICT-M-${new Date().getFullYear()}-${String(demoState.meetingSequence).padStart(4, "0")}`,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
      meetingType: type,
      date,
      time,
      name: String(body.name || "").slice(0, 120),
      gender: String(body.gender || "").slice(0, 40),
      phone: String(body.phone || "").slice(0, 40),
      email: String(body.email || "").slice(0, 160),
      department: String(body.department || "").slice(0, 160),
      location: type === "outside" ? String(body.location || "").slice(0, 200) : "",
      description: String(body.description || "").slice(0, 3000),
      note: "",
      emailedAt: null
    };

    demoState.meetings = [meeting, ...demoMeetings()];
    demoSaveState();
    return demoJson({ meeting: demoMeetingSummary(meeting) }, 201);
  }

  /* --- Innovation desk --------------------------------------------------- */

  if (route === "/api/staff/meetings" && method === "GET") {
    if (!demoState.signedIn) return demoJson({ error: "Sign in to view the desk." }, 401);
    if (demoState.desk !== "innovation") {
      return demoJson({ error: "This section belongs to the Innovation Unit. Sign in with its access code." }, 403);
    }
    const meetings = demoMeetings().map(demoMeetingSummary);
    return demoJson({
      meetings,
      counts: {
        pending: meetings.filter((m) => m.status === "pending").length,
        accepted: meetings.filter((m) => m.status === "accepted").length,
        declined: meetings.filter((m) => m.status === "declined").length
      },
      demo: true
    });
  }

  const meetingRespondMatch = route.match(/^\/api\/staff\/meetings\/([A-Za-z0-9-]+)\/respond$/);
  if (meetingRespondMatch && method === "POST") {
    if (!demoState.signedIn) return demoJson({ error: "Sign in to view the desk." }, 401);
    if (demoState.desk !== "innovation") {
      return demoJson({ error: "This section belongs to the Innovation Unit. Sign in with its access code." }, 403);
    }

    const meeting = demoMeetings().find((entry) => entry.id === meetingRespondMatch[1]);
    if (!meeting) return demoJson({ error: "That booking was not found." }, 404);

    const outcome = String(body.outcome || "");
    if (outcome !== "accepted" && outcome !== "declined") {
      return demoJson({ error: "Choose Accept or Decline." }, 400);
    }
    if (meeting.status !== "pending") {
      return demoJson({ error: "That booking has already been decided." }, 409);
    }

    meeting.status = outcome;
    meeting.note = String(body.note || "").slice(0, 2000);
    meeting.decidedAt = new Date().toISOString();
    meeting.emailedAt = meeting.decidedAt;
    demoSaveState();

    const meetings = demoMeetings().map(demoMeetingSummary);
    return demoJson({
      meeting: demoMeetingSummary(meeting),
      emailed: meeting.email,
      meetings,
      counts: {
        pending: meetings.filter((m) => m.status === "pending").length,
        accepted: meetings.filter((m) => m.status === "accepted").length,
        declined: meetings.filter((m) => m.status === "declined").length
      }
    });
  }

  if (route === "/api/staff/tickets") {
    if (!demoState.signedIn) return demoJson({ error: "Sign in to view the desk." }, 401);
    if (demoState.desk === "innovation") {
      return demoJson({ error: "This section belongs to the Portal Unit. Sign in with its access code." }, 403);
    }
    const tickets = demoState.tickets.map(demoTicketSummary);
    return demoJson({
      tickets,
      counts: {
        open: tickets.filter((ticket) => ticket.status === "open").length,
        awaiting: tickets.filter((ticket) => ticket.status === "awaiting-visit").length,
        resolved: tickets.filter((ticket) => ticket.status === "resolved").length
      },
      demo: true
    });
  }

  const respondMatch = route.match(/^\/api\/staff\/tickets\/([A-Za-z0-9-]+)\/(respond|resolve)$/);
  if (respondMatch && method === "POST") {
    if (!demoState.signedIn) return demoJson({ error: "Sign in to view the desk." }, 401);
    if (demoState.desk === "innovation") {
      return demoJson({ error: "This section belongs to the Portal Unit. Sign in with its access code." }, 403);
    }
    const ticket = demoState.tickets.find((entry) => entry.id === respondMatch[1]);
    if (!ticket) return demoJson({ error: "That ticket was not found." }, 404);

    const outcome = respondMatch[2] === "resolve" ? "resolved" : String(body.outcome || "");
    if (outcome !== "resolved" && outcome !== "visit") {
      return demoJson({ error: "Choose what happens next: resolved, or the student comes in." }, 400);
    }
    if (outcome === "resolved" && ticket.status === "resolved") {
      return demoJson({ error: "That ticket is already resolved." }, 409);
    }
    if (outcome === "visit" && ticket.status === "awaiting-visit") {
      return demoJson({ error: "The student has already been asked to come in." }, 409);
    }

    const note = String(body.note || "").slice(0, 800);
    const visitWhen = String(body.visitWhen || "").slice(0, 120);
    const now = new Date().toISOString();

    ticket.status = outcome === "resolved" ? "resolved" : "awaiting-visit";
    ticket.outcome = outcome;
    ticket.note = note;
    if (outcome === "resolved") ticket.resolvedAt = now;
    else ticket.summonedAt = now;
    ticket.messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    ticket.messages.push({ outcome, note, visitWhen, at: now, to: ticket.student.email });
    demoSaveState();

    return demoJson({ ticket: demoTicketSummary(ticket), emailed: ticket.student.email });
  }

  return demoJson({ error: "Not found." }, 404);
}

/*
 * If the app server stops, whatever sits in front of it (the preview proxy, a
 * reverse proxy, a hosting platform) answers with an HTML error page instead
 * of our JSON. Report that honestly — "check that the server is running" is
 * actionable, "unexpected response" is not.
 */
const SERVER_UNREACHABLE =
  "The website could not reach its server. Make sure it is running (node server.js), then try again.";

/*
 * Where the API lives.
 *
 * Normally the page and the API are served by the same Node process, so a
 * relative "/api/..." URL is correct. Two common development setups break that
 * assumption:
 *
 *   - the HTML is opened straight from disk (file://), where "/api/..." points
 *     at the file system;
 *   - the HTML is served by a static-only dev server such as VS Code Live
 *     Server on :5500, where "/api/..." hits that server and answers 404 HTML.
 *
 * Both look identical in the browser — "could not reach its server" — so the
 * address is worked out once, up front, by asking the current origin for
 * /api/health. If it does not answer as our server, fall back to the Node port.
 */
let apiBasePromise = null;

/** Ask an origin whether it is running our Node server. */
async function probeServer(origin) {
  try {
    const response = await fetch(`${origin}/api/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      mode: origin ? "cors" : "same-origin"
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return Boolean(body && body.service === "ict-innovation-center");
  } catch {
    return false;
  }
}

async function resolveApiBase() {
  if (!apiBasePromise) {
    apiBasePromise = (async () => {
      // 1. Served by node server.js — the normal, fully featured case.
      if (window.location.protocol !== "file:" && (await probeServer(""))) return "";

      // 2. A static dev server (Live Server, file://) — try the Node port.
      const host = window.location.protocol === "file:" ? "localhost" : window.location.hostname || "localhost";
      const fallback = `http://${host}:3000`;
      if (await probeServer(fallback)) {
        console.info(`[ICT] API not served from this origin; using ${fallback}`);
        return fallback;
      }

      // 3. No server anywhere — run the whole portal in this browser.
      demoMode = true;
      console.info("[ICT] No server found — running the offline demo.");
      announceDemoMode();
      return "";
    })();
  }
  return apiBasePromise;
}

/** Resolve a "/api/..." path against whichever origin hosts the API. */
async function apiUrl(path) {
  const base = await resolveApiBase();
  return `${base}${path}`;
}

/** True once no server answered — the portal then runs entirely in the browser. */
let demoMode = false;

/** fetch() against the API, or the local demo engine when there is no server. */
async function apiFetch(path, options = {}) {
  // Settle where the API lives first, so the very first call already knows.
  await resolveApiBase();
  if (demoMode) return demoApi(path, options);
  return fetch(await apiUrl(path), {
    // A page opened from disk cannot share cookies; everything else may.
    credentials: window.location.protocol === "file:" ? "omit" : "include",
    ...options
  });
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok || response.status >= 400) throw new Error(SERVER_UNREACHABLE);
    throw new Error("The server returned an unexpected response. Please try again.");
  }
}

async function postJson(url, body) {
  // One quiet retry covers a server that is restarting between requests.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await postJsonOnce(url, body);
    } catch (error) {
      if (error.message !== SERVER_UNREACHABLE || attempt >= 1) throw error;
      await wait(1200);
    }
  }
}

async function postJsonOnce(url, body) {
  let response;
  try {
    response = await apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    // fetch() itself rejects when nothing answers at all.
    throw new Error(SERVER_UNREACHABLE);
  }
  const result = await readJsonResponse(response);
  if (!response.ok || !result) {
    throw new Error((result && result.error) || "We couldn’t send your request. Please try again.");
  }
  return result;
}

function setStatus(element, message, state = "") {
  if (!element) return;
  element.textContent = message;
  element.className = `form-status${state ? ` ${state}` : ""}`;
}

/** A quiet badge so nobody mistakes the offline demo for the live system. */
function announceDemoMode() {
  if (document.querySelector("#demo-mode-badge")) return;

  // A slim strip at the very bottom: it never covers the form, and it can be
  // dismissed once the audience has seen it.
  const badge = document.createElement("p");
  badge.id = "demo-mode-badge";
  badge.className = "demo-mode-badge";

  const label = document.createElement("span");
  label.innerHTML =
    "<strong>Demo mode</strong> — no server running, so the portal and desk work entirely in this browser. Tickets are kept on this device.";
  badge.appendChild(label);

  // Handy when rehearsing: clear every ticket and payment and start fresh.
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "demo-reset";
  reset.textContent = "Reset demo data";
  reset.addEventListener("click", () => {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
    window.location.reload();
  });
  badge.appendChild(reset);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "demo-dismiss";
  dismiss.setAttribute("aria-label", "Dismiss demo mode notice");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => badge.remove());
  badge.appendChild(dismiss);

  document.body.appendChild(badge);
}

/** Show a message plus a "Try again" button that repeats the failed action. */
function setStatusWithRetry(element, message, retry) {
  if (!element) return;
  setStatus(element, "", "error");
  element.append(message, " ");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = "Try again";
  button.addEventListener("click", retry, { once: true });
  element.appendChild(button);
}

/* -------------------------------------------------------------------------- */
/* 2. Page router                                                              */
/* -------------------------------------------------------------------------- */

const PAGE_TITLES = {
  home: null,
  about: "About us",
  innovation: "Innovation Unit",
  meeting: "Meeting request",
  "id-card": "UNN ID card",
  training: "Training",
  software: "Software Unit",
  hardware: "Hardware Unit",
  portal: "Portal Unit",
  staff: "Service desk"
};

const pageViews = Object.fromEntries(
  Object.entries({
    home: "#home-view",
    about: "#about-view",
    innovation: "#innovation-view",
    meeting: "#meeting-view",
    "id-card": "#id-card-view",
    training: "#training-view",
    software: "#software-view",
    hardware: "#hardware-view",
    portal: "#portal-view",
    staff: "#staff-view"
  }).map(([name, selector]) => [name, document.querySelector(selector)])
);

function currentPage() {
  const page = new URLSearchParams(window.location.search).get("page");
  return Object.hasOwn(pageViews, page) ? page : "home";
}

function updateDocumentTitle(page) {
  const section = PAGE_TITLES[page];
  document.title = section
    ? `${section} | ICT Innovation Center`
    : "ICT Innovation Center | University of Nigeria, Nsukka";
}

function showPage(page, { push = true, focusHeading = true } = {}) {
  if (!Object.hasOwn(pageViews, page) || !pageViews[page]) return;

  Object.entries(pageViews).forEach(([name, view]) => {
    if (view) view.hidden = name !== page;
  });

  if (push) {
    const url = new URL(window.location.href);
    if (page === "home") url.searchParams.delete("page");
    else url.searchParams.set("page", page);
    window.history.pushState({ page }, "", `${url.pathname}${url.search}${url.hash}`);
  }

  updateDocumentTitle(page);
  window.scrollTo({ top: 0 });

  if (page === "portal") portalEnter();
  if (page === "staff") staffEnter();

  if (focusHeading) {
    const heading = pageViews[page].querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }
}

function goToSection(selector) {
  showPage("home", { push: true, focusHeading: false });
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const section = document.querySelector(selector);
      if (!section) return;
      const headerOffset = 92;
      const top = section.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  });
}

document.querySelectorAll("[data-page]").forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    const page = control.dataset.page;

    if (page === "home") {
      // The logo and "back to home" links return to the top of the homepage;
      // unit-level links jump straight to the services grid.
      const returnsToTop = control.matches(".brand, .back-link");
      if (returnsToTop) {
        showPage("home", { focusHeading: false });
        closeNav();
        return;
      }
      goToSection("#units");
      return;
    }

    resetMeetingFlow();
    trainingRegistration.hidden = true;
    closeNav();
    showPage(page);
  });
});

document.querySelectorAll('a[href="#units"], a[href="#training"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const selector = link.getAttribute("href");
    if (!selector) return;
    event.preventDefault();
    closeNav();
    goToSection(selector);
  });
});

window.addEventListener("popstate", () => showPage(currentPage(), { push: false }));

/* -------------------------------------------------------------------------- */
/* 3. Mobile navigation                                                        */
/* -------------------------------------------------------------------------- */

const navToggle = document.querySelector("#nav-toggle");
const siteNav = document.querySelector("#site-nav");

function setNavOpen(open) {
  if (!navToggle || !siteNav) return;
  navToggle.setAttribute("aria-expanded", String(open));
  siteNav.classList.toggle("is-open", open);
  document.body.classList.toggle("nav-open", open);
}

function closeNav() {
  setNavOpen(false);
}

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    setNavOpen(navToggle.getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNav();
  });
  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("nav-open")) return;
    if (siteNav.contains(event.target) || navToggle.contains(event.target)) return;
    closeNav();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeNav();
  });
}

/* -------------------------------------------------------------------------- */
/* 4. Unit carousel                                                            */
/* -------------------------------------------------------------------------- */

const unitGrid = document.querySelector("#unit-grid");
const unitCards = unitGrid ? [...unitGrid.querySelectorAll("[data-unit-card]")] : [];
const unitPageLabel = document.querySelector("#unit-page-label");
const unitPreviousButton = document.querySelector("#unit-page-previous");
const unitNextButton = document.querySelector("#unit-page-next");
const unitPageStatus = document.querySelector("#unit-page-status");

const UNITS_PER_PAGE = 5;
const TOTAL_PAGES = Math.max(1, Math.ceil(unitCards.length / UNITS_PER_PAGE));
const FLIP_DURATION_MS = 340;
const FLIP_STAGGER_MS = 45;

let unitPage = 0;
let unitTransitioning = false;

function unitsOnPage(page) {
  const start = page * UNITS_PER_PAGE;
  return { start, end: Math.min(start + UNITS_PER_PAGE, unitCards.length) };
}

function renderUnitPage() {
  const pageOf = (index) => Math.floor(index / UNITS_PER_PAGE);
  unitCards.forEach((card, index) => {
    card.hidden = pageOf(index) !== unitPage;
  });

  unitGrid.dataset.page = unitPage === 0 ? "first" : "second";
  const { start, end } = unitsOnPage(unitPage);

  if (unitPage === 0) {
    unitPageLabel.textContent = "View other units";
    unitPreviousButton.hidden = true;
    unitNextButton.hidden = TOTAL_PAGES === 1;
  } else {
    unitPageLabel.textContent = "View first five units";
    unitPreviousButton.hidden = false;
    unitNextButton.hidden = unitPage === TOTAL_PAGES - 1;
  }

  unitPageStatus.textContent = `Showing units ${start + 1}–${end} of ${unitCards.length}`;
}

/**
 * Stagger cards in the direction of travel: the far edge starts first so the
 * flip reads as a wave moving right-to-left (next) or left-to-right (previous).
 */
function applyFlipOrder(cards, direction) {
  const ordered = cards
    .map((card) => ({ card, rect: card.getBoundingClientRect() }))
    .sort((a, b) => {
      const rowDifference = Math.round(a.rect.top) - Math.round(b.rect.top);
      if (Math.abs(rowDifference) > 4) return rowDifference;
      return direction === "next" ? b.rect.left - a.rect.left : a.rect.left - b.rect.left;
    });

  ordered.forEach(({ card }, index) => {
    card.style.setProperty("--flip-order", String(index));
  });
}

function setUnitControlsDisabled(disabled) {
  unitPreviousButton.disabled = disabled;
  unitNextButton.disabled = disabled;
  unitGrid.setAttribute("aria-busy", String(disabled));
}

async function changeUnitPage(targetPage) {
  if (!unitGrid || unitTransitioning) return;
  if (targetPage === unitPage || targetPage < 0 || targetPage >= TOTAL_PAGES) return;

  const direction = targetPage > unitPage ? "next" : "previous";
  unitTransitioning = true;
  setUnitControlsDisabled(true);

  if (prefersReducedMotion()) {
    unitPage = targetPage;
    renderUnitPage();
    unitTransitioning = false;
    setUnitControlsDisabled(false);
    (targetPage === 0 ? unitNextButton : unitPreviousButton).focus();
    return;
  }

  const outgoing = unitCards.filter((card) => !card.hidden);
  applyFlipOrder(outgoing, direction);
  unitGrid.dataset.direction = direction;
  unitGrid.dataset.phase = "leaving";
  await wait(FLIP_DURATION_MS + (outgoing.length - 1) * FLIP_STAGGER_MS + 40);

  unitPage = targetPage;
  renderUnitPage();

  const incoming = unitCards.filter((card) => !card.hidden);
  applyFlipOrder(incoming, direction);
  unitGrid.dataset.phase = "entering";
  void unitGrid.offsetWidth; // flush the entering transform before animating in
  unitGrid.dataset.phase = "settling";
  await wait(FLIP_DURATION_MS + (incoming.length - 1) * FLIP_STAGGER_MS + 60);

  unitGrid.dataset.phase = "idle";
  unitTransitioning = false;
  setUnitControlsDisabled(false);
  (targetPage === 0 ? unitNextButton : unitPreviousButton).focus();
}

if (unitGrid && unitCards.length) {
  unitPreviousButton.addEventListener("click", () => changeUnitPage(unitPage - 1));
  unitNextButton.addEventListener("click", () => changeUnitPage(unitPage + 1));
  unitGrid.dataset.direction = "next";
  renderUnitPage();
}

/* -------------------------------------------------------------------------- */
/* 5. Meeting request flow                                                     */
/* -------------------------------------------------------------------------- */

const meetingForm = document.querySelector("#meeting-form");
const meetingTypeInput = document.querySelector("#meeting-type");
const locationField = document.querySelector(".location-field");
const locationInput = locationField ? locationField.querySelector("input") : null;
const meetingStatus = document.querySelector("#meeting-status");
const meetingTypeLabel = document.querySelector("#meeting-form-type");

const MEETING_TYPE_COPY = {
  facility: {
    label: "AT THE ICT CENTER",
    title: "Choose a day at the Center",
    hours: "Open 10:00 a.m. – 4:00 p.m.",
    note: "One booking per slot. The room is yours for the hour."
  },
  outside: {
    label: "ON-SITE MEETING",
    title: "Choose a day for us to come to you",
    hours: "Open 10:00 a.m. – 6:00 p.m.",
    note: "One booking per slot. The team travels to your location."
  }
};

const booking = {
  type: "facility",
  days: [],
  today: "",
  monthIndex: 0,
  months: [],
  selectedDate: "",
  selectedTime: "",
  loading: false
};

const calendarGrid = document.querySelector("#calendar-grid");
const calendarMonth = document.querySelector("#calendar-month");
const calendarPrev = document.querySelector("#calendar-prev");
const calendarNext = document.querySelector("#calendar-next");
const bookingTitle = document.querySelector("#booking-title");
const bookingHours = document.querySelector("#booking-hours");
const bookingTimes = document.querySelector("#booking-times");
const bookingDay = document.querySelector("#booking-day");
const slotGrid = document.querySelector("#slot-grid");
const bookingNote = document.querySelector("#booking-note");
const meetingDateInput = document.querySelector("#meeting-date");
const meetingTimeInput = document.querySelector("#meeting-time");

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function monthKey(dateString) {
  return String(dateString).slice(0, 7);
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function dayLabel(dateString) {
  return new Date(`${dateString}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  });
}

/** Load the availability window for the selected section. */
async function loadAvailability(type) {
  booking.loading = true;
  if (calendarGrid) calendarGrid.innerHTML = `<p class="calendar-loading">Loading available days…</p>`;

  try {
    const response = await apiFetch(`/api/meetings/availability?type=${encodeURIComponent(type)}&days=120`, {
      headers: { Accept: "application/json" }
    });
    const data = await readJsonResponse(response);
    if (!response.ok || !data || !Array.isArray(data.days)) {
      throw new Error((data && data.error) || "The calendar could not be loaded.");
    }

    booking.days = data.days;
    booking.today = data.today || data.from;
    booking.months = [...new Set(data.days.map((day) => monthKey(day.date)))];
    booking.monthIndex = 0;
    renderCalendar();
  } catch (error) {
    if (calendarGrid) {
      calendarGrid.innerHTML = `<p class="calendar-loading is-error">${error.message}</p>`;
    }
  } finally {
    booking.loading = false;
  }
}

function renderCalendar() {
  if (!calendarGrid) return;

  const key = booking.months[booking.monthIndex];
  if (calendarMonth) calendarMonth.textContent = key ? monthLabel(key) : "—";
  if (calendarPrev) calendarPrev.disabled = booking.monthIndex <= 0;
  if (calendarNext) calendarNext.disabled = booking.monthIndex >= booking.months.length - 1;

  calendarGrid.innerHTML = "";
  const days = booking.days.filter((day) => monthKey(day.date) === key);

  if (!days.length) {
    calendarGrid.innerHTML = `<p class="calendar-loading">No bookable days in this month.</p>`;
    return;
  }

  const [year, month] = key.split("-").map(Number);
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  for (let index = 0; index < leading; index += 1) {
    const blank = document.createElement("span");
    blank.className = "calendar-blank";
    calendarGrid.appendChild(blank);
  }

  for (const day of days) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = day.date;
    button.setAttribute("role", "gridcell");
    button.innerHTML = `<span class="calendar-day-number">${Number(day.date.slice(8, 10))}</span><span class="calendar-day-dot" aria-hidden="true"></span>`;

    const state = day.free === 0 ? "full" : day.free === day.slots.length ? "free" : "partial";
    button.classList.add(`is-${state}`);
    button.disabled = day.free === 0;
    button.setAttribute(
      "aria-label",
      `${dayLabel(day.date)} — ${day.free === 0 ? "fully booked" : `${day.free} slot${day.free === 1 ? "" : "s"} free`}`
    );
    if (day.date === booking.selectedDate) button.classList.add("is-selected");
    calendarGrid.appendChild(button);
  }
}

calendarPrev?.addEventListener("click", () => {
  booking.monthIndex = Math.max(0, booking.monthIndex - 1);
  renderCalendar();
});

calendarNext?.addEventListener("click", () => {
  booking.monthIndex = Math.min(booking.months.length - 1, booking.monthIndex + 1);
  renderCalendar();
});

calendarGrid?.addEventListener("click", (event) => {
  const button = event.target.closest(".calendar-day");
  if (!button || button.disabled) return;

  booking.selectedDate = button.dataset.date;
  booking.selectedTime = "";
  if (meetingDateInput) meetingDateInput.value = booking.selectedDate;
  if (meetingTimeInput) meetingTimeInput.value = "";

  calendarGrid.querySelectorAll(".calendar-day").forEach((cell) => {
    cell.classList.toggle("is-selected", cell === button);
  });
  renderSlots();
});

function renderSlots() {
  if (!bookingTimes || !slotGrid) return;
  const day = booking.days.find((entry) => entry.date === booking.selectedDate);
  if (!day) return;

  bookingTimes.hidden = false;
  if (bookingDay) bookingDay.textContent = dayLabel(day.date);
  slotGrid.innerHTML = "";

  for (const slot of day.slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `slot${slot.taken ? " is-taken" : ""}`;
    button.dataset.time = slot.time;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(booking.selectedTime === slot.time));
    button.disabled = slot.taken;
    button.innerHTML = `<span>${slot.label}</span>${slot.taken ? `<small>Taken</small>` : ""}`;
    if (booking.selectedTime === slot.time) button.classList.add("is-selected");
    slotGrid.appendChild(button);
  }

  if (bookingNote) {
    bookingNote.textContent = day.free === 0 ? "That day is fully booked." : MEETING_TYPE_COPY[booking.type].note;
  }
  bookingTimes.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

slotGrid?.addEventListener("click", (event) => {
  const button = event.target.closest(".slot");
  if (!button || button.disabled) return;

  booking.selectedTime = button.dataset.time;
  if (meetingTimeInput) meetingTimeInput.value = booking.selectedTime;

  slotGrid.querySelectorAll(".slot").forEach((slot) => {
    const selected = slot === button;
    slot.classList.toggle("is-selected", selected);
    slot.setAttribute("aria-checked", String(selected));
  });
  setStatus(meetingStatus, `Booked for ${dayLabel(booking.selectedDate)} at ${button.querySelector("span").textContent}.`);
});

document.querySelector("[data-clear-date]")?.addEventListener("click", () => {
  booking.selectedDate = "";
  booking.selectedTime = "";
  if (meetingDateInput) meetingDateInput.value = "";
  if (meetingTimeInput) meetingTimeInput.value = "";
  if (bookingTimes) bookingTimes.hidden = true;
  calendarGrid?.querySelectorAll(".calendar-day").forEach((cell) => cell.classList.remove("is-selected"));
});

function applyMeetingType(type) {
  const copy = MEETING_TYPE_COPY[type] || MEETING_TYPE_COPY.facility;
  booking.type = type;
  if (meetingTypeLabel) meetingTypeLabel.textContent = copy.label;
  if (bookingTitle) bookingTitle.textContent = copy.title;
  if (bookingHours) bookingHours.textContent = copy.hours;
  if (bookingNote) bookingNote.textContent = copy.note;

  booking.selectedDate = "";
  booking.selectedTime = "";
  if (meetingDateInput) meetingDateInput.value = "";
  if (meetingTimeInput) meetingTimeInput.value = "";
  if (bookingTimes) bookingTimes.hidden = true;
  loadAvailability(type);
}

function resetMeetingFlow() {
  if (!meetingForm) return;
  meetingForm.hidden = true;
  meetingForm.reset();
  meetingTypeInput.value = "facility";
  locationField.hidden = true;
  locationInput.required = false;
  booking.selectedDate = "";
  booking.selectedTime = "";
  if (bookingTimes) bookingTimes.hidden = true;
  meetingForm.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  document.querySelectorAll(".meeting-choice").forEach((choice) => choice.classList.remove("selected"));
  setStatus(meetingStatus, "Pick a date and time, then send the request.");
}

document.querySelectorAll("[data-meeting-type]").forEach((button) => {
  button.addEventListener("click", () => {
    const type = button.dataset.meetingType;
    resetMeetingFlow();
    meetingTypeInput.value = type;
    locationField.hidden = type !== "outside";
    locationInput.required = type === "outside";
    document.querySelectorAll(".meeting-choice").forEach((choice) => {
      choice.classList.toggle("selected", choice === button);
    });
    meetingForm.hidden = false;
    applyMeetingType(type);
    setStatus(meetingStatus, "Pick an available day, then a time.");
    meetingForm.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });
});

const resetMeetingButton = document.querySelector("[data-reset-meeting]");
if (resetMeetingButton) resetMeetingButton.addEventListener("click", resetMeetingFlow);

if (meetingForm) {
  meetingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!booking.selectedDate || !booking.selectedTime) {
      setStatus(meetingStatus, "Choose a date from the calendar and a time before sending.", "error");
      document.querySelector("#booking-calendar")?.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });
      return;
    }
    if (!meetingForm.reportValidity()) return;

    const submitButton = meetingForm.querySelector('button[type="submit"]');
    const originalLabel = submitButton.innerHTML;
    const body = Object.fromEntries(new FormData(meetingForm).entries());

    submitButton.disabled = true;
    submitButton.textContent = "Sending request…";
    setStatus(meetingStatus, "Sending your request…");

    try {
      const result = await postJson("/api/meetings", body);
      meetingForm.reset();
      meetingTypeInput.value = body.meetingType;
      locationField.hidden = body.meetingType !== "outside";
      locationInput.required = body.meetingType === "outside";
      document.querySelectorAll(".meeting-choice").forEach((choice) => {
        choice.classList.toggle("selected", choice.dataset.meetingType === body.meetingType);
      });
      booking.selectedDate = "";
      booking.selectedTime = "";
      if (bookingTimes) bookingTimes.hidden = true;
      applyMeetingType(body.meetingType);

      setStatus(
        meetingStatus,
        `Request ${result.meeting.id} sent for ${dayLabel(result.meeting.date)} at ${result.meeting.timeLabel}. ` +
          "The Innovation Unit will email you to confirm. Payment is made onsite.",
        "success"
      );
    } catch (error) {
      setStatus(meetingStatus, error.message, "error");
      if (/just taken/i.test(error.message)) loadAvailability(booking.type);
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalLabel;
    }
  });
}

/* -------------------------------------------------------------------------- */
/* 6. Training registration                                                    */
/* -------------------------------------------------------------------------- */

const trainingRegistration = document.querySelector("#training-registration");
const trainingForm = document.querySelector("#training-form");
const courseSelect = document.querySelector("#training-course");
const courseFee = document.querySelector("#course-fee");

const COURSE_FEES = { basic: "₦25,000", coding: "₦35,000" };

const registerTrainingButton = document.querySelector("[data-show-training-form]");
if (registerTrainingButton) {
  registerTrainingButton.addEventListener("click", () => {
    trainingRegistration.hidden = false;
    trainingRegistration.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    trainingForm.querySelector("input[name='name']").focus({ preventScroll: true });
  });
}

if (courseSelect) {
  courseSelect.addEventListener("change", () => {
    courseFee.textContent = COURSE_FEES[courseSelect.value] || "Select a course";
  });
}

/* -------------------------------------------------------------------------- */
/* 7. Shared service-request forms                                             */
/* -------------------------------------------------------------------------- */

const SUCCESS_MESSAGES = {
  contact: "Thanks — your message is on its way. The team will reply soon.",
  software: "Your website request has been sent. The Software Unit will review it and contact you about a fixed cost.",
  hardware: "Your repair request has been sent. The Hardware Unit will follow up about assessment and pricing.",
  portal: "Your portal request has been sent. The Portal Unit will investigate and get back to you.",
  training: "Your registration has been sent. The Training Unit will confirm your place and share payment details."
};

document.querySelectorAll("[data-service-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const serviceType = form.dataset.serviceForm;
    const status = form.querySelector(".form-status");
    const submitButton = form.querySelector('button[type="submit"]');
    const originalLabel = submitButton.innerHTML;
    const body = Object.fromEntries(new FormData(form).entries());
    body.serviceType = serviceType;

    submitButton.disabled = true;
    submitButton.textContent = "Sending request…";
    setStatus(status, "Sending your request securely…");

    try {
      await postJson("/api/service-requests", body);
      form.reset();
      if (serviceType === "training" && courseFee) courseFee.textContent = "Select a course";
      setStatus(status, SUCCESS_MESSAGES[serviceType] || "Your request has been sent.", "success");
    } catch (error) {
      setStatus(status, error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalLabel;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Contact panel and page utilities                                         */
/* -------------------------------------------------------------------------- */

const contactTrigger = document.querySelector("[data-show-contact]");
if (contactTrigger) {
  contactTrigger.addEventListener("click", () => {
    const form = document.querySelector("#contact-form");
    const isOpening = form.hidden;
    form.hidden = !isOpening;
    contactTrigger.setAttribute("aria-expanded", String(isOpening));
    if (isOpening) {
      form.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      form.querySelector("input[name='name']").focus({ preventScroll: true });
    }
  });
}

document.querySelectorAll("[data-back-to-top]").forEach((button) => {
  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });
});

/* -------------------------------------------------------------------------- */
/* 9. Portal service desk (student)                                           */
/* -------------------------------------------------------------------------- */

const portal = {
  step: 1,
  student: null,
  issues: [],
  issue: null,
  method: null,
  payment: null,
  receipt: null,
  ticket: null
};

const portalSteps = document.querySelector("#portal-steps");
const portalStepIndicators = [...document.querySelectorAll("[data-step-indicator]")];
const portalViews = {
  1: document.querySelector("#portal-step-identify"),
  2: document.querySelector("#portal-step-issue"),
  3: document.querySelector("#portal-step-payment"),
  4: document.querySelector("#portal-step-describe"),
  done: document.querySelector("#portal-step-done")
};

const naira = (amount) => `₦${Number(amount || 0).toLocaleString("en-NG")}`;

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function portalGoTo(step, { scroll = true } = {}) {
  portal.step = step;
  Object.entries(portalViews).forEach(([key, view]) => {
    if (view) view.hidden = String(key) !== String(step);
  });

  const numeric = Number(step);
  const feeKnown = Boolean(portal.issue);
  const hasPayment = Boolean(portal.issue && portal.issue.requiresPayment);
  portalStepIndicators.forEach((indicator) => {
    const index = Number(indicator.dataset.stepIndicator);
    const complete = step === "done" ? true : index < numeric;
    indicator.classList.toggle("is-complete", complete);
    indicator.classList.toggle("is-current", index === numeric);
    if (index === numeric) indicator.setAttribute("aria-current", "step");
    else indicator.removeAttribute("aria-current");
    // Step 3 only exists once a fee-paying issue has been chosen.
    indicator.hidden = index === 3 && feeKnown && !hasPayment && step !== "done";
  });

  const target = portalViews[step];
  if (!target || !scroll) return;
  const heading = target.querySelector("h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  target.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function portalReset() {
  portal.student = null;
  portal.issue = null;
  portal.method = null;
  portal.payment = null;
  portal.receipt = null;
  portal.ticket = null;

  const identifyForm = document.querySelector("#portal-identify-form");
  if (identifyForm) {
    identifyForm.reset();
    setStatus(identifyForm.querySelector(".form-status"), "");
  }
  document.querySelector("#portal-issue-picker").hidden = true;
  document.querySelector("#portal-identity").hidden = false;
  document.querySelector("#issue-list").innerHTML = "";
  document.querySelector("#issue-selected").hidden = true;
  document.querySelector("#portal-issue-continue").disabled = true;
  document.querySelectorAll(".pay-method").forEach((button) => button.classList.remove("selected"));
  document.querySelector("#transfer-panel").hidden = true;
  document.querySelector("#payment-done").hidden = true;
  document.querySelector("#portal-payment-continue").disabled = true;
  document.querySelector("#invoice").hidden = true;
  setStatus(document.querySelector("#payment-status"), "");

  const receiptInput = document.querySelector("#receipt-input");
  if (receiptInput) receiptInput.value = "";
  const preview = document.querySelector("#upload-preview");
  if (preview) {
    preview.hidden = true;
    preview.innerHTML = "";
  }

  portalGoTo(1);
}

/* --- Step 1: identify ----------------------------------------------------- */

const identifyForm = document.querySelector("#portal-identify-form");
if (identifyForm) {
  identifyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!identifyForm.reportValidity()) return;

    const status = identifyForm.querySelector(".form-status");
    const button = identifyForm.querySelector('button[type="submit"]');
    const body = Object.fromEntries(new FormData(identifyForm).entries());
    const originalLabel = button.innerHTML;

    button.disabled = true;
    button.textContent = "Checking your record…";
    setStatus(status, "");

    try {
      const result = await postJson("/api/portal/lookup", body);
      portal.student = result.student;
      portal.issues = Array.isArray(result.issues) ? result.issues : [];
      renderIdentity();
      renderIssues();
      setStatus(status, "");
      portalGoTo(2);
    } catch (error) {
      if (error.message === SERVER_UNREACHABLE) {
        setStatusWithRetry(status, error.message, () => identifyForm.requestSubmit());
      } else {
        setStatus(status, error.message, "error");
        if (/does not correspond/i.test(error.message)) {
          identifyForm.querySelector('input[name="name"]').focus();
        }
      }
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });
}

/* --- Demo student records ------------------------------------------------ */
/*
 * While the server runs on its built-in demo roster it publishes the list at
 * /api/portal/students. Showing it here lets the panel demonstrate exactly
 * where a lookup reads from. When a real student export is connected the
 * endpoint answers 403 and this panel removes itself.
 */

const portalRoster = { students: [], loaded: false, failed: false };

const rosterPanel = document.querySelector("#portal-roster");
const rosterList = document.querySelector("#portal-roster-list");
const rosterFilter = document.querySelector("#portal-roster-filter");
const rosterCount = document.querySelector("#portal-roster-count");

function renderRosterList(query = "") {
  if (!rosterList) return;
  const needle = query.trim().toLowerCase();
  const matches = portalRoster.students.filter((student) =>
    needle
      ? [student.fullName, student.registrationNumber, student.department, student.faculty, student.level]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      : true
  );

  rosterList.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement("li");
    empty.className = "roster-empty";
    empty.textContent = "No student matches that filter.";
    rosterList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const student of matches) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "roster-row";
    button.dataset.registration = student.registrationNumber;
    button.dataset.name = student.fullName;

    const reg = document.createElement("span");
    reg.className = "roster-reg";
    reg.textContent = student.registrationNumber;

    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = student.fullName;

    const meta = document.createElement("span");
    meta.className = "roster-meta";
    meta.textContent = [student.department, student.level].filter(Boolean).join(" · ");

    button.append(reg, name, meta);
    item.appendChild(button);
    fragment.appendChild(item);
  }
  rosterList.appendChild(fragment);
}

async function loadDemoRoster() {
  if (!rosterPanel || portalRoster.loaded || portalRoster.failed) return;

  try {
    const response = await apiFetch("/api/portal/students", { headers: { Accept: "application/json" } });
    if (!response.ok) {
      portalRoster.failed = true;
      rosterPanel.hidden = true;
      return;
    }
    const data = await readJsonResponse(response);
    if (!data || !Array.isArray(data.students) || !data.demo) {
      portalRoster.failed = true;
      return;
    }

    portalRoster.students = data.students;
    portalRoster.loaded = true;
    rosterCount.textContent = `${data.total} student${data.total === 1 ? "" : "s"} on file`;
    renderRosterList(rosterFilter ? rosterFilter.value : "");
    rosterPanel.hidden = false;

    const hint = document.querySelector("#portal-demo-hint");
    if (hint) {
      hint.textContent = "";
      hint.append("Demo server: ");
      const count = document.createElement("code");
      count.textContent = String(data.total);
      hint.append(count, " student records · open the list above, or type ");
      const sample = document.createElement("code");
      sample.textContent = "2021/240001";
      hint.append(sample, ".");
    }
  } catch {
    portalRoster.failed = true;
    rosterPanel.hidden = true;
  }
}

rosterFilter?.addEventListener("input", () => renderRosterList(rosterFilter.value));

rosterList?.addEventListener("click", (event) => {
  const row = event.target.closest(".roster-row");
  if (!row || !identifyForm) return;

  identifyForm.querySelector('input[name="registrationNumber"]').value = row.dataset.registration || "";
  identifyForm.querySelector('input[name="name"]').value = row.dataset.name || "";
  setStatus(identifyForm.querySelector(".form-status"), "");
  identifyForm.requestSubmit();
});

function renderIdentity() {
  const student = portal.student;
  if (!student) return;
  document.querySelector("#portal-avatar").textContent = initials(student.fullName);
  document.querySelector("#portal-student-name").textContent = student.fullName;
  document.querySelector("#portal-student-reg").textContent = student.registrationNumber;
  document.querySelector("#portal-student-department").textContent = student.department || "—";
  document.querySelector("#portal-student-faculty").textContent = student.faculty || "—";
  document.querySelector("#portal-student-level").textContent = student.level || "—";
  document.querySelector("#portal-student-gender").textContent = student.gender || "—";
  document.querySelector("#portal-student-phone").textContent = student.phone || "—";
  document.querySelector("#portal-student-email").textContent = student.email || "—";
  document.querySelector("#portal-identity").hidden = false;
  document.querySelector("#portal-issue-picker").hidden = true;
}

/* --- Step 2: confirm and choose an issue ---------------------------------- */

const confirmIdentityButton = document.querySelector("#portal-confirm-identity");
if (confirmIdentityButton) {
  confirmIdentityButton.addEventListener("click", () => {
    document.querySelector("#portal-identity").hidden = true;
    document.querySelector("#portal-issue-picker").hidden = false;
    document.querySelector("#issue-list").querySelector("input")?.focus();
  });
}

const restartButton = document.querySelector("#portal-restart");
if (restartButton) restartButton.addEventListener("click", portalReset);

const issueBackButton = document.querySelector("#portal-issue-back");
if (issueBackButton) {
  issueBackButton.addEventListener("click", () => {
    document.querySelector("#portal-issue-picker").hidden = true;
    document.querySelector("#portal-identity").hidden = false;
    document.querySelector("#portal-issue-continue").disabled = true;
    portal.issue = null;
  });
}

function renderIssues() {
  const list = document.querySelector("#issue-list");
  list.innerHTML = "";

  for (const issue of portal.issues) {
    const id = `issue-${issue.id}`;
    const option = document.createElement("label");
    option.className = "issue-option";
    option.setAttribute("for", id);
    option.innerHTML = `
      <input type="radio" id="${id}" name="portal-issue" value="${issue.id}">
      <span class="issue-body">
        <span class="issue-title">${issue.label}</span>
        <span class="issue-summary">${issue.summary}</span>
        <span class="issue-meta">
          <span class="badge ${issue.requiresPayment ? "badge-fee" : "badge-free"}">${issue.feeLabel}</span>
        </span>
      </span>
      <span class="issue-check" aria-hidden="true"></span>
    `;
    list.appendChild(option);
  }

}

// One listener for the whole list; the options are re-rendered inside it.
document.querySelector("#issue-list")?.addEventListener("change", (event) => {
  const chosen = event.target.closest('input[name="portal-issue"]');
  if (!chosen) return;

  portal.issue = portal.issues.find((issue) => issue.id === chosen.value) || null;
  document.querySelectorAll(".issue-option").forEach((option) => {
    option.classList.toggle("is-selected", option.contains(chosen));
  });

  const summary = document.querySelector("#issue-selected");
  if (portal.issue) {
    summary.hidden = false;
    summary.innerHTML = `
      <span>Selected: <strong>${portal.issue.label}</strong></span>
      <span>${portal.issue.requiresPayment ? `Service fee <strong>${portal.issue.feeLabel}</strong>` : "<strong>No payment needed</strong>"}</span>
    `;
  } else {
    summary.hidden = true;
  }
  document.querySelector("#portal-issue-continue").disabled = !portal.issue;
});

const issueContinueButton = document.querySelector("#portal-issue-continue");
if (issueContinueButton) {
  issueContinueButton.addEventListener("click", () => {
    if (!portal.issue) return;
    if (portal.issue.requiresPayment) {
      renderPaymentSummary();
      portalGoTo(3);
    } else {
      renderDescribeSummary();
      portalGoTo(4);
    }
  });
}

/* --- Step 3: payment ------------------------------------------------------ */

function renderPaymentSummary() {
  const issue = portal.issue;
  const student = portal.student;
  const container = document.querySelector("#payment-summary");
  container.innerHTML = `
    <div><span>Student</span><strong>${student.fullName}</strong></div>
    <div><span>Registration number</span><strong>${student.registrationNumber}</strong></div>
    <div><span>Issue</span><strong>${issue.label}</strong></div>
    <div class="payment-amount"><span>Amount due</span><strong>${issue.feeLabel}</strong></div>
  `;
  document.querySelector("#payment-done").hidden = true;
  document.querySelector("#portal-payment-continue").disabled = true;
}

/**
 * Only the chosen payment method may be on screen. Switching in either
 * direction must fully close the other one, including any receipt that was
 * already attached to a transfer attempt.
 */
function resetPaymentPanels() {
  const transferPanel = document.querySelector("#transfer-panel");
  if (transferPanel) transferPanel.hidden = true;

  const donePanel = document.querySelector("#payment-done");
  if (donePanel) donePanel.hidden = true;

  const continueButton = document.querySelector("#portal-payment-continue");
  if (continueButton) continueButton.disabled = true;

  const accountGrid = document.querySelector("#account-grid");
  if (accountGrid) accountGrid.innerHTML = "";

  const receiptInput = document.querySelector("#receipt-input");
  if (receiptInput) receiptInput.value = "";

  const receiptName = document.querySelector("#receipt-name");
  if (receiptName) receiptName.textContent = "";

  const cardForm = document.querySelector("#card-panel, .card-panel");
  if (cardForm) cardForm.hidden = true;
}

document.querySelectorAll("[data-pay-method]").forEach((button) => {
  button.addEventListener("click", async () => {
    const method = button.dataset.payMethod;
    const status = document.querySelector("#payment-status");

    // Close the other method before opening this one.
    resetPaymentPanels();
    portal.method = method;
    portal.payment = null;
    portal.receipt = null;

    document.querySelectorAll(".pay-method").forEach((option) => {
      option.classList.toggle("selected", option === button);
      option.setAttribute("aria-checked", String(option === button));
    });

    if (method === "transfer") {
      // The account is issued by the server alongside the payment reference.
      setStatus(status, "Preparing the account details…");
      try {
        const result = await postJson("/api/portal/payments", {
          registrationNumber: portal.student.registrationNumber,
          name: portal.student.fullName,
          issueId: portal.issue.id,
          method: "transfer"
        });
        portal.payment = result.payment;
        renderTransferAccount(result.account, result.transferNote);
        setStatus(status, "Transfer the exact amount, then upload your receipt.");
      } catch (error) {
        setStatus(status, error.message, "error");
      }
      return;
    }

    setStatus(status, "Opening secure checkout…");
    try {
      const result = await postJson("/api/portal/payments", {
        registrationNumber: portal.student.registrationNumber,
        name: portal.student.fullName,
        issueId: portal.issue.id,
        method: "card"
      });
      if (!result.payment.checkoutUrl) {
        // Offline demo: settle the payment here instead of visiting /pay/:ref.
        await apiFetch(`/api/portal/payments/${encodeURIComponent(result.payment.reference)}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        portal.payment = { ...result.payment, status: "paid" };
        document.querySelector("#payment-done").hidden = false;
        document.querySelector("#portal-payment-continue").disabled = false;
        setStatus(status, "Payment confirmed (demo — no money moved). Continue to describe the problem.");
        return;
      }

      // Hand off to the provider's hosted checkout (or the local simulator).
      window.location.href = result.payment.checkoutUrl;
    } catch (error) {
      setStatus(status, error.message, "error");
    }
  });
});

function renderTransferAccount(account, note) {
  const grid = document.querySelector("#account-grid");
  grid.innerHTML = `
    <div><dt>Bank</dt><dd>${account.bank}</dd></div>
    <div><dt>Account name</dt><dd>${account.accountName}</dd></div>
    <div><dt>Account number</dt><dd class="account-number">${account.accountNumber}</dd></div>
    <div><dt>Amount</dt><dd class="account-number">${portal.issue.feeLabel}</dd></div>
    <div class="full-field"><dt>Payment reference</dt><dd>${portal.payment.reference}</dd></div>
  `;
  const noteElement = document.querySelector("#transfer-note");
  if (noteElement && note) noteElement.textContent = note;
  document.querySelector("#transfer-panel").hidden = false;
  document.querySelector("#transfer-panel").scrollIntoView({
    block: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth"
  });
}

const receiptInput = document.querySelector("#receipt-input");
if (receiptInput) {
  receiptInput.addEventListener("change", async () => {
    const file = receiptInput.files && receiptInput.files[0];
    const hint = document.querySelector("#upload-hint");
    const preview = document.querySelector("#upload-preview");
    const status = document.querySelector("#payment-status");
    portal.receipt = null;
    document.querySelector("#portal-payment-continue").disabled = true;

    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      hint.textContent = "That file type isn’t supported. Use JPG, PNG, WebP or PDF.";
      hint.classList.add("is-error");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      hint.textContent = "That file is larger than 4 MB. Please compress it and try again.";
      hint.classList.add("is-error");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      portal.receipt = { name: file.name, dataUrl, type: file.type };
      hint.classList.remove("is-error");
      hint.textContent = `${file.name} · ${file.size >= 1024 ? `${Math.round(file.size / 1024)} KB` : `${file.size} bytes`}`;
      preview.hidden = false;
      preview.innerHTML =
        file.type === "application/pdf"
          ? `<span class="preview-file">📄 ${file.name}</span>`
          : `<img src="${dataUrl}" alt="Preview of the uploaded receipt">`;
      document.querySelector("#portal-payment-continue").disabled = false;
      setStatus(status, "Receipt attached. Continue when you’re ready.");
    } catch {
      hint.textContent = "That file could not be read. Try another copy.";
      hint.classList.add("is-error");
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

const paymentContinueButton = document.querySelector("#portal-payment-continue");
if (paymentContinueButton) {
  paymentContinueButton.addEventListener("click", () => {
    if (portal.method === "transfer" && !portal.receipt) {
      setStatus(document.querySelector("#payment-status"), "Upload your transfer receipt to continue.", "error");
      return;
    }
    renderDescribeSummary();
    portalGoTo(4);
  });
}

/* --- Returning from a hosted checkout ------------------------------------- */

async function resumeAfterPayment(reference) {
  const status = document.querySelector("#payment-status");
  try {
    const result = await apiFetch(`/api/portal/payments/${encodeURIComponent(reference)}`, {
      headers: { Accept: "application/json" }
    }).then(readJsonResponse);

    if (!result || !result.payment) throw new Error("That payment reference was not found.");
    const payment = result.payment;

    if (payment.status !== "paid") {
      // Not settled yet — send the student back to the start of the flow.
      return false;
    }

    const issueList = await apiFetch("/api/portal/issues").then(readJsonResponse);
    portal.issues = issueList.issues || [];
    portal.issue = portal.issues.find((issue) => issue.id === payment.issueId) || null;
    portal.student = {
      fullName: payment.student.fullName,
      registrationNumber: payment.registrationNumber,
      department: payment.student.department,
      email: payment.student.email,
      phone: payment.student.phone,
      gender: "",
      level: ""
    };
    portal.payment = payment;
    portal.method = payment.method;

    renderIdentity();
    renderIssues();
    document.querySelector("#portal-identity").hidden = true;
    document.querySelector("#portal-issue-picker").hidden = false;
    document.querySelectorAll(".issue-option").forEach((option) => {
      const input = option.querySelector("input");
      const selected = input && input.value === payment.issueId;
      option.classList.toggle("is-selected", Boolean(selected));
      if (selected) input.checked = true;
    });

    renderDescribeSummary();
    portalGoTo(4);
    setStatus(status, `Payment received — ${payment.amountLabel} (${payment.rrr || reference}).`);
    return true;
  } catch (error) {
    setStatus(status, error.message || "We couldn’t check that payment.", "error");
    return false;
  }
}

/* --- Step 4: describe and submit ------------------------------------------ */

function renderDescribeSummary() {
  const container = document.querySelector("#describe-summary");
  const paymentLine = portal.payment
    ? `<div><span>Payment</span><strong>${portal.method === "transfer" ? "Transfer receipt attached" : "Paid"} · ${naira(portal.payment.amount)}</strong></div>`
    : `<div><span>Payment</span><strong>Not required</strong></div>`;

  container.innerHTML = `
    <div><span>Student</span><strong>${portal.student.fullName} · ${portal.student.registrationNumber}</strong></div>
    <div><span>Issue</span><strong>${portal.issue.label}</strong></div>
    ${paymentLine}
  `;

  // The Portal Unit reads every request and decides what happens next, so the
  // student is told the process rather than promised a visit (or no visit).
  const note = document.querySelector("#attendance-note");
  if (note) {
    note.hidden = false;
    note.innerHTML = `<span aria-hidden="true">ⓘ</span><span>The Portal Unit reads your request and emails you at <strong>${
      portal.student.email
    }</strong> with the outcome — either that it is fixed, or when to come to the ICT Center. Most requests are answered within one working day.</span>`;
  }
}

const describeForm = document.querySelector("#portal-describe-form");
if (describeForm) {
  describeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!describeForm.reportValidity()) return;

    const status = describeForm.querySelector(".form-status");
    const button = describeForm.querySelector('button[type="submit"]');
    const originalLabel = button.innerHTML;
    const description = describeForm.querySelector('textarea[name="description"]').value.trim();

    button.disabled = true;
    button.textContent = "Sending to the Portal Unit…";
    setStatus(status, "");

    try {
      const result = await postJson("/api/portal/tickets", {
        registrationNumber: portal.student.registrationNumber,
        name: portal.student.fullName,
        issueId: portal.issue.id,
        description,
        paymentReference: portal.payment ? portal.payment.reference : undefined,
        receiptDataUrl: portal.receipt ? portal.receipt.dataUrl : undefined
      });

      portal.ticket = result.ticket;
      renderDone(result.ticket);
      portalGoTo("done");
    } catch (error) {
      setStatus(status, error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });
}

function renderDone(ticket) {
  document.querySelector("#done-email").textContent = ticket.studentEmail;
  document.querySelector("#done-grid").innerHTML = `
    <div><dt>Ticket number</dt><dd class="emphasis">${ticket.id}</dd></div>
    <div><dt>Issue</dt><dd>${ticket.issueLabel}</dd></div>
    <div><dt>Fee</dt><dd>${ticket.feeLabel}</dd></div>
    <div><dt>Payment</dt><dd>${
      ticket.paymentStatus === "paid"
        ? "Paid"
        : ticket.paymentStatus === "receipt-submitted"
          ? "Transfer receipt received — awaiting verification"
          : "Not required"
    }</dd></div>
    <div><dt>Submitted</dt><dd>${new Date(ticket.createdAt).toLocaleString("en-NG")}</dd></div>
  `;

  const invoice = document.querySelector("#invoice");
  if (ticket.payment && ticket.paymentStatus === "paid") {
    invoice.hidden = false;
    invoice.innerHTML = `
      <div class="invoice-head">
        <span>PAYMENT CONFIRMATION</span>
        <span class="invoice-ok">PAID</span>
      </div>
      <dl class="invoice-grid">
        <div><dt>Remita RRR</dt><dd>${ticket.payment.rrr || "—"}</dd></div>
        <div><dt>Amount</dt><dd>${naira(ticket.payment.amount)}</dd></div>
        <div><dt>Method</dt><dd>${ticket.payment.method === "card" ? "Card" : "Bank transfer"}</dd></div>
        <div><dt>Reference</dt><dd>${ticket.payment.reference}</dd></div>
      </dl>
      <button class="text-button" type="button" data-print-invoice>Print this confirmation</button>
    `;
  } else {
    invoice.hidden = true;
  }

  // No promise about whether a visit is needed — that is the desk's call, and it
  // arrives by email with the ticket number quoted.
  const attendance = document.querySelector("#done-attendance");
  attendance.hidden = false;
  attendance.innerHTML = `<span aria-hidden="true">ⓘ</span><span><strong>What happens next:</strong> the Portal Unit reviews this request and emails <strong>${
    ticket.studentEmail
  }</strong>. The email will either confirm the fix or tell you when to come to the ICT Center with your ID card, quoting <strong>${
    ticket.id
  }</strong>.</span>`;
}

document.querySelector("#invoice")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-print-invoice]")) window.print();
});

const startOverButton = document.querySelector("#portal-start-over");
if (startOverButton) startOverButton.addEventListener("click", portalReset);

/* Called every time the portal page opens. */
let portalResumeAttempted = false;

function portalEnter() {
  const reference = new URLSearchParams(window.location.search).get("payment");

  if (reference && !portalResumeAttempted) {
    portalResumeAttempted = true;
    resumeAfterPayment(reference).then((resumed) => {
      if (!resumed) portalGoTo(1, { scroll: false });
    });
    return;
  }

  if (!portal.student) portalGoTo(1, { scroll: false });
  loadDemoRoster();
}

/* -------------------------------------------------------------------------- */
/* 10. Service desk (staff)                                                  */
/* -------------------------------------------------------------------------- */

const staff = {
  tickets: [],
  meetings: [],
  source: null,
  desk: "portal",          // which tab the officer is looking at
  signedInDesk: null       // which desk the session belongs to
};

const staffLogin = document.querySelector("#staff-login");
const staffDesk = document.querySelector("#staff-desk");
const meetingDesk = document.querySelector("#meeting-desk");
const deskPortalPanel = document.querySelector("#desk-portal");
const deskInnovationPanel = document.querySelector("#desk-innovation");

const DESK_COPY = {
  portal: {
    title: "Sign in to the Portal Unit desk",
    hint: "Use the access code issued to the Portal Unit. The Innovation Unit has a different code.",
    heading: "Portal requests.",
    copy: "Every request from the student portal arrives here. Read it, then email the student either that it is fixed or that they should come to the ICT Center."
  },
  innovation: {
    title: "Sign in to the Innovation Unit desk",
    hint: "Use the access code issued to the Innovation Unit. This desk receives meeting bookings.",
    heading: "Innovation meetings.",
    copy: "Every booking made from the Innovation page arrives here with its date and time. Accept it or decline it, then send the client the email."
  }
};

async function staffFetch(path, options = {}) {
  const { skipAuthRedirect = false, ...init } = options;
  const response = await apiFetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) }
  });
  if (response.status === 401 && !skipAuthRedirect) {
    staffSignedOut();
    throw new Error("Your session has ended. Sign in again.");
  }
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error((body && body.error) || "The request failed.");
  return body;
}

function staffCloseStream() {
  if (staff.source) {
    staff.source.close();
    staff.source = null;
  }
}

/** Show the sign-in card for the desk currently on screen. */
function staffSignedOut() {
  staffCloseStream();
  staff.tickets = [];
  staff.meetings = [];
  staff.signedInDesk = null;
  renderTickets();
  renderMeetings();
  if (staffLogin) staffLogin.hidden = false;
  if (staffDesk) staffDesk.hidden = true;
  if (meetingDesk) meetingDesk.hidden = true;
}

function applyDeskTab(desk) {
  staff.desk = desk;
  const copy = DESK_COPY[desk] || DESK_COPY.portal;

  document.querySelectorAll("[data-desk-tab]").forEach((tab) => {
    const active = tab.dataset.deskTab === desk;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  if (deskPortalPanel) deskPortalPanel.hidden = desk !== "portal";
  if (deskInnovationPanel) deskInnovationPanel.hidden = desk !== "innovation";

  const title = document.querySelector("#staff-login-title");
  const hint = document.querySelector("#staff-login-hint");
  if (title) title.textContent = copy.title;
  if (hint) hint.textContent = copy.hint;

  const heading = document.querySelector("#staff-heading-text");
  const headingCopy = document.querySelector("#staff-heading-copy");
  if (heading) heading.textContent = copy.heading;
  if (headingCopy) headingCopy.textContent = copy.copy;

  const signedIntoThisDesk = staff.signedInDesk === desk;
  if (staffLogin) staffLogin.hidden = signedIntoThisDesk;
  if (staffDesk) staffDesk.hidden = desk !== "portal" || !signedIntoThisDesk;
  if (meetingDesk) meetingDesk.hidden = desk !== "innovation" || !signedIntoThisDesk;
}

async function staffLoadTickets() {
  const data = await staffFetch("/api/staff/tickets");
  staffApplyTickets(data);
}

async function staffLoadMeetings() {
  const data = await staffFetch("/api/staff/meetings");
  staffApplyMeetings(data);
}

async function staffEnter() {
  // The page may be opened without a signed-in session at all.
  try {
    const session = await staffFetch("/api/staff/session", { skipAuthRedirect: true });
    staff.signedInDesk = session && session.signedIn ? session.desk : null;
    if (staff.signedInDesk) staff.desk = staff.signedInDesk;
  } catch {
    staff.signedInDesk = null;
  }

  applyDeskTab(staff.desk);

  if (!staff.signedInDesk) {
    staffSignedOut();
    applyDeskTab(staff.desk);
    return;
  }

  try {
    if (staff.signedInDesk === "portal") await staffLoadTickets();
    else await staffLoadMeetings();
    applyDeskTab(staff.desk);
    staffConnect().catch(() => {});
  } catch (error) {
    setStatus(document.querySelector("#staff-login-form .form-status"), error.message, "error");
    staffSignedOut();
    applyDeskTab(staff.desk);
  }
}

document.querySelectorAll("[data-desk-tab]").forEach((tab) => {
  tab.addEventListener("click", async () => {
    const desk = tab.dataset.deskTab;
    if (desk === staff.desk) return;
    staff.desk = desk;
    applyDeskTab(desk);

    // Switching to a desk we are already signed into: load it straight away.
    if (staff.signedInDesk === desk) {
      try {
        if (desk === "portal") await staffLoadTickets();
        else await staffLoadMeetings();
      } catch (error) {
        setStatus(document.querySelector("#staff-login-form .form-status"), error.message, "error");
      }
    }
  });
});

function staffApplyTickets(data) {
  staff.tickets = Array.isArray(data.tickets) ? data.tickets : [];
  renderTickets();
  const counts = data.counts || {
    open: staff.tickets.filter((ticket) => ticket.status === "open").length,
    awaiting: staff.tickets.filter((ticket) => ticket.status === "awaiting-visit").length,
    resolved: staff.tickets.filter((ticket) => ticket.status === "resolved").length
  };
  const countsElement = document.querySelector("#desk-counts");
  if (countsElement) {
    countsElement.innerHTML = `
      <span class="count-chip"><strong>${counts.open}</strong> new</span>
      <span class="count-chip"><strong>${counts.awaiting || 0}</strong> awaiting visit</span>
      <span class="count-chip"><strong>${counts.resolved}</strong> resolved</span>
    `;
  }
}

function relativeTime(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-NG");
}

const STATUS_LABEL = {
  open: "New",
  "awaiting-visit": "Awaiting visit",
  resolved: "Resolved"
};

function ticketStatusChip(ticket) {
  const label = STATUS_LABEL[ticket.status] || ticket.status;
  const modifier = ticket.status === "resolved" ? "is-resolved" : ticket.status === "awaiting-visit" ? "is-awaiting" : "";
  return `<span class="ticket-status ${modifier}">${label}</span>`;
}

/* ---------------------------------------------------------------- meetings */

const MEETING_STATUS_LABEL = { pending: "Pending", accepted: "Accepted", declined: "Declined" };

function meetingStatusChip(meeting) {
  const label = MEETING_STATUS_LABEL[meeting.status] || meeting.status;
  const modifier = meeting.status === "accepted" ? "is-resolved" : meeting.status === "declined" ? "is-declined" : "";
  return `<span class="ticket-status ${modifier}">${label}</span>`;
}

function meetingTypeChip(meeting) {
  return `<span class="badge">${meeting.meetingType === "outside" ? "Outside visit" : "At the Center"}</span>`;
}

function meetingWhen(meeting) {
  return `${meeting.dateLabel || meeting.date} · ${meeting.timeLabel || meeting.time}`;
}

function renderMeetings() {
  const list = document.querySelector("#meeting-list");
  const empty = document.querySelector("#meeting-empty");
  if (!list) return;

  list.innerHTML = "";
  if (!staff.meetings.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const meeting of staff.meetings) {
    const card = document.createElement("article");
    card.className = `ticket meeting-card is-${meeting.status}`;
    card.dataset.meetingId = meeting.id;

    const decided = meeting.status !== "pending";
    card.innerHTML = `
      <header class="ticket-head">
        <div>
          <span class="ticket-id">${meeting.id}</span>
          <h3>${meeting.name}</h3>
          <p class="ticket-sub">${meeting.department} · ${meeting.phone} · ${meeting.email}</p>
        </div>
        <div class="ticket-badges">${meetingStatusChip(meeting)}${meetingTypeChip(meeting)}</div>
      </header>
      <dl class="ticket-meta">
        <div><dt>Date</dt><dd>${meeting.dateLabel || meeting.date}</dd></div>
        <div><dt>Time</dt><dd>${meeting.timeLabel || meeting.time}</dd></div>
        <div><dt>Where</dt><dd>${meeting.meetingType === "outside" ? meeting.location || "Outside" : meeting.sectionLabel || "ICT Center"}</dd></div>
        <div><dt>Received</dt><dd>${relativeTime(meeting.createdAt)}</dd></div>
      </dl>
      <p class="ticket-note">${meeting.description}</p>
      ${
        decided && meeting.note
          ? `<div class="ticket-outcome"><strong>Officer’s note</strong><p>${meeting.note}</p></div>`
          : ""
      }
      ${
        meeting.status === "pending"
          ? `<div class="meeting-actions">
               <button type="button" class="chip chip-accept" data-meeting-accept>Accept</button>
               <button type="button" class="chip chip-decline" data-meeting-decline>Decline</button>
             </div>
             <div class="meeting-composer" hidden>
               <label class="composer-label" data-composer-label>Message to ${meeting.name}</label>
               <textarea class="composer-box" rows="5" data-composer-box maxlength="2000"></textarea>
               <div class="composer-actions">
                 <button type="button" class="chip" data-composer-cancel>Cancel</button>
                 <button type="button" class="button button-primary" data-composer-send>Send</button>
               </div>
               <p class="composer-status" role="status" aria-live="polite"></p>
             </div>`
          : ""
      }
    `;
    list.appendChild(card);
  }
}

/** Draft the email body the officer can edit before sending. */
function meetingDraft(meeting, outcome) {
  const first = String(meeting.name || "").split(/\s+/)[0] || "there";
  const when = meeting.dateLabel || meeting.date;
  const time = meeting.timeLabel || meeting.time;

  if (outcome === "accepted") {
    return (
      `Dear ${first},\n\n` +
      `Thank you for your meeting request to the ICT Innovation Center, University of Nigeria, Nsukka.\n\n` +
      `Your booking is confirmed for ${when}, ${time}` +
      `${meeting.meetingType === "outside" ? `, at ${meeting.location}.` : `, at the ICT Center.`}\n\n` +
      `Please note that payment for the meeting is made onsite — nothing is charged on the website. ` +
      `Reply to this email if you need to move the date or time.\n\n` +
      `Warm regards,\nInnovation Unit\nICT Innovation Center, UNN`
    );
  }

  return (
    `Dear ${first},\n\n` +
    `Thank you for your meeting request to the ICT Innovation Center, University of Nigeria, Nsukka.\n\n` +
    `Unfortunately we are unable to confirm ${when} at ${time}. ` +
    `Please reply with another date and time that works for you and we will be glad to arrange it.\n\n` +
    `Warm regards,\nInnovation Unit\nICT Innovation Center, UNN`
  );
}

function meetingCardComposer(card) {
  const composer = card.querySelector(".meeting-composer");
  const box = card.querySelector("[data-composer-box]");
  const label = card.querySelector("[data-composer-label]");
  const status = card.querySelector(".composer-status");
  return { composer, box, label, status };
}

document.addEventListener("click", (event) => {
  const card = event.target.closest(".meeting-card");
  if (!card) return;

  const accept = event.target.closest("[data-meeting-accept]");
  const decline = event.target.closest("[data-meeting-decline]");
  const cancel = event.target.closest("[data-composer-cancel]");
  const send = event.target.closest("[data-composer-send]");

  if (accept || decline) {
    const outcome = accept ? "accepted" : "declined";
    const meeting = staff.meetings.find((entry) => entry.id === card.dataset.meetingId);
    if (!meeting) return;

    const { composer, box, label, status } = meetingCardComposer(card);
    if (!composer || !box) return;

    card.dataset.outcome = outcome;
    composer.hidden = false;
    if (label) label.textContent = `Email to ${meeting.name} — ${outcome === "accepted" ? "confirming the booking" : "suggesting another date"}`;
    box.value = meetingDraft(meeting, outcome);
    if (status) setStatus(status, "");
    box.focus({ preventScroll: true });
    composer.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    return;
  }

  if (cancel) {
    const { composer, box } = meetingCardComposer(card);
    if (composer) composer.hidden = true;
    if (box) box.value = "";
    return;
  }

  if (send) {
    const outcome = card.dataset.outcome;
    const meeting = staff.meetings.find((entry) => entry.id === card.dataset.meetingId);
    const { composer, box, status } = meetingCardComposer(card);
    if (!meeting || !outcome || !box) return;

    (async () => {
      const original = send.innerHTML;
      send.disabled = true;
      send.textContent = "Sending…";
      if (status) setStatus(status, "Sending the email and saving the decision…");

      try {
        const data = await staffFetch(`/api/staff/meetings/${encodeURIComponent(meeting.id)}/respond`, {
          method: "POST",
          body: JSON.stringify({ outcome, note: box.value.trim() })
        });
        staffApplyMeetings(data);
        announce(
          `${meeting.id} ${outcome}. ${data.emailed === false ? "Email is switched off in this demo — the decision is saved." : "The client has been emailed."}`
        );
      } catch (error) {
        if (status) setStatus(status, error.message, "error");
        send.disabled = false;
        send.innerHTML = original;
      }
    })();
  }
});

function staffApplyMeetings(data) {
  staff.meetings = Array.isArray(data.meetings) ? data.meetings : [];
  staff.meetings.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
  renderMeetings();

  const counts = data.counts || {
    pending: staff.meetings.filter((m) => m.status === "pending").length,
    accepted: staff.meetings.filter((m) => m.status === "accepted").length,
    declined: staff.meetings.filter((m) => m.status === "declined").length
  };
  const countsElement = document.querySelector("#meeting-counts");
  if (countsElement) {
    countsElement.innerHTML = `
      <span class="count-chip"><strong>${counts.pending}</strong> pending</span>
      <span class="count-chip"><strong>${counts.accepted}</strong> accepted</span>
      <span class="count-chip"><strong>${counts.declined}</strong> declined</span>
    `;
  }
}

function renderTickets() {
  const list = document.querySelector("#ticket-list");
  const empty = document.querySelector("#desk-empty");
  if (!list) return;

  list.innerHTML = "";
  if (!staff.tickets.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const ticket of staff.tickets) {
    const card = document.createElement("article");
    card.className = `ticket ${ticket.status === "resolved" ? "is-resolved" : ""} ${
      ticket.status === "awaiting-visit" ? "is-awaiting" : ""
    }`;
    card.dataset.ticketId = ticket.id;

    const paymentChip = ticket.payment
      ? `<span class="badge ${ticket.paymentStatus === "paid" ? "badge-paid" : "badge-pending"}">${
          ticket.paymentStatus === "paid" ? "Paid" : "Receipt to verify"
        } · ${ticket.payment.amountLabel}</span>`
      : `<span class="badge badge-free">No fee</span>`;

    const outcomeChip =
      ticket.status === "awaiting-visit"
        ? `<span class="badge badge-visit">Asked to come in</span>`
        : "";

    const lastMessage = (ticket.messages || [])[ticket.messages ? ticket.messages.length - 1 : 0];
    const history = ticket.note || lastMessage
      ? `<p class="ticket-history">${
          ticket.status === "awaiting-visit"
            ? `Emailed ${relativeTime(ticket.summonedAt)} — asked to come to the Center`
            : ticket.status === "resolved"
              ? `Emailed ${relativeTime(ticket.resolvedAt)} — resolved`
              : ""
        }${ticket.note ? `${ticket.status === "open" ? "" : " · "}“${ticket.note}”` : ""}</p>`
      : "";

    const canRespond = ticket.status !== "resolved";

    card.innerHTML = `
      <header class="ticket-head">
        <div>
          <span class="ticket-id">${ticket.id}</span>
          <h3>${ticket.issue.label}</h3>
        </div>
        ${ticketStatusChip(ticket)}
      </header>
      <dl class="ticket-meta">
        <div><dt>Student</dt><dd>${ticket.student.fullName}</dd></div>
        <div><dt>Reg. number</dt><dd>${ticket.student.registrationNumber}</dd></div>
        <div><dt>Department</dt><dd>${ticket.student.department}</dd></div>
        <div><dt>Phone</dt><dd>${ticket.student.phone}</dd></div>
        <div><dt>Email</dt><dd>${ticket.student.email}</dd></div>
        <div><dt>Submitted</dt><dd>${relativeTime(ticket.createdAt)}</dd></div>
      </dl>
      <div class="ticket-badges">${paymentChip}${outcomeChip}</div>
      <p class="ticket-description">${ticket.description}</p>
      ${history}
      <footer class="ticket-foot">
        ${
          ticket.hasReceipt
            ? `<a class="chip" href="${ticket.receiptDataUrl || `/api/staff/receipts/${ticket.id}`}" target="_blank" rel="noopener">View receipt</a>`
            : ""
        }
        ${
          canRespond
            ? `${
                ticket.status === "awaiting-visit"
                  ? ""
                  : `<button class="button button-primary button-small" type="button" data-respond="${ticket.id}" data-outcome="resolved">Resolved — email student</button>`
              }
               ${
                 ticket.status === "awaiting-visit"
                   ? `<button class="button button-primary button-small" type="button" data-respond="${ticket.id}" data-outcome="resolved">They have come in — mark resolved</button>`
                   : `<button class="button button-secondary button-small" type="button" data-respond="${ticket.id}" data-outcome="visit">Ask to come in</button>`
               }`
            : `<span class="ticket-note">Closed. The student was emailed.</span>`
        }
      </footer>
      <form class="ticket-respond" data-respond-form="${ticket.id}" hidden>
        <p class="ticket-respond-title"></p>
        <label>Message to the student <span class="optional">(optional)</span>
          <textarea name="note" rows="3" maxlength="800" placeholder="Anything they should know — it is included in the email."></textarea>
        </label>
        <label data-when-field hidden>When should they come?
          <input name="visitWhen" maxlength="120" placeholder="e.g. Tomorrow, 10:00 a.m. — Portal Unit desk">
        </label>
        <div class="ticket-respond-actions">
          <button class="button button-primary button-small" type="submit">Send email</button>
          <button class="chip" type="button" data-cancel-respond>Cancel</button>
        </div>
        <p class="ticket-respond-status form-status" role="status" aria-live="polite"></p>
      </form>
    `;
    list.appendChild(card);
  }
}

/*
 * Two outcomes, each sends one email to the student:
 *   resolved — "your issue is fixed"
 *   visit    — "please come to the ICT Center", optionally with a time
 */
document.querySelector("#ticket-list")?.addEventListener("click", async (event) => {
  const opener = event.target.closest("[data-respond]");
  const cancel = event.target.closest("[data-cancel-respond]");

  if (cancel) {
    const form = cancel.closest("[data-respond-form]");
    if (form) {
      form.hidden = true;
      form.querySelector(".ticket-respond-status").textContent = "";
    }
    return;
  }

  if (!opener) return;

  const card = opener.closest(".ticket");
  const form = card?.querySelector("[data-respond-form]");
  if (!form) return;

  const outcome = opener.dataset.outcome;
  form.dataset.outcome = outcome;
  form.hidden = false;
  form.querySelector(".ticket-respond-title").textContent =
    outcome === "resolved"
      ? "Tell the student it is fixed — they receive this by email."
      : "Ask the student to come to the ICT Center — they receive this by email.";
  form.querySelector("[data-when-field]").hidden = outcome !== "visit";
  form.querySelector(".ticket-respond-status").textContent = "";
  form.querySelector("textarea").focus();
});

document.querySelector("#ticket-list")?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-respond-form]");
  if (!form) return;
  event.preventDefault();

  const ticketId = form.dataset.respondForm;
  const outcome = form.dataset.outcome;
  const note = form.elements.note.value.trim();
  const visitWhen = form.elements.visitWhen.value.trim();
  const status = form.querySelector(".ticket-respond-status");
  const submit = form.querySelector('button[type="submit"]');

  submit.disabled = true;
  submit.textContent = "Sending email…";

  try {
    const result = await staffFetch(`/api/staff/tickets/${ticketId}/respond`, {
      method: "POST",
      body: JSON.stringify({ outcome, note, visitWhen })
    });

    const index = staff.tickets.findIndex((ticket) => ticket.id === ticketId);
    if (index >= 0) staff.tickets[index] = result.ticket;
    staffApplyTickets({ tickets: staff.tickets });

    announce(
      demoMode
        ? `Ticket ${ticketId}: ${outcome === "resolved" ? "marked resolved" : "student asked to come in"}. (Demo mode: in the live system ${result.emailed} is emailed now.)`
        : `Ticket ${ticketId}: ${outcome === "resolved" ? "marked resolved" : "student asked to come in"}. Email sent to ${result.emailed}.`
    );
  } catch (error) {
    submit.disabled = false;
    submit.textContent = "Send email";
    setStatus(status, error.message, "error");
    staffFetch("/api/staff/tickets").then(staffApplyTickets).catch(() => {});
  }
});

function announce(message, state = "") {
  const live = document.querySelector("#live-text");
  if (!live) return;
  live.textContent = message;
  live.className = state ? `is-${state}` : "";
}

let innovationPoll = null;

async function staffConnect() {
  staffCloseStream();
  if (innovationPoll) {
    clearInterval(innovationPoll);
    innovationPoll = null;
  }

  const live = document.querySelector("#live-status");
  const meetingLive = document.querySelector("#meeting-live-status");
  const meetingLiveText = document.querySelector("#meeting-live-text");

  if (staff.signedInDesk === "innovation") {
    const setLive = (state, text) => {
      if (meetingLive) meetingLive.dataset.state = state;
      if (meetingLiveText) meetingLiveText.textContent = text;
    };

    if (demoMode) {
      setLive("live", "Demo mode — bookings you make appear here.");
      return;
    }

    setLive("connecting", "Connecting…");

    // Refetch is cheap and keeps the desk correct across restarts and dropped streams.
    const refresh = async () => {
      try {
        await staffLoadMeetings();
        setLive("live", "Live — listening for new bookings");
      } catch {
        setLive("offline", "Reconnecting…");
      }
    };

    try {
      const source = new EventSource(await apiUrl("/api/staff/stream"), { withCredentials: true });
      staff.source = source;
      source.addEventListener("ready", () => setLive("live", "Live — listening for new bookings"));
      source.addEventListener("meeting", () => {
        refresh();
      });
      source.onerror = () => setLive("offline", "Reconnecting…");
    } catch {
      /* polling below still keeps the desk fresh */
    }

    innovationPoll = setInterval(refresh, 20_000);
    return;
  }

  if (live) live.dataset.state = "connecting";
  announce("Connecting…");

  if (demoMode) {
    if (live) live.dataset.state = "live";
    announce("Demo mode — new requests appear here as you submit them.");
    return;
  }

  const source = new EventSource(await apiUrl("/api/staff/stream"), { withCredentials: true });
  staff.source = source;

  source.addEventListener("ready", () => {
    if (live) live.dataset.state = "live";
    announce("Live — listening for new requests");
  });

  source.addEventListener("ticket", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === "created") {
      staff.tickets = [payload.ticket, ...staff.tickets];
      staffApplyTickets({ tickets: staff.tickets });
      notifyDesktop(payload.ticket);
      announce(`New request: ${payload.ticket.issue.label} — ${payload.ticket.student.fullName}`);
    } else if (payload.type === "resolved") {
      const index = staff.tickets.findIndex((ticket) => ticket.id === payload.ticket.id);
      if (index >= 0) staff.tickets[index] = payload.ticket;
      staffApplyTickets({ tickets: staff.tickets });
    }
  });

  source.onerror = () => {
    if (live) live.dataset.state = "offline";
    announce("Reconnecting…");
  };
}

function notifyDesktop(ticket) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(`Portal request — ${ticket.issue.label}`, {
      body: `${ticket.student.fullName} · ${ticket.student.registrationNumber}\n${ticket.issue.feeLabel} · ${ticket.student.department}`,
      tag: ticket.id
    });
    notification.onclick = () => window.focus();
  } catch {
    /* notifications are best-effort */
  }
}

const notifyToggle = document.querySelector("#notify-toggle");
if (notifyToggle) {
  notifyToggle.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      announce("This browser doesn’t support desktop alerts.");
      return;
    }
    if (Notification.permission === "granted") {
      announce("Desktop alerts are already on.");
      notifyToggle.setAttribute("aria-pressed", "true");
      return;
    }
    const permission = await Notification.requestPermission();
    notifyToggle.setAttribute("aria-pressed", String(permission === "granted"));
    notifyToggle.textContent = permission === "granted" ? "Desktop alerts on" : "Desktop alerts blocked";
    announce(permission === "granted" ? "Desktop alerts enabled." : "Desktop alerts were blocked in the browser.");
  });
}

document.querySelector("#desk-refresh")?.addEventListener("click", () => staffEnter());
document.querySelector("#meeting-refresh")?.addEventListener("click", () => staffEnter());
document.querySelector("#desk-signout")?.addEventListener("click", signOut);
document.querySelector("#meeting-signout")?.addEventListener("click", signOut);

async function signOut() {
  try {
    await apiFetch("/api/staff/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  staffSignedOut();
  applyDeskTab(staff.desk);
  announce("Signed out.");
}

const staffLoginForm = document.querySelector("#staff-login-form");
if (staffLoginForm) {
  staffLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!staffLoginForm.reportValidity()) return;

    const status = staffLoginForm.querySelector(".form-status");
    const button = staffLoginForm.querySelector('button[type="submit"]');
    const code = new FormData(staffLoginForm).get("code");
    const originalLabel = button.innerHTML;

    button.disabled = true;
    button.textContent = "Checking…";
    setStatus(status, "");

    try {
      const session = await staffFetch("/api/staff/session", {
        method: "POST",
        body: JSON.stringify({ code }),
        skipAuthRedirect: true
      });
      staffLoginForm.reset();
      if (session && session.desk) staff.desk = session.desk;
      await staffEnter();
    } catch (error) {
      setStatus(status, error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });
}

/* Boot */
showPage(currentPage(), { push: false, focusHeading: false });
