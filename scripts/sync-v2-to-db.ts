/**
 * Sync v2 Data to Database
 *
 * Step 3: Upload enriched organizations and locations to Supabase
 *
 * Usage: npx tsx scripts/sync-v2-to-db.ts
 *
 * Options:
 *   --geocode      Also geocode locations without coordinates
 *   --skip-orgs    Skip uploading organizations (only sync locations)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const INPUT_DIR = path.join(process.cwd(), 'data', 'v2');

// Rate limiting for geocoding
const GEOCODE_DELAY_MS = 1100; // Nominatim: 1 request per second

// ============================================
// TYPES
// ============================================

interface DiscoveredLocation {
  name: string;
  address: string;
  city: string;
  county?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  confidence: number;
}

interface EnrichedOrganization {
  cui?: string;
  legalName: string;
  providerType: string;
  cnasContractNumber?: string;
  dataSource: string;
  dataSourceDate?: string;
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
  discoveredLocations: DiscoveredLocation[];
  aiEnrichedAt: string;
}

interface FundAllocation {
  providerName: string;
  providerCui?: string;
  periodYear: number;
  periodMonth: number;
  serviceType: string;
  allocatedAmount: number;
  consumedAmount?: number;
  availableAmount?: number;
  contractNumber?: string;
  dataSource: string;
}

// ============================================
// HELPERS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeAddress(address: string, city: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = `${address}, ${city}, Romania`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=ro`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FondCAS/2.0 (https://fondcas.ro)',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

function normalizeCountyCode(county?: string): string {
  if (!county) return 'B';

  const countyMap: Record<string, string> = {
    'bucuresti': 'B', 'bucurești': 'B', 'bucharest': 'B', 'b': 'B', 'sector': 'B',
    'alba': 'AB', 'arad': 'AR', 'arges': 'AG', 'argeș': 'AG',
    'bacau': 'BC', 'bacău': 'BC', 'bihor': 'BH', 'bistrita-nasaud': 'BN', 'bistrița-năsăud': 'BN',
    'botosani': 'BT', 'botoșani': 'BT', 'brasov': 'BV', 'brașov': 'BV',
    'braila': 'BR', 'brăila': 'BR', 'buzau': 'BZ', 'buzău': 'BZ',
    'caras-severin': 'CS', 'caraș-severin': 'CS', 'calarasi': 'CL', 'călărași': 'CL',
    'cluj': 'CJ', 'constanta': 'CT', 'constanța': 'CT', 'covasna': 'CV',
    'dambovita': 'DB', 'dâmbovița': 'DB', 'dolj': 'DJ',
    'galati': 'GL', 'galați': 'GL', 'giurgiu': 'GR', 'gorj': 'GJ',
    'harghita': 'HR', 'hunedoara': 'HD',
    'ialomita': 'IL', 'ialomița': 'IL', 'iasi': 'IS', 'iași': 'IS', 'ilfov': 'IF',
    'maramures': 'MM', 'maramureș': 'MM', 'mehedinti': 'MH', 'mehedinți': 'MH', 'mures': 'MS', 'mureș': 'MS',
    'neamt': 'NT', 'neamț': 'NT',
    'olt': 'OT', 'prahova': 'PH',
    'satu mare': 'SM', 'salaj': 'SJ', 'sălaj': 'SJ', 'sibiu': 'SB', 'suceava': 'SV',
    'teleorman': 'TR', 'timis': 'TM', 'timiș': 'TM', 'tulcea': 'TL',
    'vaslui': 'VS', 'valcea': 'VL', 'vâlcea': 'VL', 'vrancea': 'VN',
  };

  const normalized = county.toLowerCase().trim();
  return countyMap[normalized] || 'B';
}

// ============================================
// DATABASE SYNC
// ============================================

async function syncToDatabase(
  supabase: ReturnType<typeof createClient>,
  enrichedOrgs: EnrichedOrganization[],
  allocations: FundAllocation[],
  doGeocode: boolean
): Promise<void> {
  console.log('\n=== Syncing to Database ===\n');

  // Get county mapping
  const { data: counties } = await supabase.from('counties').select('id, code');
  const countyMap = new Map<string, string>();
  for (const c of counties || []) {
    countyMap.set(c.code, c.id);
  }

  // Get or create specialties
  const allSpecialties = new Set<string>();
  for (const org of enrichedOrgs) {
    for (const spec of org.specialties) {
      allSpecialties.add(spec.toLowerCase().trim());
    }
  }

  console.log(`Found ${allSpecialties.size} unique specialties`);

  // Insert specialties
  for (const spec of allSpecialties) {
    await supabase.from('specialties').upsert(
      { name: spec },
      { onConflict: 'name' }
    );
  }

  // Get specialty mapping
  const { data: specRows } = await supabase.from('specialties').select('id, name');
  const specialtyMap = new Map<string, string>();
  for (const s of specRows || []) {
    specialtyMap.set(s.name.toLowerCase(), s.id);
  }

  // Process organizations
  let orgCount = 0;
  let locationCount = 0;
  let geocodedCount = 0;

  for (const org of enrichedOrgs) {
    process.stdout.write(`\r[${orgCount + 1}/${enrichedOrgs.length}] ${org.legalName.substring(0, 40).padEnd(40)}...`);

    // Upsert organization
    const orgData = {
      cui: org.cui || null,
      legal_name: org.legalName,
      is_network: org.isNetwork,
      network_brand: org.networkBrand || null,
      network_website: org.networkWebsite || null,
      provider_type: org.providerType,
      cnas_contract_number: org.cnasContractNumber || null,
      ai_enriched: true,
      ai_enriched_at: org.aiEnrichedAt,
      ai_confidence: org.aiConfidence,
      data_source: org.dataSource,
      data_source_date: org.dataSourceDate || null,
    };

    let orgId: string;

    // Try to find existing by CUI first
    if (org.cui) {
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('cui', org.cui)
        .single();

      if (existing) {
        await supabase.from('organizations').update(orgData).eq('id', existing.id);
        orgId = existing.id;
      } else {
        const { data: inserted } = await supabase
          .from('organizations')
          .insert(orgData)
          .select('id')
          .single();
        orgId = inserted!.id;
      }
    } else {
      // No CUI - try by name
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('legal_name', org.legalName)
        .single();

      if (existing) {
        await supabase.from('organizations').update(orgData).eq('id', existing.id);
        orgId = existing.id;
      } else {
        const { data: inserted } = await supabase
          .from('organizations')
          .insert(orgData)
          .select('id')
          .single();
        orgId = inserted!.id;
      }
    }

    // Link specialties
    for (const spec of org.specialties) {
      const specId = specialtyMap.get(spec.toLowerCase());
      if (specId) {
        await supabase.from('organization_specialties').upsert(
          { organization_id: orgId, specialty_id: specId },
          { onConflict: 'organization_id,specialty_id' }
        );
      }
    }

    // Insert locations
    for (let i = 0; i < org.discoveredLocations.length; i++) {
      const loc = org.discoveredLocations[i];
      const isPrimary = i === 0; // First location is primary (from CNAS)
      const countyCode = normalizeCountyCode(loc.county || org.primaryLocation.county);
      const countyId = countyMap.get(countyCode) || countyMap.get('B');

      // Determine source
      const source = isPrimary && loc.confidence === 100 ? 'cnas' : 'ai_discovered';

      // Check for existing location (by org + address)
      const { data: existingLoc } = await supabase
        .from('locations')
        .select('id, lat, lng')
        .eq('organization_id', orgId)
        .eq('address', loc.address)
        .single();

      let lat = existingLoc?.lat || null;
      let lng = existingLoc?.lng || null;

      // Geocode if needed and requested
      if (doGeocode && !lat && loc.address && loc.city) {
        const coords = await geocodeAddress(loc.address, loc.city);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
          geocodedCount++;
        }
        await sleep(GEOCODE_DELAY_MS);
      }

      const locationData = {
        organization_id: orgId,
        name: loc.name,
        address: loc.address || null,
        city: loc.city || null,
        county_id: countyId,
        lat,
        lng,
        geocoded_at: lat ? new Date().toISOString() : null,
        geocode_source: lat ? 'nominatim' : null,
        phone: loc.phone || org.primaryLocation.phone || null,
        email: isPrimary ? org.primaryLocation.email : null,
        website: loc.website || org.primaryLocation.website || null,
        opening_hours: loc.openingHours ? { raw: loc.openingHours } : null,
        source,
        confidence: loc.confidence,
        is_primary: isPrimary,
      };

      if (existingLoc) {
        await supabase.from('locations').update(locationData).eq('id', existingLoc.id);
      } else {
        await supabase.from('locations').insert(locationData);
        locationCount++;
      }
    }

    orgCount++;
  }

  console.log(`\n\nOrganizations: ${orgCount}`);
  console.log(`Locations: ${locationCount}`);
  if (doGeocode) {
    console.log(`Geocoded: ${geocodedCount}`);
  }

  // Sync fund allocations
  console.log('\nSyncing fund allocations...');

  let allocCount = 0;
  for (const alloc of allocations) {
    // Find organization by CUI or name
    let orgId: string | null = null;

    if (alloc.providerCui) {
      const { data } = await supabase
        .from('organizations')
        .select('id')
        .eq('cui', alloc.providerCui)
        .single();
      if (data) orgId = data.id;
    }

    if (!orgId) {
      const { data } = await supabase
        .from('organizations')
        .select('id')
        .ilike('legal_name', `%${alloc.providerName}%`)
        .limit(1)
        .single();
      if (data) orgId = data.id;
    }

    if (!orgId) continue;

    await supabase.from('fund_allocations').upsert({
      organization_id: orgId,
      period_year: alloc.periodYear,
      period_month: alloc.periodMonth,
      service_type: alloc.serviceType,
      allocated_amount: alloc.allocatedAmount,
      consumed_amount: alloc.consumedAmount || null,
      available_amount: alloc.availableAmount || null,
      data_source: alloc.dataSource,
    }, {
      onConflict: 'organization_id,period_year,period_month,service_type'
    });

    allocCount++;
  }

  console.log(`Fund allocations: ${allocCount}`);
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  console.log('=== Sync v2 Data to Database ===\n');

  // Check environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing Supabase credentials');
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);
  const doGeocode = args.includes('--geocode');
  const skipOrgs = args.includes('--skip-orgs');

  // Load data
  const enrichedFile = path.join(INPUT_DIR, 'enriched_organizations.json');
  const allocsFile = path.join(INPUT_DIR, 'allocations.json');

  if (!fs.existsSync(enrichedFile)) {
    console.error(`ERROR: Enriched file not found: ${enrichedFile}`);
    console.error('Run first: npx tsx scripts/ai-enrich-organizations.ts');
    process.exit(1);
  }

  const enrichedOrgs: EnrichedOrganization[] = JSON.parse(fs.readFileSync(enrichedFile, 'utf-8'));
  const allocations: FundAllocation[] = fs.existsSync(allocsFile)
    ? JSON.parse(fs.readFileSync(allocsFile, 'utf-8'))
    : [];

  console.log(`Loaded ${enrichedOrgs.length} enriched organizations`);
  console.log(`Loaded ${allocations.length} fund allocations`);

  // Statistics
  const networks = enrichedOrgs.filter(o => o.isNetwork);
  const totalLocations = enrichedOrgs.reduce((sum, o) => sum + o.discoveredLocations.length, 0);

  console.log(`\nNetworks: ${networks.length}`);
  console.log(`Total locations: ${totalLocations}`);

  if (doGeocode) {
    console.log('\nGeocoding enabled - this will be slow (1 req/sec)');
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!skipOrgs) {
    await syncToDatabase(supabase, enrichedOrgs, allocations, doGeocode);
  }

  console.log('\n✓ Sync complete!');
  console.log('\nNext: Update the frontend to use the new locations table');
}

main().catch(console.error);
