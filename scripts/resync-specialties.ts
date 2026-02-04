/**
 * Re-sync specialties only
 *
 * Clears existing provider_specialties and specialties, then re-links
 * using the fixed sync logic.
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

// Specialty name normalizations to fix typos and variations
const SPECIALTY_NORMALIZATIONS: Record<string, string> = {
  // ORL variations
  'orl': 'otorinolaringologie',
  'otorinolanrigologie': 'otorinolaringologie',
  'oto-rino-laringologie': 'otorinolaringologie',
  // Dermatology variations
  'dermato-venerologie': 'dermatovenerologie',
  'dermato venerologie': 'dermatovenerologie',
  // Diabetes variations
  'diabet zaharat, nutritie si boli metabolice': 'diabet zaharat',
  // Obstetrics variations
  'obstetrica - ginecologie': 'obstetrica-ginecologie',
  'obstetrică-ginecologie': 'obstetrica-ginecologie',
  'ginecologie': 'obstetrica-ginecologie',
  // Internal medicine variations
  'medicina internă': 'medicina interna',
  // Surgery variations
  'chirurgie generalã': 'chirurgie generala',
  // Allergy variations
  'alergologie si imunologie clinica': 'alergologie',
  'alergologie şi imunologie clinică': 'alergologie',
};

function normalizeSpecialtyName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return SPECIALTY_NORMALIZATIONS[trimmed] || trimmed;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:'"()]/g, '')
    .replace(/\bs\.?c\.?\s*/gi, '')
    .replace(/\bs\.?r\.?l\.?\b/gi, 'srl')
    .replace(/\bs\.?a\.?\b/gi, 'sa')
    .trim();
}

function normalizeAddress(address: string | undefined): string | null {
  if (!address) return null;
  let normalized = address.toLowerCase()
    .replace(/\bbulevardul\b/g, 'bd')
    .replace(/\bb-dul\b/g, 'bd')
    .replace(/\bstrada\b/g, 'str')
    .replace(/\bsoseaua\b/g, 'sos')
    .replace(/\bnumar\b/g, 'nr')
    .replace(/\bsectorul?\b/g, 'sect')
    .replace(/[.,;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sectorMatch = normalized.match(/sect\s*(\d)/);
  const sector = sectorMatch ? sectorMatch[1] : '';
  const numberMatch = normalized.match(/nr\s*(\d+[a-z]?)/i);
  const streetNumber = numberMatch ? numberMatch[1] : '';
  const words = normalized.split(' ').filter(w =>
    w.length > 2 && !['str', 'bd', 'cal', 'sos', 'nr', 'sect', 'prel', 'al'].includes(w)
  );
  const streetName = words[0] || '';
  if (!streetName) return null;
  return `${streetName}-${streetNumber}-${sector}`.replace(/--+/g, '-').replace(/-$/, '');
}

async function main() {
  console.log('=== Re-syncing Specialties ===\n');

  // Step 1: Clear existing specialties data
  console.log('Step 1: Clearing existing specialty data...');
  await supabase.from('provider_specialties').delete().neq('specialty_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('specialties').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  Done');

  // Step 2: Load provider data
  console.log('\nStep 2: Loading provider data...');
  const allProvidersFile = path.join(DATA_DIR, 'all_providers.json');
  const providerDetails = JSON.parse(fs.readFileSync(allProvidersFile, 'utf-8'));
  const withSpecs = providerDetails.filter((p: any) => p.specialties && p.specialties.length > 0);
  console.log(`  Loaded ${providerDetails.length} providers, ${withSpecs.length} with specialties`);

  // Step 3: Load existing providers from DB
  console.log('\nStep 3: Loading existing providers from database...');
  const { data: dbProviders } = await supabase
    .from('providers')
    .select('id, name, address');

  console.log(`  Found ${dbProviders?.length} providers in database`);

  // Build index for matching
  const providerIndex = new Map<string, { id: string; name: string; address?: string; normalizedAddress: string | null }>();
  for (const p of dbProviders || []) {
    const key = normalizeName(p.name);
    const normalizedAddr = normalizeAddress(p.address);

    // Store with combined key if address exists
    if (normalizedAddr) {
      providerIndex.set(`${key}|${normalizedAddr}`, {
        id: p.id,
        name: p.name,
        address: p.address,
        normalizedAddress: normalizedAddr
      });
    }
    // Also store by name alone (for fallback matching)
    if (!providerIndex.has(key)) {
      providerIndex.set(key, {
        id: p.id,
        name: p.name,
        address: p.address,
        normalizedAddress: normalizedAddr
      });
    }
  }

  // Step 4: Create specialties and link to providers
  console.log('\nStep 4: Creating specialties and linking to providers...');

  const specialtyCache = new Map<string, string>(); // normalized name -> id
  let linkedProviders = 0;
  let linkedSpecs = 0;
  let notFound = 0;

  for (let i = 0; i < withSpecs.length; i++) {
    const provider = withSpecs[i];
    const normalizedName = normalizeName(provider.name);
    const normalizedAddr = normalizeAddress(provider.address);

    // Try to find by name + address first, then by name alone
    let match = normalizedAddr ? providerIndex.get(`${normalizedName}|${normalizedAddr}`) : null;
    if (!match) {
      match = providerIndex.get(normalizedName);
    }

    if (!match) {
      notFound++;
      if (notFound <= 10) {
        console.log(`  Not found: ${provider.name.substring(0, 50)}`);
      }
      continue;
    }

    linkedProviders++;

    // Link specialties
    for (const spec of provider.specialties) {
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
            console.error(`  Error creating specialty "${normalizedSpec}":`, error.message);
            continue;
          }
          specId = created.id;
        }
        specialtyCache.set(normalizedSpec, specId);
      }

      // Link
      const { error: linkError } = await supabase
        .from('provider_specialties')
        .upsert({ provider_id: match.id, specialty_id: specId }, { onConflict: 'provider_id,specialty_id' });

      if (!linkError) {
        linkedSpecs++;
      }
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${withSpecs.length} providers, ${linkedSpecs} links`);
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Providers matched: ${linkedProviders} (${notFound} not found in DB)`);
  console.log(`Specialty links created: ${linkedSpecs}`);
  console.log(`Unique specialties: ${specialtyCache.size}`);

  // Final stats
  const { count: dbSpecCount } = await supabase
    .from('specialties')
    .select('*', { count: 'exact', head: true });

  const { data: providerIds } = await supabase
    .from('provider_specialties')
    .select('provider_id');
  const uniqueWithSpecs = new Set(providerIds?.map(p => p.provider_id)).size;

  console.log(`\n--- Final Database Status ---`);
  console.log(`Providers with specialties: ${uniqueWithSpecs}`);
  console.log(`Total specialties: ${dbSpecCount}`);
}

main().catch(console.error);
