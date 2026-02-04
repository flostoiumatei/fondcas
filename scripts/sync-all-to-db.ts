/**
 * Sync ALL enriched organization data to Supabase v2 schema
 *
 * Usage: npx tsx scripts/sync-all-to-db.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EnrichedOrganization {
  cui?: string;
  legalName: string;
  providerType: string;
  specialties: string[];
  primaryLocation: {
    address?: string;
    city?: string;
    county: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  isNetwork: boolean;
  networkBrand?: string;
  networkWebsite?: string;
  aiConfidence: number;
  aiReasoning: string;
  discoveredLocations: Array<{
    name: string;
    address: string;
    city: string;
    county?: string;
    phone?: string;
    website?: string;
    openingHours?: string;
    confidence: number;
  }>;
  aiEnrichedAt: string;
}

const BATCH_SIZE = 50;

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Sync ALL Enriched Data to Supabase v2 Schema   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Load enriched data
  const dataFile = path.join(process.cwd(), 'data', 'v2', 'enriched_organizations.json');

  if (!fs.existsSync(dataFile)) {
    console.error('Enriched data file not found:', dataFile);
    console.error('Run the AI enrichment first: npx tsx scripts/ai-enrich-safe.ts');
    process.exit(1);
  }

  const enrichedOrgs: EnrichedOrganization[] = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  console.log(`Loaded ${enrichedOrgs.length} enriched organizations\n`);

  // Get county map
  const { data: counties, error: countyError } = await supabase
    .from('counties')
    .select('id, code, name');

  if (countyError) {
    console.error('Failed to fetch counties:', countyError.message);
    console.error('\nMake sure you have run supabase/schema-v2.sql in Supabase SQL Editor!');
    process.exit(1);
  }

  const countyMap = new Map(counties?.map(c => [c.code, c.id]) || []);
  const countyNameMap = new Map(counties?.map(c => [c.name.toLowerCase(), c.id]) || []);
  console.log(`Loaded ${countyMap.size} counties\n`);

  // Collect and upsert all specialties first
  console.log('Processing specialties...');
  const allSpecialties = new Set<string>();
  enrichedOrgs.forEach(org => {
    org.specialties.forEach(s => allSpecialties.add(s.toLowerCase()));
  });

  for (const specName of allSpecialties) {
    await supabase
      .from('specialties')
      .upsert({ name: specName }, { onConflict: 'name' });
  }
  console.log(`Upserted ${allSpecialties.size} specialties\n`);

  // Get specialty map
  const { data: specialties } = await supabase
    .from('specialties')
    .select('id, name');
  const specialtyMap = new Map(specialties?.map(s => [s.name.toLowerCase(), s.id]) || []);

  // Stats
  let orgsCreated = 0;
  let orgsUpdated = 0;
  let locsCreated = 0;
  let networksFound = 0;
  let errors = 0;

  const totalBatches = Math.ceil(enrichedOrgs.length / BATCH_SIZE);

  // Process organizations in batches
  for (let batch = 0; batch < totalBatches; batch++) {
    const start = batch * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, enrichedOrgs.length);
    const batchOrgs = enrichedOrgs.slice(start, end);

    console.log(`\n━━━ Batch ${batch + 1}/${totalBatches} (orgs ${start + 1}-${end} of ${enrichedOrgs.length}) ━━━`);

    for (const enriched of batchOrgs) {
      const isNetwork = enriched.isNetwork;
      const networkIndicator = isNetwork ? '🏥' : '📍';
      if (isNetwork) networksFound++;

      process.stdout.write(`  ${networkIndicator} ${enriched.legalName.substring(0, 45).padEnd(45)} `);

      try {
        // Prepare org data
        const orgData = {
          cui: enriched.cui || null,
          legal_name: enriched.legalName,
          is_network: enriched.isNetwork,
          network_brand: enriched.networkBrand || null,
          network_website: enriched.networkWebsite || null,
          provider_type: enriched.providerType,
          ai_enriched: true,
          ai_enriched_at: enriched.aiEnrichedAt,
          ai_confidence: enriched.aiConfidence,
          data_source: 'full_sync',
          data_source_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        };

        // Check for existing org
        let existingOrg = null;
        if (enriched.cui) {
          const { data } = await supabase
            .from('organizations')
            .select('id')
            .eq('cui', enriched.cui)
            .single();
          existingOrg = data;
        }
        if (!existingOrg) {
          const { data } = await supabase
            .from('organizations')
            .select('id')
            .eq('legal_name', enriched.legalName)
            .single();
          existingOrg = data;
        }

        let org;
        let orgError;
        let isNew = false;

        if (existingOrg) {
          const { data, error } = await supabase
            .from('organizations')
            .update(orgData)
            .eq('id', existingOrg.id)
            .select()
            .single();
          org = data;
          orgError = error;
          if (!error) orgsUpdated++;
        } else {
          const { data, error } = await supabase
            .from('organizations')
            .insert(orgData)
            .select()
            .single();
          org = data;
          orgError = error;
          isNew = true;
          if (!error) orgsCreated++;
        }

        if (orgError) {
          console.log(`✗ Org error: ${orgError.message}`);
          errors++;
          continue;
        }

        // Link specialties
        for (const specName of enriched.specialties) {
          const specId = specialtyMap.get(specName.toLowerCase());
          if (specId) {
            await supabase
              .from('organization_specialties')
              .upsert({ organization_id: org.id, specialty_id: specId }, {
                onConflict: 'organization_id,specialty_id'
              });
          }
        }

        // Insert locations
        const locCount = enriched.discoveredLocations.length;

        for (let i = 0; i < enriched.discoveredLocations.length; i++) {
          const loc = enriched.discoveredLocations[i];
          const isPrimary = i === 0;

          // Resolve county
          let countyId = countyMap.get('B'); // Default to București

          const countyCode = loc.county || enriched.primaryLocation.county || 'B';
          if (countyCode.length <= 2) {
            countyId = countyMap.get(countyCode) || countyId;
          } else {
            // Try to match by name
            const normalizedCounty = countyCode.toLowerCase().replace(/județul\s*/i, '').trim();
            countyId = countyNameMap.get(normalizedCounty) || countyId;

            // Try partial match
            if (!countyId) {
              for (const [name, id] of countyNameMap.entries()) {
                if (name.includes(normalizedCounty) || normalizedCounty.includes(name)) {
                  countyId = id;
                  break;
                }
              }
            }
          }

          const locData = {
            organization_id: org.id,
            name: loc.name || enriched.networkBrand || enriched.legalName,
            address: loc.address || null,
            city: loc.city || null,
            county_id: countyId,
            phone: loc.phone || (isPrimary ? enriched.primaryLocation.phone : null),
            email: isPrimary ? enriched.primaryLocation.email : null,
            website: loc.website || enriched.networkWebsite || null,
            source: isPrimary ? 'cnas' : 'ai_discovered',
            confidence: loc.confidence || 80,
            is_primary: isPrimary,
            updated_at: new Date().toISOString(),
          };

          const { error: locError } = await supabase
            .from('locations')
            .upsert(locData, {
              onConflict: 'organization_id,address,city',
              ignoreDuplicates: false
            });

          if (!locError) {
            locsCreated++;
          }
        }

        const status = isNew ? '✓ NEW' : '✓ UPD';
        console.log(`${status} (${locCount} locs)`);

      } catch (e: any) {
        console.log(`✗ Error: ${e.message}`);
        errors++;
      }
    }

    console.log(`  Batch complete: ${orgsCreated + orgsUpdated} orgs, ${locsCreated} locs`);
  }

  console.log('\n' + '═'.repeat(55));
  console.log('                    SYNC COMPLETE');
  console.log('═'.repeat(55));
  console.log(`  Total organizations:  ${orgsCreated + orgsUpdated}`);
  console.log(`    - New:              ${orgsCreated}`);
  console.log(`    - Updated:          ${orgsUpdated}`);
  console.log(`  Networks found:       ${networksFound}`);
  console.log(`  Total locations:      ${locsCreated}`);
  console.log(`  Errors:               ${errors}`);
  console.log('═'.repeat(55));
  console.log('\nThe app is now ready with all the enriched data!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
