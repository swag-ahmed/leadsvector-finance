# LeadsVector Finance Dashboard

> **A Google Apps Script + Google Sheets powered financial intelligence system.**  
> Track revenue, monitor payments, calculate team earnings, and visualize performance — all inside a Google Sheet.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Caching](#-caching)
- [Tech Stack](#-tech-stack)

---

## 🌟 Overview

**LeadsVector Finance Dashboard** transforms a Google Sheet into a fully functional financial management portal — no external database, no paid SaaS tools. It runs entirely on **Google Apps Script** with a custom HTML/CSS/JS frontend, served directly through a Web App URL.

```
┌─────────────────────────────────────────────────┐
│             LeadsVector Finance Dashboard        │
│                                                 │
│   Login Screen → Role Check → Personalized View │
│                                                 │
│  ┌──────────────┐     ┌──────────────────────┐  │
│  │  Finance KPIs │     │   Team Pay Module    │  │
│  │  + Chart      │     │   Hours + Earnings   │  │
│  │  + Table      │     │   + History          │  │
│  └──────────────┘     └──────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 🧱 Architecture

```
Google Sheets (Database Layer)
        │
        ▼
Apps Script — Code.gs (Backend)
  ├── Authentication (session tokens)
  ├── Finance data processor
  └── Team pay calculator
        │
        ▼
Index.html (Frontend)
  ├── Login UI
  ├── Finance Dashboard (KPIs + Chart + Table)
  └── Team Pay Section (Cards + History)
        │
        ▼
Chart.js (Data Visualization)
```

**The entire system is self-contained inside a single Google Spreadsheet** — no external hosting needed.

---

## ✨ Features

### 🔐 Authentication
- Username / password login backed by a Google Sheet
- Session tokens (UUID-based) stored in Apps Script Cache
- Sessions auto-expire after **6 hours**
- No passwords are stored in frontend code

### 👥 Role-Based Access Control
| Role | What They See |
|------|--------------|
| **ADMIN** | All team views — can switch between any member's dashboard via dropdown |
| **DEV** | Only their own earnings and hours |

### 📊 Finance Dashboard
- **This Month** — income in the current calendar month
- **This Year** — year-to-date total
- **Total Revenue** — all-time income sum
- **Pending Amount** — total of unpaid jobs, with count
- **12-Month Trend Chart** — interactive line chart (last 12 months)
- **Transaction Table** — full list with project, client, date, status, income

### 👨‍💻 Team Pay Module
- Current period card showing hours worked and earnings in **USD + BDT**
- CEO/founder view includes self-earnings + margin from team
- LeadsVector company-wide revenue view with gross, partner deduction, and net
- Collapsible **Past 3 Periods** history section
- All amounts shown in both USD and BDT

### ⚡ Performance
- Server-side cache (5 minutes) reduces Sheets API calls
- Client-side cache (5 minutes) avoids redundant network requests
- Finance and Pay data load in **parallel**

## 🗄 Caching

The system uses a two-layer cache strategy:

```
Request
  │
  ▼
Client Cache (in-browser JS, 5 min)
  │ miss
  ▼
Apps Script Cache (server-side, 5 min)
  │ miss
  ▼
Google Sheets API (live data read)
```

This means **repeated loads are near-instant** and Sheets API quota is preserved.

> Cache is keyed by sheet name. Finance and Pay data are cached independently.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Database | Google Sheets |
| Backend | Google Apps Script (V8 runtime) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Charts | [Chart.js v4.4.1](https://www.chartjs.org/) |
| Auth | Apps Script CacheService (UUID sessions) |
| Hosting | Google Apps Script Web App |

**Zero external dependencies** beyond Chart.js (loaded from CDN). No Node.js, no build step, no deployment pipeline.

---

## 📱 Mobile Support

The dashboard is fully responsive:

- **Desktop** — 4-column KPI grid, full table
- **Tablet (≤ 900px)** — 2-column KPI grid
- **Phone (≤ 600px)** — single column layout, touch-friendly inputs, larger tap targets
- **Small phones (≤ 380px)** — further scaled down font sizes

iOS Safari zoom-on-focus is prevented by using `font-size: 16px` on all inputs.

---

## 📄 License

Internal tool — for use within LeadsVector Ltd. Not licensed for redistribution.

---

<p align="center">
  Built with 💜 by <strong>LeadsVector Ltd</strong> · <em>Google Apps Script + Sheets</em>
</p>
