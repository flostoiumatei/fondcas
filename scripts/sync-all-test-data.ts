/**
 * Sync ALL test data to Supabase v2 schema
 * Includes both network test data and regular enriched clinics
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
  console.log('║    Sync ALL Test Data to Supabase v2 Schema      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Load both test files
  const testFiles = [
    'data/v2/test/test_networks.json',
    'data/v2/test/test_enriched.json'
  ];

  let allOrgs: EnrichedOrganization[] = [];

  for (const file of testFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const orgs = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      console.log(`Loaded ${orgs.length} from ${file}`);
      allOrgs = allOrgs.concat(orgs);
    }
  }

  // Dedupe by legal name
  const seen = new Set<string>();
  allOrgs = allOrgs.filter(org => {
    if (seen.has(org.legalName)) return false;
    seen.add(org.legalName);
    return true;
  });

  console.log(`\nTotal unique organizations: ${allOrgs.length}\n`);

  // Get county map
  const { data: counties, error: countyError } = await supabase
    .from('counties')
    .select('id, code, name');

  if (countyError) {
    console.error('Failed to fetch counties:', countyError.message);
    process.exit(1);
  }

  const countyMap = new Map(counties?.map(c => [c.code, c.id]) || []);

  // Upsert all specialties first
  const allSpecialties = new Set<string>();
  allOrgs.forEach(org => {
    org.specialties?.forEach(s => allSpecialties.add(s.toLowerCase()));
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
  let orgsSkipped = 0;
  let locsCreated = 0;

  for (const enriched of allOrgs) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('legal_name', enriched.legalName)
      .single();

    if (existing) {
      orgsSkipped++;
      continue;
    }

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
      data_source: 'test_sync',
      data_source_date: new Date().toISOString().split('T')[0],
    };

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert(orgData)
      .select()
      .single();

    if (orgError) {
      console.error(`✗ ${enriched.legalName}: ${orgError.message}`);
      continue;
    }

    orgsCreated++;

    // Link specialties
    for (const specName of (enriched.specialties || [])) {
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
    for (let i = 0; i < (enriched.discoveredLocations || []).length; i++) {
      const loc = enriched.discoveredLocations[i];
      const isPrimary = i === 0;

      let countyCode = loc.county || enriched.primaryLocation?.county || 'B';
      if (countyCode.length > 2) {
        const found = counties?.find(c =>
          c.name.toLowerCase().includes(countyCode.toLowerCase())
        );
        if (found) countyCode = found.code;
        else countyCode = 'B';
      }

      const countyId = countyMap.get(countyCode) || countyMap.get('B');

      const locData = {
        organization_id: org.id,
        name: loc.name || enriched.networkBrand || enriched.legalName,
        address: loc.address || null,
        city: loc.city || null,
        county_id: countyId,
        phone: loc.phone || (isPrimary ? enriched.primaryLocation?.phone : null),
        email: isPrimary ? enriched.primaryLocation?.email : null,
        website: loc.website || enriched.networkWebsite || null,
        source: isPrimary ? 'cnas' : 'ai_discovered',
        confidence: loc.confidence || 80,
        is_primary: isPrimary,
      };

      const { error: locError } = await supabase
        .from('locations')
        .insert(locData);

      if (!locError) locsCreated++;
    }

    // Progress
    if (orgsCreated % 10 === 0) {
      process.stdout.write(`\rProgress: ${orgsCreated} orgs, ${locsCreated} locs...`);
    }
  }

  console.log('\n');
  console.log('══════════════════════════════════════════════════');
  console.log('                 SYNC COMPLETE');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Organizations created: ${orgsCreated}`);
  console.log(`  Organizations skipped: ${orgsSkipped}`);
  console.log(`  Locations created:     ${locsCreated}`);
  console.log('══════════════════════════════════════════════════');
}

main().catch(console.error);
