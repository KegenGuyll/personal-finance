# Personal finance

Personal finance tracking: Plaid-synced accounts, manual transactions that count
before Plaid catches up, envelope budgets, and savings goals.

## Getting started

```bash
npm install
npm run models:fetch   # one-time: receipt-scanning OCR models (~25MB)
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the Plaid keys and MongoDB URI
first — nothing loads accounts without them.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests for the pure parser, layout and image maths |
| `npm run models:fetch` | Fetches and verifies the receipt OCR models into `public/receipt-ocr/` |

## Notes

- **Receipt scanning** reads a photographed receipt in the browser and pre-fills
  the manual-transaction form. Setup, accuracy expectations and the model
  upgrade path are in [`docs/receipt-scanning.md`](docs/receipt-scanning.md).
- **Manual transactions** are real rows in the same `transactions` collection,
  flagged `manual: true`, and are linked to the Plaid transaction they turn out
  to be once it syncs. Budgets, trends and goals count them with no special
  cases.
- **Backups** are encrypted MongoDB dumps to Google Drive; see
  [`backup/README.md`](backup/README.md).

Conventions for contributors — component rules, colour palette, comment
discipline — are in [`AGENTS.md`](AGENTS.md).
