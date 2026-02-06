# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How to Work in This Codebase

### Workflow (follow this exact sequence for EVERY task)

1. **Explore** — Read ALL relevant files before touching anything. Use `cat`, `grep`, `find` to understand context, imports, and how the file connects to the rest of the codebase.
2. **Plan** — State your approach in 2-3 sentences BEFORE writing any code. Identify which files will be modified and why.
3. **Implement** — Write complete, production-ready code. No placeholders, no TODOs, no stubs.
4. **Validate** — Run `npm run build` and `npm run lint`. Fix ALL errors and warnings before delivering.
5. **Verify** — If the change is testable, prove it works. Start the dev server if needed.

### Rules

- **Read before writing.** Before modifying any file, read the ENTIRE file first. Understand its patterns, imports, conventions, and how it connects to other files.
- **Follow existing patterns exactly.** If similar functionality exists elsewhere in the codebase, mirror that approach. Consistency > personal preference.
- **Check exact library versions** in `package.json` before using any API. Don't guess at method signatures — look them up for the exact version installed.
- **Handle edge cases.** Null checks, empty arrays, error states, loading states, network failures — always handle them.
- **No scope creep.** Only change what was asked. Don't refactor, rename, or "improve" unrelated code.
- **Don't remove existing functionality** unless explicitly asked to do so.
- **Don't add dependencies** without first checking if an existing one already handles the need.
- **When unsure, ASK** rather than guess wrong and require multiple fix iterations.
- **No dead code.** Don't leave commented-out code blocks, unused imports, or unreachable logic.
- **Meaningful names.** Use descriptive variable and function names. No `temp`, `data`, `result`, `x` except in tiny lambdas.

### Common Mistakes to Avoid

- Always use the Supabase client from `lib/supabase.ts` — never import or instantiate Supabase directly.
- shadcn/ui components live in `components/ui/` — check what's already available (including `multi-select` and `searchable-select`) before creating new ones.
- Leaflet maps MUST be dynamically imported with `{ ssr: false }` — never import Leaflet at the top level.
- This project uses Next.js **App Router** (not Pages Router) — don't use `getServerSideProps`, `getStaticProps`, or `pages/` directory patterns.
- Client-side interactivity requires the `'use client'` directive at the top of the file.
- Search state is managed via URL parameters — don't introduce Redux, Zustand, or other state management libraries.
- Romanian text and labels are used throughout the UI — maintain Romanian language in user-facing strings.
- Arrays passed as props or dependencies MUST be memoized with `useMemo` to prevent infinite re-render loops (see map filters).
- Accessibility state is managed by `AccessibilityProvider` context — use the `useAccessibility()` hook, don't create parallel systems.
- The user location marker uses a custom `divIcon` with CSS animation — don't replace it with a standard Leaflet marker.

---

## Project Overview

FondCAS is a Next.js web application helping Romanian citizens find healthcare providers (clinics, labs, hospitals, pharmacies, recovery centers) that accept CNAS (National Health Insurance Fund) coverage and check real-time fund availability. It combines public data aggregation, geolocation services, and ML predictions to estimate fund status.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui components, Leaflet maps
- **Backend**: Next.js API Routes, Supabase (PostgreSQL)
- **Data Processing**: XLSX parsing, Nominatim geocoding, ML prediction engine

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run ESLint

# Data Sync Pipeline
npm run sync:download           # Download Excel files from CAS websites
npm run sync:download-historical # Download historical data
npm run sync:parse              # Parse provider and fund data (from data/current)
npm run sync:parse-historical   # Parse historical fund data
npm run sync:geocode            # Geocode provider addresses
npm run sync:upload             # Upload parsed data to Supabase
npm run sync:all                # Run full sync pipeline

# Full Data Pipeline (for manually downloaded CAS files in data/CAS)
npx tsx scripts/parse-all-cas-data.ts  # Parse ALL Excel files from data/CAS
npx tsx scripts/sync-to-db.ts          # Sync to Supabase with deduplication

