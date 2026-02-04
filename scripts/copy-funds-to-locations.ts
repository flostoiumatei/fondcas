/**
 * Copy fund allocations to all locations of the same company
 *
 * Fund allocations in CAS files are company-wide, but we now have
 * separate records for each location. This script copies allocations
 * to all locations of companies that have multiple locations.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Normalize company name for matching
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^sc\s+/i, '')
    .replace(/\s+s\.?r\.?l\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('=== Copying Fund Allocations to All Locations ===\n');

  // Get all providers
  const { data: providers } = await supabase
    .from('providers')
    .select('id, name');

  // Group by normalized company name
  const companyGroups = new Map<string, Array<{ id: string; name: string }>>();

  for (const p of providers || []) {
    const normalized = normalizeCompanyName(p.name);
    if (!companyGroups.has(normalized)) {
      companyGroups.set(normalized, []);
    }
    companyGroups.get(normalized)!.push(p);
  }

  // Filter to companies with multiple locations
  const multiLocationCompanies = Array.from(companyGroups.entries())
    .filter(([_, locations]) => locations.length > 1);

  console.log(`Found ${multiLocationCompanies.length} companies with multiple locations`);

  let totalCreated = 0;

  for (const [companyName, locations] of multiLocationCompanies) {
    // Get all fund allocations for any location of this company
    const locationIds = locations.map(l => l.id);
    const { data: funds } = await supabase
      .from('fund_allocations')
      .select('*')
      .in('provider_id', locationIds);

    if (!funds || funds.length === 0) continue;

    // Get unique allocations by service_type + period
    const uniqueAllocations = new Map<string, typeof funds[0]>();
    for (const fund of funds) {
      const key = `${fund.service_type}_${fund.period_year}_${fund.period_month}`;
      if (!uniqueAllocations.has(key)) {
        uniqueAllocations.set(key, fund);
      }
    }

    // Copy to all locations that don't have it
    for (const location of locations) {
      for (const [_, fund] of uniqueAllocations) {
        // Check if this location already has this allocation
        const { data: existing } = await supabase
          .from('fund_allocations')
          .select('id')
          .eq('provider_id', location.id)
          .eq('service_type', fund.service_type)
          .eq('period_year', fund.period_year)
          .eq('period_month', fund.period_month)
          .maybeSingle();

        if (!existing) {
          const { error } = await supabase
            .from('fund_allocations')
            .insert({
              provider_id: location.id,
              period_year: fund.period_year,
              period_month: fund.period_month,
              service_type: fund.service_type,
              allocated_amount: fund.allocated_amount,
              data_source: fund.data_source
            });

          if (!error) {
            totalCreated++;
            console.log(`  ${location.name.substring(0, 45)} <- ${fund.service_type}`);
          }
        }
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Created ${totalCreated} new fund allocation records`);
}

main().catch(console.error);
