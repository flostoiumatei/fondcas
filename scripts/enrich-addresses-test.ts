import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Need service role to update
);

// Use Nominatim (free) for geocoding
async function searchNominatim(query: string): Promise<{
  address: string;
  lat: number;
  lng: number;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ro&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FondCAS/1.0 (healthcare provider finder)',
      },
    });

    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      const addressParts = result.address;

      // Build a readable address
      let address = '';
      if (addressParts.road) address += addressParts.road;
      if (addressParts.house_number) address += ' ' + addressParts.house_number;
      if (addressParts.suburb) address += ', ' + addressParts.suburb;
      if (addressParts.city || addressParts.town || addressParts.municipality) {
        address += ', ' + (addressParts.city || addressParts.town || addressParts.municipality);
      }

      return {
        address: address || result.display_name,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
      };
    }

    return null;
  } catch (error) {
    console.error('Nominatim error:', error);
    return null;
  }
}

// Wait to respect Nominatim rate limits (1 req/sec)
function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrichAddresses() {
  // Get 5 locations without proper addresses to test
  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, address, city, organization:organizations(legal_name, network_brand)')
    .or('address.is.null,lat.is.null')
    .not('city', 'is', null)
    .limit(5);

  if (error) {
    console.error('Error fetching locations:', error);
    return;
  }

  console.log(`Found ${locations.length} locations to enrich\n`);

  for (const loc of locations) {
    console.log(`\n--- Processing: ${loc.name} ---`);
    console.log(`Current address: ${loc.address || 'N/A'}`);
    console.log(`City: ${loc.city}`);

    // Build search query
    const brandName = loc.organization?.network_brand || loc.organization?.legal_name || '';
    const searchQueries = [
      `${loc.name}, ${loc.city}, Romania`,
      `${brandName} ${loc.city}, Romania`,
    ];

    let result = null;

    for (const query of searchQueries) {
      console.log(`Searching: "${query}"`);
      result = await searchNominatim(query);

      if (result) {
        console.log(`✓ Found: ${result.address}`);
        console.log(`  Coords: ${result.lat}, ${result.lng}`);
        break;
      }

      await wait(1100); // Respect rate limit
    }

    if (result) {
      // Update the database
      const { error: updateError } = await supabase
        .from('locations')
        .update({
          address: result.address,
          lat: result.lat,
          lng: result.lng,
        })
        .eq('id', loc.id);

      if (updateError) {
        console.log(`✗ Failed to update: ${updateError.message}`);
      } else {
        console.log(`✓ Updated successfully!`);
      }
    } else {
      console.log(`✗ No results found`);
    }

    await wait(1100);
  }

  console.log('\n--- Done ---');
}

enrichAddresses();
