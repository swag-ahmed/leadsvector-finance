/******************************************************************************
 * LeadsVector Finance Dashboard — Code.gs
 * Apps Script backend: login, sessions, finance data, team pay calculations
 ******************************************************************************/

// ─────────────────────────────────────────────────────────────────────────────
// SPREADSHEET — auto-detects whichever sheet this script is bound to
// ─────────────────────────────────────────────────────────────────────────────
const SPREADSHEET_ID    = SpreadsheetApp.getActiveSpreadsheet().getId();
const CACHE_TTL_SECONDS = 300; // 5 minutes server-side cache

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 EDITABLE RATES  ←  Change any number here, everything recalculates
// ─────────────────────────────────────────────────────────────────────────────
const RATES = {
  devHourly:       6.50,  // Arif, Chompa, Rion, Shahinur  (USD / hr)
  shohagHourly:   16.00,  // Shohag own hours rate         (USD / hr)
  leadsVectorRate: 20.00, // LeadsVector billing rate       (USD / hr)
  johnnyPortion:   0.20,  // Johnny Nel share               (20 %)
  bdtRate:        121.5   // USD → BDT conversion rate
};
// ─────────────────────────────────────────────────────────────────────────────


/* ═══════════════════════════════════════════════════════════════════
   WEB ENTRY
═══════════════════════════════════════════════════════════════════ */
function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("LeadsVector Finance Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/* ═══════════════════════════════════════════════════════════════════
   SESSION  (6-hour TTL, UUID token stored in script cache)
═══════════════════════════════════════════════════════════════════ */
function createSession_(userObj) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    "sess_" + token, JSON.stringify(userObj), 60 * 60 * 6
  );
  return token;
}

function getSession_(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get("sess_" + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function clearSession_(token) {
  if (token) CacheService.getScriptCache().remove("sess_" + token);
}


/* ═══════════════════════════════════════════════════════════════════
   LOGIN / LOGOUT
═══════════════════════════════════════════════════════════════════ */
function login(username, password) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName("USER ACCESS");
  if (!sh) return { ok: false, message: "USER ACCESS sheet not found." };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok: false, message: "No users found in USER ACCESS." };

  const data = sh.getRange(1, 1, lastRow, lastCol).getValues();

  for (let i = 1; i < data.length; i++) {
    const row        = data[i];
    const name       = String(row[0] || "").trim();
    const dbUser     = String(row[1] || "").trim();
    const dbPass     = String(row[2] || "").trim();
    const role       = String(row[3] || "").trim().toUpperCase();
    const sheetName  = String(row[4] || "").trim();

    if (dbUser  === String(username || "").trim() &&
        dbPass  === String(password || "").trim()) {
      const user  = { name, username: dbUser, role, sheetName };
      const token = createSession_(user);
      return {
        ok: true, token,
        email: dbUser,
        user: {
          role,
          label: role === "ADMIN" ? name + " (ADMIN)" : name
        }
      };
    }
  }
  return { ok: false, message: "Invalid username or password." };
}

function logout(token) {
  clearSession_(token);
  return { ok: true };
}


/* ═══════════════════════════════════════════════════════════════════
   ADMIN VIEW DEFINITIONS
═══════════════════════════════════════════════════════════════════ */
const ADMIN_VIEWS = [
  { key: "ARIF",     label: "DEV 1 — Arif Track",     sheetName: "DEV 1 ARIF TRACK"     },
  { key: "CHOMPA",   label: "DEV 2 — Chompa Track",   sheetName: "DEV 2 CHOMPA TRACK"   },
  { key: "RION",     label: "DEV 3 — Rion Track",     sheetName: "DEV 3 RION TRACK"     },
  { key: "SHAHINUR", label: "DEV 4 — Shahinur Track", sheetName: "DEV 4 SHAHINUR TRACK" },
  { key: "CEO",      label: "CEO — Shohag Income",    sheetName: "CEO SHOHAG INCOME"    },
  { key: "REV",      label: "LeadsVector Revenue",    sheetName: "LeadsVector Revenue"  }
];


/* ═══════════════════════════════════════════════════════════════════
   GET VIEWS LIST  (called right after login)
═══════════════════════════════════════════════════════════════════ */
function getMyViews(token) {
  const u = getSession_(token);
  if (!u) return { ok: false, message: "NOT_LOGGED_IN" };

  if (u.role === "ADMIN") {
    return {
      ok: true, email: u.username,
      user:  { role: "ADMIN", label: u.name + " (ADMIN)" },
      views: ADMIN_VIEWS
    };
  }
  return {
    ok: true, email: u.username,
    user:  { role: "DEV", label: u.name },
    views: [{ key: "DEFAULT", label: u.sheetName, sheetName: u.sheetName }]
  };
}


