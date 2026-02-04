# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `components/` - React components (search-form, provider-card, map-view, fund-indicator)
- `components/ui/` - shadcn/ui base components
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

## Environment Variables

Required in `.env.local` (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase API endpoint
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous key for client
- `SUPABASE_SERVICE_ROLE_KEY` - Admin key for sync scripts
- `SYNC_SECRET_KEY` - Protect sync endpoints
