/**
 * Full Database Re-sync
 *
 * Clears all providers and specialties, then re-syncs everything
 * ensuring each location is treated as a separate provider.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATA_DIR = path.join(process.cwd(), 'data', 'current');

// Specialty normalizations
const SPECIALTY_NORMALIZATIONS: Record<string, string> = {
  'orl': 'otorinolaringologie',
  'otorinolanrigologie': 'otorinolaringologie',
  'oto-rino-laringologie': 'otorinolaringologie',
  'dermato-venerologie': 'dermatovenerologie',
  'dermato venerologie': 'dermatovenerologie',
  'diabet zaharat, nutritie si boli metabolice': 'diabet zaharat',
  'obstetrica - ginecologie': 'obstetrica-ginecologie',
  'obstetrică-ginecologie': 'obstetrica-ginecologie',
  'ginecologie': 'obstetrica-ginecologie',
  'medicina internă': 'medicina interna',
  'chirurgie generalã': 'chirurgie generala',
  'alergologie si imunologie clinica': 'alergologie',
  'alergologie şi imunologie clinică': 'alergologie',
};

function normalizeSpecialtyName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return SPECIALTY_NORMALIZATIONS[trimmed] || trimmed;
}

async function getBucurestiCountyId(): Promise<string | null> {
  const { data } = await supabase
    .from('counties')
    .select('id')
    .eq('code', 'B')
    .single();
  return data?.id || null;
}

async function main() {
  console.log('=== Full Database Re-sync ===\n');

  // Step 1: Clear all data
  console.log('Step 1: Clearing database...');
  await supabase.from('provider_specialties').delete().neq('specialty_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('specialties').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('providers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  Done\n');

  // Step 2: Load provider data
  console.log('Step 2: Loading provider data...');
  const allProvidersFile = path.join(DATA_DIR, 'all_providers.json');
  const providers = JSON.parse(fs.readFileSync(allProvidersFile, 'utf-8'));
  console.log(`  Loaded ${providers.length} providers from source file\n`);

  // Step 3: Get county ID
  const countyId = await getBucurestiCountyId();
  if (!countyId) {
    console.error('București county not found!');
    process.exit(1);
  }

  // Step 4: Create all providers
  console.log('Step 3: Creating providers...');
  let created = 0;
  let errors = 0;
  const providerDbIds: Map<number, string> = new Map(); // source index -> db id

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];

    try {
      const { data: newProvider, error } = await supabase
        .from('providers')
        .insert({
          name: p.name,
          provider_type: p.providerType || 'clinic',
          county_id: countyId,
          cui: p.cui,
          email: p.email,
          phone: p.phone,
          address: p.address,
          city: p.city || 'București',
          website: p.website,
          data_source: p.dataSource,
          last_synced_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) {
        errors++;
        if (errors <= 10) console.log(`  Error: ${p.name.substring(0, 50)} - ${error.message}`);
        continue;
      }

      providerDbIds.set(i, newProvider.id);
      created++;

      if ((i + 1) % 200 === 0) {
        console.log(`  Progress: ${i + 1}/${providers.length}`);
      }
    } catch (e) {
      errors++;
    }
  }

  console.log(`  Created ${created} providers (${errors} errors)\n`);

  // Step 5: Create specialties and link to providers
  console.log('Step 4: Linking specialties...');
  const specialtyCache = new Map<string, string>();
  let linkedSpecs = 0;
  let providersWithSpecs = 0;

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const dbId = providerDbIds.get(i);
    if (!dbId) continue;

    if (!p.specialties || p.specialties.length === 0) continue;

    providersWithSpecs++;

    for (const spec of p.specialties) {
      const normalizedSpec = normalizeSpecialtyName(spec);

      let specId = specialtyCache.get(normalizedSpec);
      if (!specId) {
        // Check if exists
        const { data: existing } = await supabase
          .from('specialties')
          .select('id')
          .ilike('name', normalizedSpec)
          .maybeSingle();

        if (existing) {
          specId = existing.id;
        } else {
          // Create
          const { data: created, error } = await supabase
            .from('specialties')
            .insert({ name: normalizedSpec, category: 'clinical' })
            .select('id')
            .single();

          if (error) {
            continue;
          }
          specId = created.id;
        }
        specialtyCache.set(normalizedSpec, specId);
      }

      // Link
      const { error: linkError } = await supabase
        .from('provider_specialties')
        .upsert({ provider_id: dbId, specialty_id: specId }, { onConflict: 'provider_id,specialty_id' });

      if (!linkError) {
        linkedSpecs++;
      }
    }

    if (providersWithSpecs % 100 === 0) {
      console.log(`  Progress: ${providersWithSpecs} providers, ${linkedSpecs} links`);
    }
  }

  console.log(`  Linked ${linkedSpecs} specialties to ${providersWithSpecs} providers\n`);

  // Step 6: Final stats
  console.log('=== Final Database Stats ===');

  const { count: totalProviders } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true });

  const { count: withAddress } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('address', 'is', null);

  const { count: withPhone } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null);

  const { data: provIds } = await supabase
    .from('provider_specialties')
    .select('provider_id');
  const uniqueWithSpecs = new Set(provIds?.map(p => p.provider_id)).size;

  const { count: totalSpecs } = await supabase
    .from('specialties')
    .select('*', { count: 'exact', head: true });

  const { count: totalLinks } = await supabase
    .from('provider_specialties')
    .select('*', { count: 'exact', head: true });

  console.log(`Providers: ${totalProviders}`);
  console.log(`  With address: ${withAddress} (${Math.round((withAddress || 0) / (totalProviders || 1) * 100)}%)`);
  console.log(`  With phone: ${withPhone} (${Math.round((withPhone || 0) / (totalProviders || 1) * 100)}%)`);
  console.log(`  With specialties: ${uniqueWithSpecs} (${Math.round(uniqueWithSpecs / (totalProviders || 1) * 100)}%)`);
  console.log(`Specialties: ${totalSpecs}`);
  console.log(`Provider-Specialty links: ${totalLinks}`);

  console.log('\n=== Complete ===');
  console.log('Next step: Run npx tsx scripts/geocode-db.ts to add coordinates');
}

main().catch(console.error);
