import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Romanian cities for extraction
const ROMANIAN_CITIES = [
  'București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Craiova',
  'Brașov', 'Galați', 'Ploiești', 'Oradea', 'Brăila', 'Arad', 'Pitești',
  'Sibiu', 'Bacău', 'Târgu Mureș', 'Baia Mare', 'Buzău', 'Botoșani',
  'Satu Mare', 'Râmnicu Vâlcea', 'Drobeta-Turnu Severin', 'Suceava',
  'Piatra Neamț', 'Târgu Jiu', 'Târgoviște', 'Focșani', 'Bistrița',
  'Tulcea', 'Reșița', 'Slatina', 'Călărași', 'Alba Iulia', 'Giurgiu',
  'Deva', 'Hunedoara', 'Zalău', 'Sfântu Gheorghe', 'Vaslui', 'Roman',
  'Turda', 'Mediaș', 'Slobozia', 'Alexandria', 'Voluntari', 'Lugoj',
  'Medgidia', 'Onești', 'Miercurea Ciuc', 'Sector 1', 'Sector 2',
  'Sector 3', 'Sector 4', 'Sector 5', 'Sector 6'
];

// Step 1: Clean up name
function cleanName(name: string, networkBrand?: string): string {
  let cleaned = name;

  // Only use network brand if the current name is JUST a legal entity name
  // (e.g., "SC SANADOR SRL" → "SANADOR")
  // But NOT if the name contains location info (e.g., "Clinica SANADOR Victoriei" → keep it)
  if (networkBrand && networkBrand.length > 3) {
    // Check if name is basically just the legal entity version of the brand
    const nameWithoutLegal = name
      .replace(/^(S\.?C\.?|S\.?R\.?L\.?)\s*/gi, '')
      .replace(/\s*[-–]?\s*(S\.?R\.?L\.?|S\.?A\.?|S\.?C\.?|S\.?N\.?C\.?|P\.?F\.?A\.?|I\.?I\.?)\.?\s*$/gi, '')
      .trim();

    // If what remains is just the brand name (or very similar), use brand
    // Otherwise, the name has additional location/descriptive info we want to keep
    const brandNormalized = networkBrand.toLowerCase().replace(/\s+/g, '');
    const nameNormalized = nameWithoutLegal.toLowerCase().replace(/\s+/g, '');

    if (nameNormalized === brandNormalized ||
        nameNormalized.length <= brandNormalized.length + 3) {
      return networkBrand;
    }
    // Name has more info than just the brand - proceed with cleaning instead
  }

  // Remove legal suffixes
  cleaned = cleaned.replace(/\s*[-–]\s*(S\.?R\.?L\.?|S\.?A\.?|S\.?C\.?|S\.?N\.?C\.?|P\.?F\.?A\.?|I\.?I\.?)\s*$/gi, '');
  cleaned = cleaned.replace(/\s+(S\.?R\.?L\.?|S\.?A\.?|S\.?C\.?|S\.?N\.?C\.?|P\.?F\.?A\.?|I\.?I\.?)\s*$/gi, '');
  cleaned = cleaned.replace(/^(S\.?C\.?|S\.?R\.?L\.?)\s+/gi, '');

  // Convert ALL CAPS to Title Case
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 5) {
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map(word => {
        // Keep certain words lowercase
        if (['de', 'la', 'din', 'și', 'sau', 'cu', 'în', 'pe'].includes(word)) {
          return word;
        }
        // Keep roman numerals uppercase
        if (/^[ivxlcdm]+$/i.test(word)) {
          return word.toUpperCase();
        }
        // Capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  // Clean up CMI prefix
  cleaned = cleaned.replace(/^C\.?M\.?I\.?\s*/i, 'Cabinet Medical ');

  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Step 2: Extract city from address
function extractCity(address: string): string | null {
  if (!address) return null;

  const addressLower = address.toLowerCase();

  // Check for București sectors first
  if (addressLower.includes('bucurest') || addressLower.includes('sector')) {
    return 'București';
  }

  // Check for known cities
  for (const city of ROMANIAN_CITIES) {
    if (addressLower.includes(city.toLowerCase())) {
      return city;
    }
  }

  return null;
}

// Step 3: Geocode using Nominatim
async function geocode(query: string): Promise<{
  address: string;
  city: string;
  lat: number;
  lng: number;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ro&addressdetails=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'FondCAS/1.0' },
    });

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      const addr = result.address;

      let address = '';
      if (addr.road) {
        address = addr.road;
        if (addr.house_number) address += ' ' + addr.house_number;
      }
      if (addr.suburb) address += ', ' + addr.suburb;

      const city = addr.city || addr.town || addr.municipality || '';

      if (city) address += ', ' + city;

      return {
        address: address || result.display_name.split(',').slice(0, 3).join(','),
        city: city,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
      };
    }

    return null;
  } catch (error) {
    console.error('Geocode error:', error);
    return null;
  }
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fixDatabase(options: {
  dryRun?: boolean;
  limit?: number;
  fixNames?: boolean;
  fixCities?: boolean;
  geocode?: boolean;
}) {
  const { dryRun = true, limit = 50, fixNames = true, fixCities = true, geocode: doGeocode = false } = options;

  console.log('=== Database Fix ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit}`);
  console.log(`Fix names: ${fixNames}`);
  console.log(`Fix cities: ${fixCities}`);
  console.log(`Geocode: ${doGeocode}\n`);

  // Get locations that need fixing
  const { data: locations, error } = await supabase
    .from('locations')
    .select(`
      id, name, address, city, lat, lng,
      organization:organizations(legal_name, network_brand)
    `)
    .limit(limit);

  if (error) {
    console.error('Error:', error);
    return;
  }

  let namesFixes = 0;
  let cityFixes = 0;
  let geocodeFixes = 0;

  for (const loc of locations) {
    const updates: any = {};
    let changed = false;

    // Fix name
    if (fixNames) {
      const cleanedName = cleanName(loc.name, loc.organization?.network_brand);
      if (cleanedName !== loc.name) {
        updates.name = cleanedName;
        changed = true;
        namesFixes++;
      }
    }

    // Fix city
    if (fixCities && !loc.city && loc.address) {
      const extractedCity = extractCity(loc.address);
      if (extractedCity) {
        updates.city = extractedCity;
        changed = true;
        cityFixes++;
      }
    }

    // Geocode if needed
    if (doGeocode && (!loc.lat || !loc.lng) && loc.city) {
      const searchQuery = `${loc.name}, ${loc.city}, Romania`;
      console.log(`  Geocoding: ${searchQuery}`);

      const result = await geocode(searchQuery);
      if (result) {
        if (!loc.lat) updates.lat = result.lat;
        if (!loc.lng) updates.lng = result.lng;
        if (!loc.address || loc.address === loc.city) {
          updates.address = result.address;
        }
        if (!loc.city && result.city) {
          updates.city = result.city;
        }
        changed = true;
        geocodeFixes++;
      }

      await wait(1100); // Rate limit
    }

    if (changed) {
      console.log(`\n${loc.name}`);
      if (updates.name) console.log(`  Name: "${loc.name}" → "${updates.name}"`);
      if (updates.city) console.log(`  City: "${loc.city || 'N/A'}" → "${updates.city}"`);
      if (updates.lat) console.log(`  Coords: ${updates.lat}, ${updates.lng}`);
      if (updates.address) console.log(`  Address: "${updates.address}"`);

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('locations')
          .update(updates)
          .eq('id', loc.id);

        if (updateError) {
          console.log(`  ✗ Error: ${updateError.message}`);
        } else {
          console.log(`  ✓ Updated`);
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Names fixed: ${namesFixes}`);
  console.log(`Cities extracted: ${cityFixes}`);
  console.log(`Geocoded: ${geocodeFixes}`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: !args.includes('--live'),
  limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50'),
  fixNames: !args.includes('--no-names'),
  fixCities: !args.includes('--no-cities'),
  geocode: args.includes('--geocode'),
};

fixDatabase(options);
