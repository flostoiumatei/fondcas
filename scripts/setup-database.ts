/**
 * Database Setup Script
 *
 * Checks if tables exist and provides setup instructions if not.
 * Also initializes base data like counties.
 *
 * Usage: npx tsx scripts/setup-database.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Romanian counties data
const COUNTIES = [
  { code: 'B', name: 'București', cas_website: 'https://www.casmb.ro' },
  { code: 'AB', name: 'Alba', cas_website: 'https://www.casalba.ro' },
  { code: 'AR', name: 'Arad', cas_website: 'https://www.casarad.ro' },
  { code: 'AG', name: 'Argeș', cas_website: 'https://www.casag.ro' },
  { code: 'BC', name: 'Bacău', cas_website: 'https://www.casbacau.ro' },
  { code: 'BH', name: 'Bihor', cas_website: 'https://www.casbihor.ro' },
  { code: 'BN', name: 'Bistrița-Năsăud', cas_website: 'https://www.casbn.ro' },
  { code: 'BT', name: 'Botoșani', cas_website: 'https://www.casbotosani.ro' },
  { code: 'BV', name: 'Brașov', cas_website: 'https://www.casbv.ro' },
  { code: 'BR', name: 'Brăila', cas_website: 'https://www.casbraila.ro' },
  { code: 'BZ', name: 'Buzău', cas_website: 'https://www.casbuzau.ro' },
  { code: 'CS', name: 'Caraș-Severin', cas_website: 'https://www.cascs.ro' },
  { code: 'CL', name: 'Călărași', cas_website: 'https://www.cascalarasi.ro' },
  { code: 'CJ', name: 'Cluj', cas_website: 'https://www.cascluj.ro' },
  { code: 'CT', name: 'Constanța', cas_website: 'https://www.casconstanta.ro' },
  { code: 'CV', name: 'Covasna', cas_website: 'https://www.cascovasna.ro' },
  { code: 'DB', name: 'Dâmbovița', cas_website: 'https://www.casdambovita.ro' },
  { code: 'DJ', name: 'Dolj', cas_website: 'https://www.casdolj.ro' },
  { code: 'GL', name: 'Galați', cas_website: 'https://www.casgalati.ro' },
  { code: 'GR', name: 'Giurgiu', cas_website: 'https://www.casgiurgiu.ro' },
  { code: 'GJ', name: 'Gorj', cas_website: 'https://www.casgorj.ro' },
  { code: 'HR', name: 'Harghita', cas_website: 'https://www.casharghita.ro' },
  { code: 'HD', name: 'Hunedoara', cas_website: 'https://www.cashunedoara.ro' },
  { code: 'IL', name: 'Ialomița', cas_website: 'https://www.casialomita.ro' },
  { code: 'IS', name: 'Iași', cas_website: 'https://www.casiasi.ro' },
  { code: 'IF', name: 'Ilfov', cas_website: 'https://www.casilfov.ro' },
  { code: 'MM', name: 'Maramureș', cas_website: 'https://www.casmaramures.ro' },
  { code: 'MH', name: 'Mehedinți', cas_website: 'https://www.casmehedinti.ro' },
  { code: 'MS', name: 'Mureș', cas_website: 'https://www.casmures.ro' },
  { code: 'NT', name: 'Neamț', cas_website: 'https://www.casneamt.ro' },
  { code: 'OT', name: 'Olt', cas_website: 'https://www.casolt.ro' },
  { code: 'PH', name: 'Prahova', cas_website: 'https://www.casprahova.ro' },
  { code: 'SM', name: 'Satu Mare', cas_website: 'https://www.cassatumare.ro' },
  { code: 'SJ', name: 'Sălaj', cas_website: 'https://www.cassalaj.ro' },
  { code: 'SB', name: 'Sibiu', cas_website: 'https://www.cassibiu.ro' },
  { code: 'SV', name: 'Suceava', cas_website: 'https://www.cassuceava.ro' },
  { code: 'TR', name: 'Teleorman', cas_website: 'https://www.casteleorman.ro' },
  { code: 'TM', name: 'Timiș', cas_website: 'https://www.castimis.ro' },
  { code: 'TL', name: 'Tulcea', cas_website: 'https://www.castulcea.ro' },
  { code: 'VS', name: 'Vaslui', cas_website: 'https://www.casvaslui.ro' },
  { code: 'VL', name: 'Vâlcea', cas_website: 'https://www.casvalcea.ro' },
  { code: 'VN', name: 'Vrancea', cas_website: 'https://www.casvrancea.ro' }
];

async function checkTable(tableName: string): Promise<boolean> {
  const { error } = await supabase.from(tableName).select('id').limit(1);

  if (error) {
    // Table doesn't exist or permission error
    return false;
  }
  return true;
}

async function setupDatabase(): Promise<void> {
  console.log('Checking database setup...\n');
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  // Check required tables
  const requiredTables = [
    'counties',
    'providers',
    'specialties',
    'provider_specialties',
    'fund_allocations',
    'user_reports',
    'historical_fund_data',
    'provider_consumption_patterns'
  ];

  const tableStatus: Record<string, boolean> = {};

  for (const table of requiredTables) {
    const exists = await checkTable(table);
    tableStatus[table] = exists;
    console.log(`  ${exists ? '✓' : '✗'} ${table}`);
  }

  const missingTables = requiredTables.filter(t => !tableStatus[t]);

  if (missingTables.length > 0) {
    console.log('\n⚠️  MISSING TABLES DETECTED');
    console.log('\nPlease run the schema in Supabase SQL Editor:');
    console.log('1. Go to https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to SQL Editor (left sidebar)');
    console.log('4. Copy contents of supabase/schema.sql');
    console.log('5. Paste and click "Run"');
    console.log('\nThen run this script again.');
    process.exit(1);
  }

  console.log('\n✓ All tables exist!');

  // Check if counties are populated
  const { count } = await supabase
    .from('counties')
    .select('*', { count: 'exact', head: true });

  if (!count || count === 0) {
    console.log('\nPopulating counties...');

    const { error } = await supabase
      .from('counties')
      .upsert(COUNTIES, { onConflict: 'code' });

    if (error) {
      console.error('Error inserting counties:', error);
    } else {
      console.log(`✓ Inserted ${COUNTIES.length} counties`);
    }
  } else {
    console.log(`✓ Counties already populated (${count} records)`);
  }

  // Show database status
  const { count: providersCount } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true });

  const { count: fundsCount } = await supabase
    .from('fund_allocations')
    .select('*', { count: 'exact', head: true });

  console.log('\n--- Database Status ---');
  console.log(`Counties: ${count}`);
  console.log(`Providers: ${providersCount || 0}`);
  console.log(`Fund Allocations: ${fundsCount || 0}`);

  console.log('\n✓ Database is ready!');
}

// Run the script
setupDatabase().catch(console.error);
