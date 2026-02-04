import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Removing Fund Data ===\n');

  // Delete fund allocations
  const { error: e1 } = await supabase.from('fund_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('fund_allocations:', e1 ? 'Error: ' + e1.message : 'Deleted');

  // Delete historical fund data
  const { error: e2 } = await supabase.from('historical_fund_data').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('historical_fund_data:', e2 ? 'Error: ' + e2.message : 'Deleted');

  // Delete consumption patterns
  const { error: e3 } = await supabase.from('provider_consumption_patterns').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('provider_consumption_patterns:', e3 ? 'Error: ' + e3.message : 'Deleted');

  // Delete user reports
  const { error: e4 } = await supabase.from('user_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('user_reports:', e4 ? 'Error: ' + e4.message : 'Deleted');

  console.log('\n=== Fund Data Removed ===');

  // Check current state
  const { count: providers } = await supabase.from('providers').select('*', { count: 'exact', head: true });
  const { count: specs } = await supabase.from('specialties').select('*', { count: 'exact', head: true });
  const { count: links } = await supabase.from('provider_specialties').select('*', { count: 'exact', head: true });

  console.log('\nCurrent data:');
  console.log('  Providers:', providers);
  console.log('  Specialties:', specs);
  console.log('  Provider-Specialty links:', links);

  // Check providers without specialties
  const { data: noSpecs } = await supabase
    .from('providers')
    .select('id, name')
    .not('id', 'in', supabase.from('provider_specialties').select('provider_id'));

  // Let's check differently - get providers and count their specialties
  const { data: sampleProviders } = await supabase
    .from('providers')
    .select(`
      id,
      name,
      address,
      phone,
      lat,
      lng,
      specialties:provider_specialties(specialty:specialties(name))
    `)
    .limit(5);

  console.log('\nSample providers with their data:');
  for (const p of sampleProviders || []) {
    const specNames = (p.specialties as any[])?.map((s: any) => s.specialty?.name).filter(Boolean) || [];
    console.log(`\n  ${p.name.substring(0, 50)}`);
    console.log(`    Address: ${p.address ? 'Yes' : 'No'}`);
    console.log(`    Phone: ${p.phone || 'No'}`);
    console.log(`    Coordinates: ${p.lat && p.lng ? 'Yes' : 'No'}`);
    console.log(`    Specialties: ${specNames.length} (${specNames.slice(0, 3).join(', ')}${specNames.length > 3 ? '...' : ''})`);
  }
}

main().catch(console.error);
