/**
 * Geocode Addresses Script
 *
 * Reads parsed_providers.json and geocodes addresses using Nominatim (OpenStreetMap)
 * Rate limited to 1 request per second to respect Nominatim usage policy
 *
 * Usage: npm run sync:geocode
 */

import * as fs from 'fs';
import * as path from 'path';

interface ParsedProvider {
  cui?: string;
  name: string;
  providerType: string;
  address?: string;
  city?: string;
  county: string;
  phone?: string;
  email?: string;
  specialties: string[];
  contractNumber?: string;
  dataSource: string;
}

interface GeocodedProvider extends ParsedProvider {
  lat?: number;
  lng?: number;
  geocodedAt?: string;
  geocodeSource?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

const DATA_DIR = path.join(process.cwd(), 'data', 'current');
const INPUT_FILE = path.join(DATA_DIR, 'parsed_providers.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'geocoded_providers.json');

// Nominatim API endpoint
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Rate limiting: 1 request per second
const RATE_LIMIT_MS = 1100;

// Cache for geocoding results to avoid duplicate requests
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build a search query from provider address
 */
function buildSearchQuery(provider: ParsedProvider): string {
  const parts: string[] = [];

  if (provider.address) {
    // Clean up address
    let address = provider.address
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .trim();
    parts.push(address);
  }

  if (provider.city) {
    parts.push(provider.city);
  }

  // Add county for better accuracy
  if (provider.county) {
    // Map county codes to full names if needed
    const countyName = provider.county === 'B' ? 'București' : provider.county;
    parts.push(countyName);
  }

  parts.push('Romania');

  return parts.join(', ');
}

/**
 * Geocode an address using Nominatim
 */
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  // Check cache first
  if (geocodeCache.has(query)) {
    return geocodeCache.get(query) || null;
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      countrycodes: 'ro'
    });

    const url = `${NOMINATIM_URL}?${params}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FondCAS/1.0 (https://fondcas.ro; contact@fondcas.ro)'
      }
    });

    if (!response.ok) {
      console.error(`Nominatim error: ${response.status} ${response.statusText}`);
      return null;
    }

    const results: NominatimResult[] = await response.json();

    if (results.length === 0) {
      geocodeCache.set(query, null);
      return null;
    }

    const result = {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon)
    };

    geocodeCache.set(query, result);
    return result;

  } catch (error) {
    console.error(`Geocoding error for "${query}":`, error);
    return null;
  }
}

/**
 * Fallback geocoding using just city + county
 */
async function geocodeFallback(provider: ParsedProvider): Promise<{ lat: number; lng: number } | null> {
  const parts: string[] = [];

  if (provider.city) {
    parts.push(provider.city);
  }

  if (provider.county) {
    const countyName = provider.county === 'B' ? 'București' : provider.county;
    parts.push(countyName);
  }

  parts.push('Romania');

  const query = parts.join(', ');
  return geocodeAddress(query);
}

/**
 * Main geocoding function
 */
async function geocodeProviders(): Promise<void> {
  console.log('Starting geocoding process...');

  // Check if input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error('Please run npm run sync:parse first');
    process.exit(1);
  }

  // Load providers
  const providers: ParsedProvider[] = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`Loaded ${providers.length} providers`);

  // Load existing geocoded data if available (for resume capability)
  let geocodedProviders: GeocodedProvider[] = [];
  const existingCoords = new Map<string, { lat: number; lng: number }>();

  if (fs.existsSync(OUTPUT_FILE)) {
    geocodedProviders = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    for (const p of geocodedProviders) {
      if (p.lat && p.lng && (p.cui || p.name)) {
        existingCoords.set(p.cui || p.name, { lat: p.lat, lng: p.lng });
      }
    }
    console.log(`Loaded ${existingCoords.size} existing geocoded coordinates`);
  }

  // Geocode each provider
  const results: GeocodedProvider[] = [];
  let geocodedCount = 0;
  let cachedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const key = provider.cui || provider.name;

    // Check if already geocoded
    if (existingCoords.has(key)) {
      const coords = existingCoords.get(key)!;
      results.push({
        ...provider,
        lat: coords.lat,
        lng: coords.lng,
        geocodedAt: new Date().toISOString(),
        geocodeSource: 'cache'
      });
      cachedCount++;
      continue;
    }

    // Build search query
    const query = buildSearchQuery(provider);
    console.log(`[${i + 1}/${providers.length}] Geocoding: ${provider.name}`);
    console.log(`  Query: ${query}`);

    // Try full address first
    let coords = await geocodeAddress(query);

    // If failed, try fallback with just city
    if (!coords && (provider.city || provider.county)) {
      console.log('  Trying fallback (city only)...');
      await sleep(RATE_LIMIT_MS);
      coords = await geocodeFallback(provider);
    }

    if (coords) {
      results.push({
        ...provider,
        lat: coords.lat,
        lng: coords.lng,
        geocodedAt: new Date().toISOString(),
        geocodeSource: 'nominatim'
      });
      geocodedCount++;
      console.log(`  ✓ Found: ${coords.lat}, ${coords.lng}`);
    } else {
      results.push({
        ...provider,
        geocodedAt: new Date().toISOString(),
        geocodeSource: 'failed'
      });
      failedCount++;
      console.log(`  ✗ Not found`);
    }

    // Rate limiting
    await sleep(RATE_LIMIT_MS);

    // Save progress every 10 providers
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
      console.log(`Progress saved: ${results.length} providers`);
    }
  }

  // Save final results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log('\n=== Geocoding Complete ===');
  console.log(`Total providers: ${providers.length}`);
  console.log(`Newly geocoded: ${geocodedCount}`);
  console.log(`From cache: ${cachedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Success rate: ${Math.round(((geocodedCount + cachedCount) / providers.length) * 100)}%`);
  console.log(`\nOutput saved to: ${OUTPUT_FILE}`);
}

// Run the script
geocodeProviders().catch(console.error);
