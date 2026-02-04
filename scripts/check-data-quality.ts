import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Data Quality Report ===\n');

  // Count providers
  const { count: totalProviders } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true });

  // Count providers with address
  const { count: withAddress } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('address', 'is', null);

  // Count providers with phone
  const { count: withPhone } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null);

  // Count providers with coordinates
  const { count: withCoords } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  // Count unique providers with specialties
  const { data: providerIds } = await supabase
    .from('provider_specialties')
    .select('provider_id');

  const uniqueWithSpecs = new Set(providerIds?.map(p => p.provider_id)).size;

  console.log('Providers:', totalProviders);
  console.log('  With address:', withAddress, `(${Math.round((withAddress || 0) / (totalProviders || 1) * 100)}%)`);
  console.log('  With phone:', withPhone, `(${Math.round((withPhone || 0) / (totalProviders || 1) * 100)}%)`);
  console.log('  With coordinates:', withCoords, `(${Math.round((withCoords || 0) / (totalProviders || 1) * 100)}%)`);
  console.log('  With specialties:', uniqueWithSpecs, `(${Math.round(uniqueWithSpecs / (totalProviders || 1) * 100)}%)`);

  // Count specialties
  const { count: totalSpecs } = await supabase
    .from('specialties')
    .select('*', { count: 'exact', head: true });

  const { count: totalLinks } = await supabase
    .from('provider_specialties')
    .select('*', { count: 'exact', head: true });

  console.log('\nSpecialties:', totalSpecs);
  console.log('Provider-Specialty links:', totalLinks);

  // Sample specialties
  const { data: sampleSpecs } = await supabase
    .from('specialties')
    .select('name')
    .limit(15);

  console.log('\nSample specialties (Romanian):');
  for (const s of sampleSpecs || []) {
    console.log('  -', s.name);
  }

  // Check Ghencea specifically
  const { data: ghencea } = await supabase
    .from('providers')
    .select(`
      id, name, address, phone, lat, lng, brand_name,
      specialties:provider_specialties(specialty:specialties(name))
    `)
    .ilike('address', '%Bulevardul Ghencea%43%')
    .limit(1);

  if (ghencea?.[0]) {
    const p = ghencea[0];
    const specNames = (p.specialties as any[])?.map((s: any) => s.specialty?.name).filter(Boolean) || [];
    console.log('\n=== Ghencea Medical Center ===');
    console.log('  Name:', p.name);
    console.log('  Brand:', p.brand_name);
    console.log('  Address:', p.address?.substring(0, 60));
    console.log('  Phone:', p.phone);
    console.log('  Coordinates:', p.lat && p.lng ? `${p.lat}, ${p.lng}` : 'Missing');
    console.log('  Specialties:', specNames.length, specNames.length > 0 ? `(${specNames.join(', ')})` : '');
  }
}

main().catch(console.error);
