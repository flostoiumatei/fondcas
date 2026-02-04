import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function analyzeDataQuality() {
  console.log('=== Database Quality Analysis ===\n');

  // Get all locations
  const { data: locations, error } = await supabase
    .from('locations')
    .select(`
      id, name, address, city, lat, lng,
      organization:organizations(legal_name, network_brand)
    `);

  if (error) {
    console.error('Error:', error);
    return;
  }

  const total = locations.length;
  console.log(`Total locations: ${total}\n`);

  // Issue 1: Names that are legal entity names (contain SRL, S.R.L., SA, etc.)
  const legalSuffixes = /\b(S\.?R\.?L\.?|S\.?A\.?|S\.?C\.?|S\.?N\.?C\.?|P\.?F\.?A\.?|I\.?I\.?|C\.?M\.?I\.?)\b/i;
  const legalNames = locations.filter(l => legalSuffixes.test(l.name));
  console.log(`1. Legal entity names (SRL, SA, etc.): ${legalNames.length} (${(legalNames.length/total*100).toFixed(1)}%)`);

  // How many have network_brand that could be used instead?
  const withBrand = legalNames.filter(l => l.organization?.network_brand);
  console.log(`   - Have network_brand available: ${withBrand.length}`);

  // Issue 2: Missing address
  const noAddress = locations.filter(l => !l.address);
  console.log(`\n2. Missing address: ${noAddress.length} (${(noAddress.length/total*100).toFixed(1)}%)`);

  // Issue 3: Address is just city name
  const addressIsCity = locations.filter(l =>
    l.address && l.city &&
    l.address.toLowerCase().trim() === l.city.toLowerCase().trim()
  );
  console.log(`\n3. Address is just city name: ${addressIsCity.length} (${(addressIsCity.length/total*100).toFixed(1)}%)`);

  // Issue 4: Missing city
  const noCity = locations.filter(l => !l.city);
  console.log(`\n4. Missing city: ${noCity.length} (${(noCity.length/total*100).toFixed(1)}%)`);

  // Issue 5: Missing coordinates
  const noCoords = locations.filter(l => !l.lat || !l.lng);
  console.log(`\n5. Missing coordinates: ${noCoords.length} (${(noCoords.length/total*100).toFixed(1)}%)`);

  // Issue 6: Short/incomplete addresses
  const shortAddress = locations.filter(l => l.address && l.address.length < 15 && l.address !== l.city);
  console.log(`\n6. Short addresses (<15 chars): ${shortAddress.length} (${(shortAddress.length/total*100).toFixed(1)}%)`);

  // Issue 7: All caps names
  const allCapsNames = locations.filter(l => l.name === l.name.toUpperCase() && l.name.length > 10);
  console.log(`\n7. ALL CAPS names: ${allCapsNames.length} (${(allCapsNames.length/total*100).toFixed(1)}%)`);

  // Summary
  console.log('\n=== Summary ===');
  const goodLocations = locations.filter(l =>
    l.address &&
    l.city &&
    l.lat && l.lng &&
    l.address.length >= 15 &&
    l.address.toLowerCase() !== l.city?.toLowerCase()
  );
  console.log(`Locations with complete data: ${goodLocations.length} (${(goodLocations.length/total*100).toFixed(1)}%)`);
  console.log(`Locations needing fixes: ${total - goodLocations.length} (${((total - goodLocations.length)/total*100).toFixed(1)}%)`);

  // Sample of issues
  console.log('\n=== Sample Issues ===\n');

  console.log('Legal names without brand:');
  legalNames.filter(l => !l.organization?.network_brand).slice(0, 5).forEach(l => {
    console.log(`  - ${l.name}`);
  });

  console.log('\nMissing address (with city):');
  noAddress.filter(l => l.city).slice(0, 5).forEach(l => {
    console.log(`  - ${l.name} (${l.city})`);
  });

  console.log('\nAddress is just city:');
  addressIsCity.slice(0, 5).forEach(l => {
    console.log(`  - ${l.name}: "${l.address}"`);
  });
}

analyzeDataQuality();
