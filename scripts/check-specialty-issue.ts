import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Check source data
  const providers = JSON.parse(fs.readFileSync('data/current/all_providers.json', 'utf-8'));
  const withSpecs = providers.filter((p: any) => p.specialties && p.specialties.length > 0);
  console.log('Source file:');
  console.log('  Total providers:', providers.length);
  console.log('  With specialties:', withSpecs.length);

  // Check DB
  const { count: totalProviders } = await supabase.from('providers').select('*', { count: 'exact', head: true });
  const { count: totalLinks } = await supabase.from('provider_specialties').select('*', { count: 'exact', head: true });

  // Get distinct providers with specialties
  const { data: withSpecsData } = await supabase
    .from('provider_specialties')
    .select('provider_id');

  const uniqueIds = new Set(withSpecsData?.map(p => p.provider_id) || []);

  console.log('\nDatabase:');
  console.log('  Total providers:', totalProviders);
  console.log('  Providers with specialties:', uniqueIds.size);
  console.log('  Total specialty links:', totalLinks);

  // Check sample provider - Anima on Ghencea
  const { data: ghencea } = await supabase
    .from('providers')
    .select('id, name, address')
    .ilike('address', '%Bulevardul Ghencea%43%');

  console.log('\nGhencea location:', ghencea?.length, 'records');
  for (const g of ghencea || []) {
    const { count } = await supabase
      .from('provider_specialties')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', g.id);
    console.log(' ', g.name.substring(0, 40), '- specialties:', count);
  }

  // Check a few Anima entries
  const { data: animas } = await supabase
    .from('providers')
    .select('id, name, address')
    .ilike('name', '%anima%');

  console.log('\nAnima providers:', animas?.length);
  for (const a of (animas || []).slice(0, 5)) {
    const { count } = await supabase
      .from('provider_specialties')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', a.id);
    console.log(' ', a.name.substring(0, 40), '|', (a.address || '').substring(0, 30), '- specs:', count);
  }
}

main().catch(console.error);
