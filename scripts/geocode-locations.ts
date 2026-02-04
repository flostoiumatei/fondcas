/**
 * Geocode Locations in v2 Schema
 *
 * Reads locations without coordinates from Supabase and geocodes them
 * using Nominatim (OpenStreetMap). Updates the database directly.
 *
 * Usage: npx tsx scripts/geocode-locations.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_MS = 1100; // 1 request per second (Nominatim requires this)

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Clean address for geocoding
function cleanAddress(address: string): string {
  return address
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/sector\s*(\d)/gi, 'Sector $1')
    .replace(/nr\.?\s*/gi, '')
    .replace(/bl\.?\s*/gi, 'Bloc ')
    .replace(/sc\.?\s*/gi, 'Scara ')
    .replace(/et\.?\s*/gi, 'Etaj ')
    .replace(/ap\.?\s*/gi, 'Apartament ')
    .replace(/cam\.?\s*/gi, 'Camera ')
    .trim();
}

// Geocode a single address
async function geocodeAddress(address: string, city: string = 'București'): Promise<{ lat: number; lng: number } | null> {
  const cleanAddr = cleanAddress(address);
  const query = `${cleanAddr}, ${city}, Romania`;

  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'ro');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'FondCAS/1.0 (healthcare provider search app)',
      },
    });

    if (!response.ok) {
      console.error(`  HTTP error: ${response.status}`);
      return null;
    }

    const results: NominatimResult[] = await response.json();

    if (results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }

    // Fallback: try with just street name and city
    const streetMatch = cleanAddr.match(/^([^,]+)/);
    if (streetMatch) {
      const fallbackQuery = `${streetMatch[1]}, ${city}, Romania`;
      url.searchParams.set('q', fallbackQuery);

      await sleep(RATE_LIMIT_MS);
      const fallbackResponse = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'FondCAS/1.0 (healthcare provider search app)',
        },
      });

      if (fallbackResponse.ok) {
        const fallbackResults: NominatimResult[] = await fallbackResponse.json();
        if (fallbackResults.length > 0) {
          return {
            lat: parseFloat(fallbackResults[0].lat),
            lng: parseFloat(fallbackResults[0].lon),
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`  Geocode error:`, error);
    return null;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       Geocoding Locations (v2 Schema)            ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Get county map for resolving city names
  const { data: counties } = await supabase
    .from('counties')
    .select('id, code, name');
  const countyIdMap = new Map(counties?.map(c => [c.id, c.name]) || []);

  // Get locations without coordinates
  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, address, city, county_id')
    .is('lat', null)
    .not('address', 'is', null)
    .order('is_primary', { ascending: false })
    .order('name');

  if (error) {
    console.error('Error fetching locations:', error);
    process.exit(1);
  }

  console.log(`Found ${locations.length} locations to geocode\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    const progress = `[${i + 1}/${locations.length}]`;

    if (!location.address || location.address.length < 5) {
      console.log(`${progress} Skipping "${location.name}" - no valid address`);
      failed++;
      continue;
    }

    // Determine city for geocoding
    let city = location.city || 'București';
    if (!location.city && location.county_id) {
      const countyName = countyIdMap.get(location.county_id);
      if (countyName && countyName !== 'București') {
        city = countyName;
      }
    }

    console.log(`${progress} Geocoding: ${location.name.substring(0, 50)}`);
    console.log(`  Address: ${location.address.substring(0, 60)}${location.address.length > 60 ? '...' : ''}`);

    const coords = await geocodeAddress(location.address, city);

    if (coords) {
      const { error: updateError } = await supabase
        .from('locations')
        .update({
          lat: coords.lat,
          lng: coords.lng,
          updated_at: new Date().toISOString(),
        })
        .eq('id', location.id);

      if (updateError) {
        console.log(`  ✗ Update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ Found: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
        success++;
      }
    } else {
      console.log(`  ✗ Not found`);
      failed++;
    }

    // Rate limiting
    await sleep(RATE_LIMIT_MS);
  }

  console.log('\n' + '═'.repeat(55));
  console.log('                GEOCODING COMPLETE');
  console.log('═'.repeat(55));
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${locations.length}`);
  console.log('═'.repeat(55));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