# ML/Prediction
npm run ml:train                # Train consumption pattern model
npm run ml:full-pipeline        # Full ML pipeline (download + parse historical + train)
```

## Architecture

### Data Flow

1. **Sync Pipeline**: CAS websites → Excel files → Parsed JSON → Geocoded → Supabase
2. **ML Training**: Historical data → Consumption pattern analysis → Stored patterns
3. **Search Request**: Frontend → API → Supabase query + Fund prediction → Response
4. **User Reports**: Crowdsourced feedback → DB → Weighted in ML predictions

### Key Directories

- `app/` - Next.js App Router pages and API routes
- `app/api/` - REST endpoints (providers, funds, predict, reports, sync)
- `components/` - React components (search-form, provider-card, map-view, fund-indicator, accessibility-provider)
- `components/ui/` - shadcn/ui base components + custom (multi-select, searchable-select)
- `lib/` - Core utilities: types.ts (TypeScript interfaces), supabase.ts (client), fund-predictor.ts (ML engine)
- `scripts/` - Data sync pipeline scripts (download, parse, geocode, upload, train)
- `supabase/schema.sql` - Database schema definition

### Database Tables

- `counties` - 42 Romanian administrative regions
- `providers` - Healthcare provider registry with geolocation, includes:
  - `cui` - Company ID for definitive matching
  - `brand_name` - User-facing name (when different from legal name)
  - `provider_type` - clinic, paraclinic, hospital, recovery
- `specialties` / `provider_specialties` - Medical services mapping
- `fund_allocations` - Monthly budget data per provider
- `user_reports` - Crowdsourced fund status feedback
- `historical_fund_data` - Time series for ML training
- `provider_consumption_patterns` - Learned behavioral patterns

### Provider Matching System (scripts/sync-to-db.ts)

Multi-signal scoring system to deduplicate providers across data sources:
- **CUI match**: 1000 points (definitive)
- **Business email domain**: 100 points (excludes gmail.com, yahoo.com, etc.)
- **Phone match**: 50 points
- **Address match**: 50 points (normalized Romanian addresses)
- **Name similarity**: 30-50 points (Levenshtein distance)

Threshold: 80 points required for match. Special handling:
- Same name with different business emails = different company/location
- Brand name detection from email domains (e.g., ghenceamedicalcenter.ro → "Ghencea Medical Center")

### Prediction Engine (lib/fund-predictor.ts)

The `FundAvailabilityPredictor` class estimates fund status using:
- Historical consumption pattern analysis
- Seasonal adjustment (monthly variations)
- Day-of-month effects (funds deplete over time)
- Provider size and specialty weighting
- Recent user report integration
- Confidence scoring (0-100%)

## Patterns

- **App Router**: Uses Next.js App Router (not Pages Router)
- **Client Components**: Interactive features use `'use client'` directive
- **Dynamic Imports**: Leaflet maps use dynamic import with SSR disabled
- **URL State**: Search parameters used for routing state (no Redux)
- **Mobile-first**: Bottom navigation, responsive design
- **shadcn/ui**: Components are copied into project (not NPM installed)
- **Scroll Position Preservation**: Search page saves scroll position to sessionStorage, restored on back navigation
- **Geolocation Search**: "Caută lângă mine" button triggers browser geolocation API, passes lat/lng to search API
- **Provider Detail Map**: Each provider page shows a map with the clinic location (if geocoded)

## Accessibility Features

The app includes accessibility features for elderly users and those with visual impairments:

### Components

- **`components/accessibility-provider.tsx`** - React Context provider with:
  - `AccessibilityProvider` - Wraps app, manages font size and contrast state
  - `AccessibilityControls` - Floating button (bottom-right) with controls panel
  - `useAccessibility()` - Hook to access/modify settings

### Font Size Scaling
- Three levels: `normal` (100%), `large` (118%), `xlarge` (135%)
- Applied to `document.documentElement.style.fontSize`
- Persisted to localStorage (`a11y-font-size`)

### High Contrast Mode
- Toggle adds `.high-contrast` class to `<html>`
- CSS in `globals.css` overrides colors for maximum contrast
- Pure white backgrounds, black text/borders, 2px thick borders
- Persisted to localStorage (`a11y-contrast`)

## Environment Variables

Required in `.env.local` (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase API endpoint
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous key for client
- `SUPABASE_SERVICE_ROLE_KEY` - Admin key for sync scripts
- `SYNC_SECRET_KEY` - Protect sync endpoints
