<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Component Rules

All UI components that use Tailwind CSS for styling (e.g., buttons, inputs, cards, etc.) must be created as standalone, self-contained components in their own files under `src/components/`.

- **Loading states**: Always include a loading indicator (e.g., skeleton) for async data. Use the shared `LoadingSkeleton` component in `src/components/LoadingSkeleton.tsx` for transaction or list loading. Do not inline skeleton markup in pages.
- **Shared components**: If the same component structure appears in multiple pages (e.g., transaction lists), extract it into a reusable component under `src/components/` and share it via props rather than duplicating the markup.

# Color Palette

Use only the custom color tokens defined in `app/globals.css` under the `@theme` block: `space-indigo`, `ocean-deep`, `cornflower-blue`, `baby-blue-ice`, and `soft-periwinkle` (each with shades 50–950). Do not introduce arbitrary colors or Tailwind's default color palette.

# Verification Steps

Before considering a task complete, all of the following must pass with **no warnings or errors**:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

Any warning or linting error in the output is a failure and must be fixed.

# Response Rules

- **Do not code unless explicitly asked**: When the user asks a question (e.g., "how does X work," "why is Y happening," "explain Z"), only explain. Do not write code, make edits, or fix anything. This applies regardless of the current mode (plan or build). Only make code changes when the user explicitly asks you to fix an issue, implement a feature, or make a specific change. Words like "explain," "how," "why," and "what" are questions that require answers, not code.
- **Plan before building**: For complex features or changes, present the plan first and wait for confirmation before writing code.

# Application Context

This is a personal finance web application intended for a single user. However, since it is deployed on the internet, all security must be treated with the same rigor as a multi-tenant public application. Never expose secrets, API keys, or access tokens to the client. All sensitive operations must happen server-side.

# Tech Stack

- **Database**: MongoDB (use the native `mongodb` driver)
- **Server-side Plaid**: `plaid` Node.js SDK — all Plaid API calls happen in server-side API routes only
- **Client-side Plaid**: `react-plaid-link` for the Plaid Link UI
- **Data Fetching**: TanStack Query (`@tanstack/react-query`) for all client-side network requests
- **State Management**: Redux Toolkit (`@reduxjs/toolkit`) with `react-redux`

# Data Fetching Rules

All TanStack Query hooks (`useQuery`, `useInfiniteQuery`, `useMutation`) must be defined in their own dedicated files under `src/hooks/`. Each hook file should export a single hook function named after the resource it fetches (e.g., `usePlaidAccounts`, `useAccountTransactions`, `useTransaction`). Do not inline `useQuery` or other TanStack Query calls directly in components or pages.

# Shared Logic & Utilities

- **DRY server-side logic**: Duplicate logic (e.g., MongoDB aggregation pipelines) must be extracted into shared modules under `src/lib/` and imported where needed. Do not copy-paste pipeline definitions across API routes.
- **Chart colors**: All chart components (`SpendingTrend`, `CategoryBreakdown`, etc.) must use the shared `CHART_COLORS` array from `src/utils/chart-colors.ts` instead of hardcoded hex values. These colors map to the custom Tailwind theme palette.
- **Reusable hooks**: General-purpose hooks (e.g., `useDebounce`) must live in `src/hooks/` so they can be reused throughout the application.
