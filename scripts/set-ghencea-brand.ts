import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Find Anima providers
  const { data: providers } = await supabase
    .from('providers')
    .select('id, name, address, brand_name')
    .or('address.ilike.%ghencea%,name.ilike.%anima%');

  console.log('Anima/Ghencea providers found:', providers?.length);
  for (const p of providers || []) {
    console.log('  -', p.name.substring(0, 50), '|', (p.address || '').substring(0, 40));

    // Update brand name for the Ghencea location
    if (p.address && p.address.toLowerCase().includes('ghencea')) {
      const { error } = await supabase
        .from('providers')
        .update({ brand_name: 'Ghencea Medical Center' })
        .eq('id', p.id);

      if (!error) {
        console.log('    -> Set brand_name to Ghencea Medical Center');
      }
    }
  }

  // Show fund allocations for this provider (main Ghencea location - Bulevardul Ghencea 43)
  const { data: ghenceaArr } = await supabase
    .from('providers')
    .select('id, name, address')
    .ilike('address', '%Bulevardul Ghencea%43%')
    .limit(1);

  const ghencea = ghenceaArr?.[0];

  if (ghencea) {
    const { data: funds } = await supabase
      .from('fund_allocations')
      .select('*')
      .eq('provider_id', ghencea.id);

    console.log('\nGhencea fund allocations:', funds?.length);
    for (const f of funds || []) {
      console.log(`  - ${f.service_type}: ${f.allocated_amount?.toLocaleString()} RON (${f.period_month}/${f.period_year})`);
    }

    // Show specialties
    const { data: specs } = await supabase
      .from('provider_specialties')
      .select('specialty:specialties(name)')
      .eq('provider_id', ghencea.id);

    console.log('\nGhencea specialties:', specs?.length);
    for (const s of specs || []) {
      console.log(`  - ${(s.specialty as any)?.name}`);
    }
  }
}

main().catch(console.error);
