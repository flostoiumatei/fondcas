import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

async function simplifyAddress(address: string, city?: string | null): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Simplify this Romanian address for Google Maps search. Remove unnecessary details like "Camera", "Incaperea", "Spatiul comercial", apartment details (Ap.), building codes (Bl.), floor (Etaj), entrance (Scara). Keep only: street name, number, sector/city.

Input: ${address}${city ? `, ${city}` : ''}

Output only the simplified address, nothing else. Example format: "Bulevardul Theodor Pallady 6, Sector 3, București"`
      }
    ]
  });

  const response = message.content[0];
  if (response.type === 'text') {
    return response.text.trim();
  }
  return address;
}

async function simplifyAddresses(options: { limit: number; live: boolean; onlyComplex: boolean }) {
  const { limit, live, onlyComplex } = options;

  console.log('=== Address Simplification ===\n');
  console.log(`Mode: ${live ? 'LIVE (saving to DB)' : 'DRY RUN'}`);
  console.log(`Limit: ${limit}`);
  console.log(`Only complex: ${onlyComplex}\n`);

  // Get addresses
  let query = supabase
    .from('locations')
    .select('id, name, address, city, address_simple')
    .not('address', 'is', null)
    .is('address_simple', null) // Only process those without simplified address
    .order('id');

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: locations, error } = await query;

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Processing ${locations.length} addresses:\n`);

  let processed = 0;
  let simplified = 0;

  for (const loc of locations) {
    if (!loc.address) continue;

    // Skip simple addresses if onlyComplex is true
    if (onlyComplex) {
      const hasComplexDetails = /\b(bl\.|bloc|etaj|ap\.|apartament|camera|incaperea|spatiu|scara|parter)\b/i.test(loc.address);
      if (!hasComplexDetails) continue;
    }

    console.log(`📍 ${loc.name}`);
    console.log(`   Original:   ${loc.address}`);

    try {
      const simplifiedAddr = await simplifyAddress(loc.address, loc.city);
      console.log(`   Simplified: ${simplifiedAddr}`);

      if (live && simplifiedAddr !== loc.address) {
        const { error: updateError } = await supabase
          .from('locations')
          .update({ address_simple: simplifiedAddr })
          .eq('id', loc.id);

        if (updateError) {
          console.log(`   ✗ Error saving: ${updateError.message}`);
        } else {
          console.log(`   ✓ Saved`);
          simplified++;
        }
      }

      processed++;
      console.log();
    } catch (err) {
      console.log(`   Error: ${err}`);
      console.log();
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\n=== Summary ===');
  console.log(`Processed: ${processed}`);
  if (live) {
    console.log(`Simplified and saved: ${simplified}`);
  }
}

// Parse arguments
const args = process.argv.slice(2);
const options = {
  limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10'),
  live: args.includes('--live'),
  onlyComplex: args.includes('--complex'),
};

simplifyAddresses(options);
