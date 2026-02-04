/**
 * Reset Database Script
 *
 * Clears all data and prepares for fresh sync.
 * WARNING: This deletes ALL data from the database!
 *
 * Usage: npx tsx scripts/reset-database.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetDatabase(): Promise<void> {
  console.log('=== DATABASE RESET ===\n');
  console.log('WARNING: This will delete ALL data!\n');

  try {
    // Step 1: Delete all data from tables (in correct order due to foreign keys)
    console.log('Step 1: Deleting all existing data...\n');

    const tables = [
      'user_reports',
      'fund_allocations',
      'provider_specialties',
      'historical_fund_data',
      'provider_consumption_patterns',
      'providers',
      'specialties',
    ];

    for (const table of tables) {
      console.log(`  Deleting from ${table}...`);
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) {
        console.log(`    Warning: ${error.message}`);
      } else {
        console.log(`    Done`);
      }
    }

    // Step 2: Check data_source_date column
    console.log('\nStep 2: Checking data_source_date column...');

    // Try to select from the column to check if it exists
    const { error: checkError } = await supabase
      .from('providers')
      .select('data_source_date')
      .limit(1);

    if (checkError && checkError.message.includes('data_source_date')) {
      console.log('  WARNING: Column does not exist. Run this SQL in Supabase SQL Editor:');
      console.log('\n  ALTER TABLE providers ADD COLUMN data_source_date DATE;\n');
      console.log('  Continuing anyway - sync will work without the column.');
    } else {
      console.log('  Column exists. Good!');
    }

    // Step 3: Verify counts
    console.log('\nStep 3: Verifying cleanup...\n');

    for (const table of tables) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      console.log(`  ${table}: ${count || 0} records`);
    }

    console.log('\n=== DATABASE RESET COMPLETE ===');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run sync:parse');
    console.log('  2. Run: npx tsx scripts/sync-to-db.ts');

  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  }
}

resetDatabase();
