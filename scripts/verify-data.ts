import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Database Verification ===\n');

  // Total providers
  const { count: totalProviders } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true });

  // Providers with address
  const { count: withAddress } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('address', 'is', null);

  // Providers with phone
  const { count: withPhone } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null);

  // Providers with coordinates
  const { count: withCoords } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('lat', 'is', null);

  // Total specialties
  const { count: totalSpecs } = await supabase
    .from('specialties')
    .select('*', { count: 'exact', head: true });

  // Total provider-specialty links
  const { count: totalLinks } = await supabase
    .from('provider_specialties')
    .select('*', { count: 'exact', head: true });

  // Count unique providers with specialties using SQL
  const { data: uniqueCount } = await supabase
    .rpc('count_providers_with_specialties');

  // Fallback: paginate through all links to count unique providers
  let allProviderIds: string[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('provider_specialties')
      .select('provider_id')
      .range(offset, offset + limit - 1);

    if (error || !data || data.length === 0) break;
    allProviderIds.push(...data.map(d => d.provider_id));
    if (data.length < limit) break;
    offset += limit;
  }

  const uniqueWithSpecs = new Set(allProviderIds).size;

  console.log('Providers:', totalProviders);
  console.log('  With address:', withAddress, `(${Math.round((withAddress || 0) / (totalProviders || 1) * 100)}%)`);
  console.log('  With phone:', withPhone, `(${Math.round((withPhone || 0) / (totalProviders || 1) * 100)}%)`);
  console.log('  With coordinates:', withCoords, `(${Math.round((withCoords || 0) / (totalProviders || 1) * 100)}%)`);
  console.log('  With specialties:', uniqueWithSpecs, `(${Math.round(uniqueWithSpecs / (totalProviders || 1) * 100)}%)`);
  console.log('');
  console.log('Specialties:', totalSpecs);
  console.log('Provider-Specialty links:', totalLinks);

  // Sample some specialties
  const { data: sampleSpecs } = await supabase
    .from('specialties')
    .select('name')
    .limit(10);

  console.log('\nSample specialties:');
  for (const s of sampleSpecs || []) {
    console.log('  -', s.name);
  }

  // Check Ghencea
  const { data: ghencea } = await supabase
    .from('providers')
    .select(`
      id, name, address, phone, lat, lng, brand_name,
      specialties:provider_specialties(specialty:specialties(name))
    `)
    .ilike('address', '%ghencea%43%')
    .limit(1);

  if (ghencea?.[0]) {
    const g = ghencea[0];
    const specs = (g.specialties as any[])?.map(s => s.specialty?.name).filter(Boolean) || [];
    console.log('\n=== Ghencea Medical Center ===');
    console.log('  Name:', g.name);
    console.log('  Brand:', g.brand_name);
    console.log('  Address:', g.address?.substring(0, 50));
    console.log('  Phone:', g.phone);
    console.log('  Coordinates:', g.lat && g.lng ? `${g.lat}, ${g.lng}` : 'Pending geocoding');
    console.log('  Specialties:', specs.length);
    if (specs.length > 0) {
      console.log('    ', specs.join(', '));
    }
  }
}

main().catch(console.error);
