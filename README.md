# Pharmly — Pharmacy Management System

A full-stack pharmacy management system: **NestJS + PostgreSQL + TypeORM** REST API with a **vanilla-JS SPA** frontend. Covers inventory (batch-level tracking), point of sale with FEFO stock consumption, suppliers, purchase orders, and analytics.

## Quick start

### 1. Start PostgreSQL

```bash
docker compose up -d        # starts pharmly-postgres on :5432
```

### 2. Configure the API

```bash
cd backend
cp .env.example .env        # defaults match docker-compose (postgres/postgres/pharmly)
npm install
```

### 3. Create schema + seed demo data

```bash
npm run seed
```

The seeder is idempotent (every insert is guarded by an existence check) and synchronizes missing tables first.

### 4. Run

```bash
npm run start:dev           # API on http://localhost:3000/api/v1 (Swagger at /api/v1/docs)
```

**That's it — open http://localhost:3000.** The NestJS API serves the SPA from its own origin, so there is no CORS setup and nothing else to run.

<details>
<summary>Alternative: serve the frontend separately (e.g. for frontend-only work)</summary>

```bash
cd ../frontend
python3 -m http.server 5500   # open http://localhost:5500
```

This works too — the API client resolves the backend to `http://localhost:3000` automatically and `CORS_ORIGINS` in `backend/.env` already includes `http://localhost:5500`. To point the SPA at any other backend, run `localStorage.setItem('pharmly_api_base', 'https://api.example.com/api/v1')` once in the browser console, or set `window.PHARMLY_API_BASE` in `frontend/index.html`.

</details>

### Demo accounts

| Email                    | Password      | Role       | Access                        |
| ------------------------ | ------------- | ---------- | ----------------------------- |
| `admin@pharmly.io`       | `Admin@123`   | admin      | Full access                   |
| `pharmacist@pharmly.io`  | `Pharma@123`  | pharmacist | Inventory, batches, purchases |
| `cashier@pharmly.io`     | `Cashier@123` | cashier    | Point of sale, read-only      |

> The frontend origin must be listed in `CORS_ORIGINS` in `backend/.env` (`http://localhost:5500` by default).

## Scripts (backend)

| Command            | Purpose                          |
| ------------------ | -------------------------------- |
| `npm run start:dev` | Watch-mode dev server           |
| `npm run build`     | Compile to `dist/`              |
| `npm run seed`      | Idempotent database seeder      |
| `npm run typecheck` | `tsc --noEmit`                  |
| `npm test`          | Jest test suite                 |

## Architecture

```
backend/
  src/
    common/        # guards, decorators, filters, numeric transformer
    config/        # typed configuration
    database/      # data-source, seeder
    modules/
      entities/    # TypeORM entities (User, Medicine, Batch, Sale, ...)
      auth/        # JWT login/refresh, change-password
      medicines/   # catalog + live stock aggregation (TOTAL_STOCK_SUBQUERY)
      batches/     # batch CRUD, expiry tracking
      sales/       # POS transactions, FEFO stock consumption, analytics
      purchases/   # purchase orders + goods receipt
      suppliers/   # supplier management
      categories/  # category management
      users/       # staff accounts
      dashboard/   # overview KPIs, alerts, global search
frontend/
  index.html       # SPA shell
  js/              # api client, auth, hash router, 10 view modules
  css/style.css
```

Key domain rules:

- **Stock lives on batches**, not on medicines — each delivery tracks expiry, cost and supplier.
- **POS consumes FEFO** (first-expiry-first-out) across batches, in a transaction.
- **Live stock** is computed via a correlated sub-select (`stock.util.ts`) so inventory, POS and dashboard always agree.
- Money is stored as `numeric(12,2)` with a transformer, never floats.

---

## Feature status & team handoff

All core flows are implemented **and verified end-to-end against a running API + seeded database** (login, dashboard, POS checkout with FEFO, receipts, purchase-order lifecycle incl. partial receiving, batch adjust/write-off, RBAC 401/403 paths, DTO validation). The table below is the working map for the team:

| Module | Status | Notes for the team |
| --- | --- | --- |
| Auth (login, JWT refresh, RBAC) | ✅ Working | Access token auto-refreshes on 401; "Keep me signed in" persists to localStorage |
| Dashboard KPIs / alerts / trend | ✅ Working | One call: `GET /dashboard/overview` |
| Medicines CRUD + search | ✅ Working | Create/edit DTOs validated server-side; discontinue is a soft delete |
| Batches (intake, adjust, write-off) | ✅ Working | Adjustments are signed deltas; write-off zeroes a batch |
| POS (search, barcode, cart, checkout) | ✅ Working | Barcode field: exact SKU/barcode + Enter; quantity capped at live stock; printable receipt after checkout |
| Sales history, refund, receipt reprint | ✅ Working | Refund restores stock to original batches (admin/pharmacist only) |
| Suppliers / categories CRUD | ✅ Working | Suppliers deactivate (soft), categories hard-delete |
| Purchase orders (draft → ordered → receive) | ✅ Working | Partial receiving supported; each received line creates a batch |
| Users administration | ✅ Working | Last-admin guard; self-deactivation blocked |

### Known limitations (good first issues for the team)

- **No unit tests yet.** The Jest harness is configured (`npm test`) but there are no spec files. Start with `sales.service.spec.ts` (FEFO consumption) and `purchases.service.spec.ts` (partial receiving).
- **Receipt logo / pharmacy details are placeholder text** in `frontend/js/views/pos.js` (`receiptHtml`/print template) — swap in real branding.
- **The dashboard revenue chart is a plain CSS bar chart.** Consider Chart.js if richer visuals are needed.
- **Sales analytics filters (date range, cashier)** exist on the API (`SaleQueryDto`) but the UI only exposes search/status/payment — add date pickers on the Sales page.
- **No stock-movement audit table.** `StockMovementType` enum exists in `backend/src/common/enums.ts` but movements are not recorded; useful for traceability/recalls.
- **JWTs are stateless** — there is no server-side revocation. If a token leaks it is valid until expiry.
- **`DB_SYNCHRONIZE=true` by default** for development convenience. Before production, generate and run migrations instead (`typeorm migration:generate`) and set it to `false`.

### Frontend conventions (for new views)

1. Each view is a plain object with `load()` (fetch data), `render()` (return HTML string), and optional `mount()` (bind events after render). Register it in `App.routes` (`frontend/js/app.js`) and add a `<script>` tag in `frontend/index.html`.
2. Always go through `API.get/post/patch/del` — they unwrap the `{ success, data }` envelope, attach the bearer token, and auto-refresh on 401. `API.qs({...})` builds query strings, `API.list(res)` normalizes paginated vs array responses.
3. Escape any server/user text with `esc()` before interpolating into HTML; format with `fmtCurrency` / `fmtDate` / `fmtDateTime`.
4. Use `App.refresh()` to re-render the current view after a mutation; `App.showModal` / `confirmDialog` for dialogs; `toast()` for feedback.
5. Check roles with `Auth.can('admin', 'pharmacist')` for UI hints — the backend enforces the real policy, so never trust the client alone.