/* ═══════════════════════════════════════════════════════════════════
   FINANCE DASHBOARD DATA
═══════════════════════════════════════════════════════════════════ */
function getDashboardDataForView(token, viewKey) {
  const u = getSession_(token);
  if (!u) return { ok: false, message: "NOT_LOGGED_IN" };

  const selected = (u.role === "ADMIN")
    ? (ADMIN_VIEWS.find(v => v.key === viewKey) || ADMIN_VIEWS[0])
    : { key: "DEFAULT", label: u.sheetName, sheetName: u.sheetName };

  const userLabel = u.role === "ADMIN"
    ? { role: "ADMIN", label: u.name + " (ADMIN)" }
    : { role: "DEV",   label: u.name };

  return buildFinanceDashboard_(u.username, userLabel, selected);
}

function buildFinanceDashboard_(email, user, view) {
  // Check server-side cache first
  const cacheKey = "fin_" + view.sheetName.replace(/\W/g, "_");
  const cached   = CacheService.getScriptCache().get(cacheKey);
  if (cached) {
    try {
      const p = JSON.parse(cached);
      p.email = email; p.user = user; p.view = view;
      return p;
    } catch (e) {}
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(view.sheetName);
  if (!sh) return { ok: false, message: "Sheet not found: " + view.sheetName };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) {
    return { ok: true, email, user, view, kpis: emptyKpis_(), monthly: [], rows: [] };
  }

  const values  = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const tz      = ss.getSpreadsheetTimeZone();
  const headers = values[0].map(h => String(h || "").trim().toUpperCase());
  const dataRows = values.slice(1);

  const idx = h => headers.indexOf(h);
  const iProject = idx("PROJECT TITLE");
  const iClient  = idx("CLIENT NAME");
  const iPayDate = idx("PAYMENT DATE");
  const iStatus  = idx("PAYMENT STATUS");

  // Income column sits immediately after PAYMENT DATE
  const iIncome = (iPayDate >= 0 && iPayDate + 1 < headers.length)
    ? iPayDate + 1 : -1;
  if (iIncome === -1) {
    return { ok: false, message: "INCOME column not found (expected after PAYMENT DATE)." };
  }

  const parsed = [];
  for (const r of dataRows) {
    const income = toNum_(r[iIncome]);
    if (!income) continue;
    const dt    = iPayDate >= 0 ? toDate_(r[iPayDate]) : null;
    const isPaid = iStatus >= 0
      ? String(r[iStatus] || "").toUpperCase().trim() === "PAID"
      : false;
    parsed.push({
      projectTitle:   iProject >= 0 ? String(r[iProject] || "") : "",
      clientName:     iClient  >= 0 ? String(r[iClient]  || "") : "",
      paymentDateISO: dt ? dt.toISOString() : "",
      paymentDateText: dt ? Utilities.formatDate(dt, tz, "MMM d, yyyy") : "",
      paymentStatus:  isPaid ? "PAID" : "UNPAID",
      income
    });
  }

  const now          = new Date();
  const thisYear     = now.getFullYear();
  const thisMonthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  let total = 0, yearTotal = 0, monthTotal = 0, pendingAmt = 0, pendingCount = 0;
  const monthMap = new Map();

  for (const item of parsed) {
    total += item.income;
    if (item.paymentDateISO) {
      const d   = new Date(item.paymentDateISO);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      monthMap.set(key, (monthMap.get(key) || 0) + item.income);
      if (d.getFullYear() === thisYear) yearTotal += item.income;
      if (key === thisMonthKey) monthTotal += item.income;
    }
    if (item.paymentStatus !== "PAID") { pendingAmt += item.income; pendingCount++; }
  }

  // Build last-12-months array
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    monthly.push({
      key,
      label:  Utilities.formatDate(d, tz, "MMM yyyy"),
      income: r2_(monthMap.get(key) || 0)
    });
  }

  parsed.sort((a, b) => (b.paymentDateISO || "").localeCompare(a.paymentDateISO || ""));

  const result = {
    ok: true, email, user, view,
    kpis: {
      total:        r2_(total),
      thisYear:     r2_(yearTotal),
      thisMonth:    r2_(monthTotal),
      pendingAmt:   r2_(pendingAmt),
      pendingCount
    },
    monthly,
    rows: parsed.slice(0, 300)
  };

  // Cache without user-specific fields
  try {
    const toCache = Object.assign({}, result, { email: null, user: null, view: null });
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(toCache), CACHE_TTL_SECONDS);
  } catch (e) {}

  return result;
}


