import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    house_number?: string;
    suburb?: string;
    city?: string;
    town?: string;
    municipality?: string;
    postcode?: string;
  };
  type?: string;
  class?: string;
}

async function searchNominatim(query: string): Promise<NominatimResult[] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=3&countrycodes=ro&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FondCAS/1.0 (healthcare provider finder)',
      },
    });

    const data = await response.json();
    return data && data.length > 0 ? data : null;
  } catch (error) {
    console.error('Nominatim error:', error);
    return null;
  }
}

function buildAddress(result: NominatimResult): string {
  const addr = result.address;
  let parts: string[] = [];

  if (addr.road) {
    let street = addr.road;
    if (addr.house_number) street += ' ' + addr.house_number;
    parts.push(street);
  }

  if (addr.suburb) parts.push(addr.suburb);

  const city = addr.city || addr.town || addr.municipality;
  if (city) parts.push(city);

  return parts.join(', ') || result.display_name.split(',').slice(0, 3).join(',');
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if the result seems relevant (contains medical/clinic keywords or matches name)
function isRelevantResult(result: NominatimResult, clinicName: string): boolean {
  const displayName = result.display_name.toLowerCase();
  const name = clinicName.toLowerCase();

  // Check if it's a medical facility
  const medicalKeywords = ['clinic', 'spital', 'medical', 'hospital', 'cabinet', 'laborator', 'sanador', 'medicover', 'gral', 'regina maria', 'affidea', 'medlife'];

  // Check if result contains clinic name parts or medical keywords
  const nameWords = name.split(/\s+/).filter(w => w.length > 3);
  const hasNameMatch = nameWords.some(word => displayName.includes(word));
  const hasMedicalMatch = medicalKeywords.some(kw => displayName.includes(kw));

  return hasNameMatch || hasMedicalMatch || result.class === 'amenity';
}

async function enrichAddresses(limit: number = 10, dryRun: boolean = false) {
  // Get locations that need enrichment
  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, address, city, lat, lng, organization:organizations(id, legal_name, network_brand)')
    .or('lat.is.null,lng.is.null')
    .not('city', 'is', null)
    .limit(limit);

  if (error) {
    console.error('Error fetching locations:', error);
    return;
  }

  console.log(`Found ${locations.length} locations to process`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no updates)' : 'LIVE (will update database)'}\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const loc of locations) {
    console.log(`\n--- ${loc.name} ---`);
    console.log(`City: ${loc.city}`);
    console.log(`Current: ${loc.address || 'No address'} | Coords: ${loc.lat || 'N/A'}, ${loc.lng || 'N/A'}`);

    // Build specific search queries
    const queries = [
      `${loc.name}, ${loc.city}, Romania`,
    ];

    // Add brand-specific search if different from name
    const brand = loc.organization?.network_brand;
    if (brand && !loc.name.toLowerCase().includes(brand.toLowerCase())) {
      queries.push(`${brand} ${loc.name.replace(brand, '').trim()}, ${loc.city}, Romania`);
    }

    let bestResult: { address: string; lat: number; lng: number } | null = null;

    for (const query of queries) {
      console.log(`  Searching: "${query}"`);

      const results = await searchNominatim(query);

      if (results) {
        // Find the most relevant result
        for (const result of results) {
          if (isRelevantResult(result, loc.name)) {
            const address = buildAddress(result);

            // Skip if address is too generic (just city name)
            if (address.toLowerCase() === loc.city?.toLowerCase()) {
              console.log(`  Skip: Too generic (just city name)`);
              continue;
            }

            bestResult = {
              address,
              lat: parseFloat(result.lat),
              lng: parseFloat(result.lon),
            };
            console.log(`  ✓ Found: ${address}`);
            console.log(`    Coords: ${bestResult.lat}, ${bestResult.lng}`);
            break;
          }
        }
      }

      if (bestResult) break;
      await wait(1100);
    }

    if (bestResult) {
      if (!dryRun) {
        // Only update coordinates if we don't have them, or update address if it's better
        const updateData: any = {};

        if (!loc.lat || !loc.lng) {
          updateData.lat = bestResult.lat;
          updateData.lng = bestResult.lng;
        }

        if (!loc.address || loc.address === loc.city) {
          updateData.address = bestResult.address;
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('locations')
            .update(updateData)
            .eq('id', loc.id);

          if (updateError) {
            console.log(`  ✗ Update failed: ${updateError.message}`);
            skipped++;
          } else {
            console.log(`  ✓ Updated: ${JSON.stringify(updateData)}`);
            updated++;
          }
        } else {
          console.log(`  - Nothing to update`);
          skipped++;
        }
      } else {
        console.log(`  [DRY RUN] Would update`);
        updated++;
      }
    } else {
      console.log(`  ✗ No relevant results found`);
      notFound++;
    }

    await wait(1100);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Not found: ${notFound}`);
}

// Run with 10 locations, dry run first
const args = process.argv.slice(2);
const dryRun = !args.includes('--live');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');

enrichAddresses(limit, dryRun);
