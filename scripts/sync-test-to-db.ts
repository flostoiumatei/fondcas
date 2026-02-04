/**
 * Sync test network data to Supabase v2 schema
 *
 * Prerequisites: Run supabase/schema-v2.sql in Supabase SQL Editor first!
 *
 * Usage: npx tsx scripts/sync-test-to-db.ts
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

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Sync Test Data to Supabase v2 Schema         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Load test data
  const testFile = path.join(process.cwd(), 'data', 'v2', 'test', 'test_networks.json');

  if (!fs.existsSync(testFile)) {
    console.error('Test file not found:', testFile);
    console.error('Run the network test first: npx tsx scripts/ai-enrich-test-networks.ts');
    process.exit(1);
  }

  const enrichedOrgs: EnrichedOrganization[] = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
  console.log(`Loaded ${enrichedOrgs.length} test organizations\n`);

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
  console.log(`Loaded ${countyMap.size} counties\n`);

  // Upsert specialties
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

  // Process each organization
  let orgsCreated = 0;
  let locsCreated = 0;

  for (const enriched of enrichedOrgs) {
    console.log(`\n📦 ${enriched.legalName}`);
    console.log(`   Network: ${enriched.isNetwork ? '✓ YES' : '✗ No'}`);
    if (enriched.networkBrand) console.log(`   Brand: ${enriched.networkBrand}`);

    // Upsert organization
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
      data_source: 'test_network_sync',
      data_source_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    };

    // First try to find existing org by CUI or legal_name
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

    if (existingOrg) {
      // Update existing
      const { data, error } = await supabase
        .from('organizations')
        .update(orgData)
        .eq('id', existingOrg.id)
        .select()
        .single();
      org = data;
      orgError = error;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('organizations')
        .insert(orgData)
        .select()
        .single();
      org = data;
      orgError = error;
    }

    if (orgError) {
      console.error(`   ✗ Failed to upsert org: ${orgError.message}`);
      continue;
    }

    orgsCreated++;
    console.log(`   ✓ Organization ID: ${org.id}`);

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
    console.log(`   📍 ${enriched.discoveredLocations.length} locations:`);

    for (let i = 0; i < enriched.discoveredLocations.length; i++) {
      const loc = enriched.discoveredLocations[i];
      const isPrimary = i === 0;

      // Determine county
      let countyCode = loc.county || enriched.primaryLocation.county || 'B';
      // Normalize county code
      if (countyCode.length > 2) {
        // Try to find matching county
        const found = counties?.find(c =>
          c.name.toLowerCase().includes(countyCode.toLowerCase()) ||
          countyCode.toLowerCase().includes(c.name.toLowerCase())
        );
        if (found) countyCode = found.code;
        else countyCode = 'B'; // Default to București
      }

      const countyId = countyMap.get(countyCode) || countyMap.get('B');

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

      if (locError) {
        console.error(`      ✗ ${loc.name}: ${locError.message}`);
      } else {
        console.log(`      ✓ ${loc.name} (${loc.city || 'N/A'})`);
        locsCreated++;
      }
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('                 SYNC COMPLETE');
  console.log('═'.repeat(50));
  console.log(`  Organizations: ${orgsCreated}`);
  console.log(`  Locations:     ${locsCreated}`);
  console.log('═'.repeat(50));
  console.log('\nYou can now test the app with the new data!');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