/* ═══════════════════════════════════════════════════════════════════
   TEAM PAY DATA
═══════════════════════════════════════════════════════════════════ */
function getTeamPayData(token, viewKey) {
  const u = getSession_(token);
  if (!u) return { ok: false, message: "NOT_LOGGED_IN" };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName("TEAM NSVLLC TIME REPORT");
  if (!sh) return { ok: false, message: "Sheet 'TEAM NSVLLC TIME REPORT' not found." };

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: false, message: "No data in TEAM NSVLLC TIME REPORT." };

  const values  = sh.getRange(1, 1, lastRow, 7).getValues();
  const headers = values[0].map(h => String(h || "").trim());
  const col     = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

  const iPeriod   = col("Monthly Period");
  const iTotal    = col("Total Hours");
  const iRion     = col("Rion");
  const iShahinur = col("Shahinur");
  const iShohag   = col("Shohag");
  const iArif     = col("Arif");
  const iChompa   = col("Chompa");

  // Validate columns exist
  if ([iPeriod, iTotal, iRion, iShahinur, iShohag, iArif, iChompa].includes(-1)) {
    return { ok: false, message: "Missing column(s) in TEAM NSVLLC TIME REPORT. Expected: Monthly Period, Total Hours, Rion, Shahinur, Shohag, Arif, Chompa" };
  }

  const dataRows = values.slice(1)
    .filter(r => r[iPeriod] && String(r[iPeriod]).trim() !== "");

  // Most recent 4 rows → current period + 3 history
  const recent = dataRows.slice(-4).reverse();

  const buildPeriod = row => {
    const period   = String(row[iPeriod]  || "").trim();
    const total    = toNum_(row[iTotal]);
    const rion     = toNum_(row[iRion]);
    const shahinur = toNum_(row[iShahinur]);
    const shohag   = toNum_(row[iShohag]);
    const arif     = toNum_(row[iArif]);
    const chompa   = toNum_(row[iChompa]);
    const devTotal = rion + shahinur + arif + chompa;
    const R        = RATES;

    // Shohag = own hours × $16 + dev team hours × ($16−$6.50 = $9.50 margin)
    const shohagUsd    = r2_((shohag * R.shohagHourly) + (devTotal * (R.shohagHourly - R.devHourly)));
    const shohagSelfUsd = r2_(shohag * R.shohagHourly);
    const shohagFromOthers = r2_(devTotal * (R.shohagHourly - R.devHourly));

    const lvGross  = r2_(total  * R.leadsVectorRate);
    const lvJohnny = r2_(lvGross * R.johnnyPortion);
    const lvNet    = r2_(lvGross - lvJohnny);

    return {
      period,
      totalHrs: total,
      pay: {
        rion:     { hrs: rion,     usd: r2_(rion     * R.devHourly), bdt: r2_(rion     * R.devHourly * R.bdtRate) },
        shahinur: { hrs: shahinur, usd: r2_(shahinur * R.devHourly), bdt: r2_(shahinur * R.devHourly * R.bdtRate) },
        arif:     { hrs: arif,     usd: r2_(arif     * R.devHourly), bdt: r2_(arif     * R.devHourly * R.bdtRate) },
        chompa:   { hrs: chompa,   usd: r2_(chompa   * R.devHourly), bdt: r2_(chompa   * R.devHourly * R.bdtRate) },
        shohag: {
          hrs:          shohag,
          usd:          shohagUsd,
          bdt:          r2_(shohagUsd * R.bdtRate),
          selfUsd:      shohagSelfUsd,
          fromOthersUsd: shohagFromOthers
        },
        leadsVector: {
          hrs:       total,
          grossUsd:  lvGross,
          grossBdt:  r2_(lvGross  * R.bdtRate),
          johnnyUsd: lvJohnny,
          johnnyBdt: r2_(lvJohnny * R.bdtRate),
          netUsd:    lvNet,
          netBdt:    r2_(lvNet    * R.bdtRate)
        }
      }
    };
  };

  const periods = recent.map(buildPeriod);

  // Determine what persona this user sees
  const devSheetToKey = {
    "DEV 1 ARIF TRACK":     "arif",
    "DEV 2 CHOMPA TRACK":   "chompa",
    "DEV 3 RION TRACK":     "rion",
    "DEV 4 SHAHINUR TRACK": "shahinur"
  };
  const adminViewToKey = {
    ARIF: "arif", CHOMPA: "chompa", RION: "rion",
    SHAHINUR: "shahinur", CEO: "shohag", REV: "leadsVector"
  };

  const visibleAs = u.role === "DEV"
    ? (devSheetToKey[u.sheetName] || "arif")
    : (adminViewToKey[viewKey]    || "leadsVector");

  return {
    ok: true,
    rates:     RATES,
    visibleAs,
    isAdmin:   u.role === "ADMIN",
    current:   periods[0]    || null,
    history:   periods.slice(1)
  };
}


/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
function emptyKpis_() {
  return { total: 0, thisYear: 0, thisMonth: 0, pendingAmt: 0, pendingCount: 0 };
}

function toNum_(v) {
  if (v === null || v === "" || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function toDate_(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v;
  const d = new Date(String(v).trim());
  return isNaN(d) ? null : d;
}

function r2_(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
