import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkAddresses() {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, address, city, lat, lng')
    .limit(30);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Sample addresses:\n');
  data.forEach((loc, i) => {
    console.log(`[${i+1}] ${loc.name}`);
    console.log(`    Address: ${loc.address || 'N/A'}`);
    console.log(`    City: ${loc.city || 'N/A'}`);
    console.log(`    Coords: ${loc.lat || 'N/A'}, ${loc.lng || 'N/A'}`);
    console.log('');
  });

  // Check for common issues
  const issues = {
    noAddress: data.filter(l => !l.address).length,
    noCity: data.filter(l => !l.city).length,
    noCoords: data.filter(l => !l.lat || !l.lng).length,
    shortAddress: data.filter(l => l.address && l.address.length < 10).length,
  };

  console.log('\n--- Issues Summary ---');
  console.log(`No address: ${issues.noAddress}/${data.length}`);
  console.log(`No city: ${issues.noCity}/${data.length}`);
  console.log(`No coordinates: ${issues.noCoords}/${data.length}`);
  console.log(`Short address (<10 chars): ${issues.shortAddress}/${data.length}`);
}

checkAddresses();
