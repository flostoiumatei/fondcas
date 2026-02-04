/**
 * Geocode Database Providers (Fast Version)
 *
 * Uses sector/neighborhood detection for București providers
 * Falls back to Nominatim for street-level precision when possible
 *
 * Usage: npx tsx scripts/geocode-db-providers.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_MS = 1100;

interface Provider {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  county: { code: string; name: string } | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sector center coordinates for București
const SECTOR_COORDS: Record<number, { lat: number; lng: number }> = {
  1: { lat: 44.4677, lng: 26.0851 },
  2: { lat: 44.4505, lng: 26.1350 },
  3: { lat: 44.4150, lng: 26.1500 },
  4: { lat: 44.3950, lng: 26.1050 },
  5: { lat: 44.4100, lng: 26.0500 },
  6: { lat: 44.4300, lng: 26.0100 },
};

// Major neighborhoods and areas in București
const NEIGHBORHOOD_COORDS: Record<string, { lat: number; lng: number }> = {
  'militari': { lat: 44.4341, lng: 25.9934 },
  'drumul taberei': { lat: 44.4183, lng: 26.0217 },
  'rahova': { lat: 44.4056, lng: 26.0567 },
  'pantelimon': { lat: 44.4400, lng: 26.1750 },
  'titan': { lat: 44.4150, lng: 26.1600 },
  'berceni': { lat: 44.3900, lng: 26.1200 },
  'colentina': { lat: 44.4700, lng: 26.1400 },
  'floreasca': { lat: 44.4700, lng: 26.1000 },
  'dorobanti': { lat: 44.4550, lng: 26.0900 },
  'pipera': { lat: 44.4850, lng: 26.1100 },
  'ghencea': { lat: 44.4050, lng: 26.0267 },
  'chitila': { lat: 44.5000, lng: 26.0200 },
  'giulesti': { lat: 44.4600, lng: 26.0300 },
  'crangasi': { lat: 44.4500, lng: 26.0400 },
  'cotroceni': { lat: 44.4350, lng: 26.0650 },
  'vitan': { lat: 44.4100, lng: 26.1300 },
  'tineretului': { lat: 44.4050, lng: 26.1050 },
  'unirii': { lat: 44.4250, lng: 26.1000 },
  'universitate': { lat: 44.4350, lng: 26.1000 },
  'victoriei': { lat: 44.4520, lng: 26.0850 },
  'aviatorilor': { lat: 44.4650, lng: 26.0900 },
  'herastrau': { lat: 44.4750, lng: 26.0800 },
  'baneasa': { lat: 44.5050, lng: 26.0850 },
  'otopeni': { lat: 44.5500, lng: 26.0800 },
  'voluntari': { lat: 44.4900, lng: 26.1300 },
  'popesti': { lat: 44.3800, lng: 26.1400 },
  'alexandriei': { lat: 44.3850, lng: 26.0400 },
  'ferentari': { lat: 44.3950, lng: 26.0700 },
  'giurgiului': { lat: 44.3900, lng: 26.0900 },
  'oltenitei': { lat: 44.3800, lng: 26.1100 },
  'mihai bravu': { lat: 44.4250, lng: 26.1200 },
  'obor': { lat: 44.4450, lng: 26.1300 },
  'iancului': { lat: 44.4350, lng: 26.1200 },
  'stefan cel mare': { lat: 44.4500, lng: 26.1100 },
  'barbu vacarescu': { lat: 44.4600, lng: 26.1100 },
  'timpuri noi': { lat: 44.4150, lng: 26.1100 },
  'ion mihalache': { lat: 44.4600, lng: 26.0700 },
  'calea victoriei': { lat: 44.4400, lng: 26.0950 },
  'magheru': { lat: 44.4400, lng: 26.0970 },
};

// County capitals for non-București providers
const COUNTY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Alba': { lat: 46.0677, lng: 23.5730 },
  'Arad': { lat: 46.1866, lng: 21.3123 },
  'Argeș': { lat: 44.8565, lng: 24.8692 },
  'Bacău': { lat: 46.5670, lng: 26.9146 },
  'Bihor': { lat: 47.0722, lng: 21.9217 },
  'Bistrița-Năsăud': { lat: 47.1325, lng: 24.5005 },
  'Botoșani': { lat: 47.7475, lng: 26.6622 },
  'Brașov': { lat: 45.6427, lng: 25.5887 },
  'Brăila': { lat: 45.2692, lng: 27.9575 },
  'Buzău': { lat: 45.1500, lng: 26.8333 },
  'Caraș-Severin': { lat: 45.3000, lng: 21.9000 },
  'Călărași': { lat: 44.2000, lng: 27.0333 },
  'Cluj': { lat: 46.7712, lng: 23.6236 },
  'Constanța': { lat: 44.1598, lng: 28.6348 },
  'Covasna': { lat: 45.8500, lng: 25.7833 },
  'Dâmbovița': { lat: 44.9333, lng: 25.4500 },
  'Dolj': { lat: 44.3302, lng: 23.7949 },
  'Galați': { lat: 45.4353, lng: 28.0080 },
  'Giurgiu': { lat: 43.9000, lng: 25.9667 },
  'Gorj': { lat: 45.0500, lng: 23.2833 },
  'Harghita': { lat: 46.3500, lng: 25.8000 },
  'Hunedoara': { lat: 45.7500, lng: 22.9000 },
  'Ialomița': { lat: 44.5500, lng: 27.3667 },
  'Iași': { lat: 47.1585, lng: 27.6014 },
  'Ilfov': { lat: 44.4500, lng: 26.0833 },
  'Maramureș': { lat: 47.6500, lng: 23.5833 },
  'Mehedinți': { lat: 44.6333, lng: 22.6500 },
  'Mureș': { lat: 46.5500, lng: 24.5667 },
  'Neamț': { lat: 46.9167, lng: 26.3833 },
  'Olt': { lat: 44.4333, lng: 24.3667 },
  'Prahova': { lat: 44.9500, lng: 26.0167 },
  'Satu Mare': { lat: 47.7833, lng: 22.8833 },
  'Sălaj': { lat: 47.2000, lng: 23.0500 },
  'Sibiu': { lat: 45.7983, lng: 24.1256 },
  'Suceava': { lat: 47.6333, lng: 26.2500 },
  'Teleorman': { lat: 43.9833, lng: 25.3167 },
  'Timiș': { lat: 45.7489, lng: 21.2087 },
  'Tulcea': { lat: 45.1667, lng: 28.8000 },
  'Vaslui': { lat: 46.6333, lng: 27.7333 },
  'Vâlcea': { lat: 45.1000, lng: 24.3667 },
  'Vrancea': { lat: 45.7000, lng: 27.1833 },
};

function extractSector(address: string): number | null {
  // Look for sector patterns
  const patterns = [
    /sector\s*(\d)/i,
    /sect\.?\s*(\d)/i,
    /s\.?\s*(\d)(?:\s|$|,)/i,
  ];

  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      const sector = parseInt(match[1]);
      if (sector >= 1 && sector <= 6) {
        return sector;
      }
    }
  }

  return null;
}

function findNeighborhood(address: string): string | null {
  const lowerAddress = address.toLowerCase();

  for (const neighborhood of Object.keys(NEIGHBORHOOD_COORDS)) {
    if (lowerAddress.includes(neighborhood)) {
      return neighborhood;
    }
  }

  return null;
}

function extractStreetName(address: string): string | null {
  const patterns = [
    /(?:str\.?|strada)\s+([^,\d]+)/i,
    /(?:sos\.?|șoseaua|soseaua)\s+([^,\d]+)/i,
    /(?:bd\.?|bulevardul|b-dul)\s+([^,\d]+)/i,
    /calea\s+([^,\d]+)/i,
    /aleea\s+([^,\d]+)/i,
  ];

  for (const pattern of patterns) {
    const match = address.match(pattern);
    if (match) {
      return match[1].trim().replace(/\s+/g, ' ');
    }
  }

  return null;
}

async function geocodeStreet(street: string, county: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = `${street}, ${county}, Romania`;
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      countrycodes: 'ro'
    });

    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'User-Agent': 'FondCAS/1.0 (healthcare finder Romania)'
      }
    });

    if (!response.ok) return null;

    const results: NominatimResult[] = await response.json();
    if (results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon)
    };
  } catch {
    return null;
  }
}

function addRandomOffset(coords: { lat: number; lng: number }, radiusKm: number = 1): { lat: number; lng: number } {
  // Random offset within radius (in degrees, ~0.009 per km)
  const offsetLat = (Math.random() - 0.5) * 2 * (radiusKm * 0.009);
  const offsetLng = (Math.random() - 0.5) * 2 * (radiusKm * 0.009);

  return {
    lat: coords.lat + offsetLat,
    lng: coords.lng + offsetLng
  };
}

async function geocodeProvider(provider: Provider): Promise<{ lat: number; lng: number; source: string } | null> {
  const address = provider.address || '';
  const countyName = provider.county?.name || 'București';

  // For București, try to get more precise location
  if (countyName === 'București') {
    // First try street-level geocoding
    const streetName = extractStreetName(address);
    if (streetName) {
      const streetCoords = await geocodeStreet(streetName, 'București');
      if (streetCoords) {
        return { ...streetCoords, source: 'street' };
      }
      await sleep(RATE_LIMIT_MS);
    }

    // Try neighborhood
    const neighborhood = findNeighborhood(address);
    if (neighborhood && NEIGHBORHOOD_COORDS[neighborhood]) {
      return { ...addRandomOffset(NEIGHBORHOOD_COORDS[neighborhood], 0.5), source: 'neighborhood' };
    }

    // Try sector
    const sector = extractSector(address);
    if (sector && SECTOR_COORDS[sector]) {
      return { ...addRandomOffset(SECTOR_COORDS[sector], 1.5), source: 'sector' };
    }

    // Default to București center with larger radius
    return { ...addRandomOffset({ lat: 44.4268, lng: 26.1025 }, 3), source: 'city' };
  }

  // For other counties, try street geocoding first
  const streetName = extractStreetName(address);
  if (streetName) {
    const streetCoords = await geocodeStreet(streetName, countyName);
    if (streetCoords) {
      return { ...streetCoords, source: 'street' };
    }
    await sleep(RATE_LIMIT_MS);
  }

  // Fall back to county capital
  if (COUNTY_COORDS[countyName]) {
    return { ...addRandomOffset(COUNTY_COORDS[countyName], 2), source: 'county' };
  }

  return null;
}

async function main() {
  console.log('Starting database geocoding...\n');

  // First, reset all coordinates
  console.log('Resetting existing coordinates...');
  const { error: resetError } = await supabase
    .from('providers')
    .update({ lat: null, lng: null, geocoded_at: null })
    .not('id', 'is', null);

  if (resetError) {
    console.error('Error resetting:', resetError);
  }

  // Get all providers with addresses
  const { data: providers, error } = await supabase
    .from('providers')
    .select('id, name, address, city, county:counties(code, name)')
    .not('address', 'is', null)
    .order('name');

  if (error) {
    console.error('Error fetching providers:', error);
    process.exit(1);
  }

  if (!providers || providers.length === 0) {
    console.log('No providers to geocode!');
    return;
  }

  console.log(`Found ${providers.length} providers to geocode\n`);

  const stats = { street: 0, neighborhood: 0, sector: 0, city: 0, county: 0, failed: 0 };

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i] as unknown as Provider;

    console.log(`[${i + 1}/${providers.length}] ${provider.name}`);

    const result = await geocodeProvider(provider);

    if (result) {
      const { error: updateError } = await supabase
        .from('providers')
        .update({
          lat: result.lat,
          lng: result.lng,
          geocoded_at: new Date().toISOString()
        })
        .eq('id', provider.id);

      if (updateError) {
        console.error(`  Error: ${updateError.message}`);
        stats.failed++;
      } else {
        console.log(`  ✓ ${result.source}: ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`);
        stats[result.source as keyof typeof stats]++;
      }
    } else {
      console.log('  ✗ Failed');
      stats.failed++;
    }

    // Progress report every 100
    if ((i + 1) % 100 === 0) {
      console.log(`\n--- Progress: ${i + 1}/${providers.length} ---`);
      console.log(`Street: ${stats.street}, Neighborhood: ${stats.neighborhood}, Sector: ${stats.sector}, City: ${stats.city}, County: ${stats.county}, Failed: ${stats.failed}\n`);
    }
  }

  console.log('\n=== Geocoding Complete ===');
  console.log(`Total: ${providers.length}`);
  console.log(`Street-level: ${stats.street}`);
  console.log(`Neighborhood: ${stats.neighborhood}`);
  console.log(`Sector: ${stats.sector}`);
  console.log(`City center: ${stats.city}`);
  console.log(`County center: ${stats.county}`);
  console.log(`Failed: ${stats.failed}`);
}

main().catch(console.error);
