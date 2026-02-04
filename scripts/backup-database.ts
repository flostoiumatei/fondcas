import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(process.cwd(), 'data', 'v2', 'backups');

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('=== Database Backup ===\n');
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Backup directory: ${backupDir}\n`);

  // Backup locations table
  console.log('Backing up locations...');
  const { data: locations, error: locError } = await supabase
    .from('locations')
    .select('*');

  if (locError) {
    console.error('Error fetching locations:', locError);
    return;
  }

  const locationsFile = path.join(backupDir, `locations-${timestamp}.json`);
  fs.writeFileSync(locationsFile, JSON.stringify(locations, null, 2));
  console.log(`  ✓ ${locations.length} locations saved to ${path.basename(locationsFile)}`);

  // Backup organizations table
  console.log('Backing up organizations...');
  const { data: organizations, error: orgError } = await supabase
    .from('organizations')
    .select('*');

  if (orgError) {
    console.error('Error fetching organizations:', orgError);
    return;
  }

  const orgsFile = path.join(backupDir, `organizations-${timestamp}.json`);
  fs.writeFileSync(orgsFile, JSON.stringify(organizations, null, 2));
  console.log(`  ✓ ${organizations.length} organizations saved to ${path.basename(orgsFile)}`);

  // Backup specialties table
  console.log('Backing up specialties...');
  const { data: specialties, error: specError } = await supabase
    .from('specialties')
    .select('*');

  if (specError) {
    console.error('Error fetching specialties:', specError);
  } else {
    const specFile = path.join(backupDir, `specialties-${timestamp}.json`);
    fs.writeFileSync(specFile, JSON.stringify(specialties, null, 2));
    console.log(`  ✓ ${specialties.length} specialties saved to ${path.basename(specFile)}`);
  }

  // Backup location_specialties table
  console.log('Backing up location_specialties...');
  const { data: locSpecs, error: locSpecError } = await supabase
    .from('location_specialties')
    .select('*');

  if (locSpecError) {
    console.error('Error fetching location_specialties:', locSpecError);
  } else {
    const locSpecFile = path.join(backupDir, `location_specialties-${timestamp}.json`);
    fs.writeFileSync(locSpecFile, JSON.stringify(locSpecs, null, 2));
    console.log(`  ✓ ${locSpecs.length} location_specialties saved to ${path.basename(locSpecFile)}`);
  }

  console.log('\n=== Backup Complete ===');
  console.log(`All files saved to: ${backupDir}`);
}

backupDatabase();
