import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client with service role (for data sync operations)
export function createServerClient() {
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Database table names
export const TABLES = {
  COUNTIES: 'counties',
  PROVIDERS: 'providers',
  SPECIALTIES: 'specialties',
  PROVIDER_SPECIALTIES: 'provider_specialties',
  FUND_ALLOCATIONS: 'fund_allocations',
  USER_REPORTS: 'user_reports',
  HISTORICAL_FUND_DATA: 'historical_fund_data',
  PROVIDER_CONSUMPTION_PATTERNS: 'provider_consumption_patterns',
} as const;
