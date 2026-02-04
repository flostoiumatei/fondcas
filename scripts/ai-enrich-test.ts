/**
 * AI Enrich - TEST VERSION (10 organizations only)
 * Tests the safe enrichment process before full run
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const DATA_DIR = path.join(process.cwd(), 'data', 'v2');
const TEST_DIR = path.join(DATA_DIR, 'test');
const LOCK_FILE = path.join(TEST_DIR, 'test.lock');
const OUTPUT_FILE = path.join(TEST_DIR, 'test_enriched.json');
const BACKUP_DIR = path.join(TEST_DIR, 'backups');

const TEST_LIMIT = 10; // Only process 10 organizations
const BATCH_SIZE = 5;

interface Organization {
  cui?: string;
  legalName: string;
  providerType: string;
  specialties: string[];
  primaryLocation: {
    address?: string;
    city?: string;
    county: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  [key: string]: any;
}

interface EnrichedOrganization extends Organization {
  isNetwork: boolean;
  networkBrand?: string;
  networkWebsite?: string;
  aiConfidence: number;
  aiReasoning: string;
  discoveredLocations: any[];
  aiEnrichedAt: string;
}

function log(msg: string) {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${msg}`);
}

function acquireLock(): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    console.error('Lock file exists! Delete it if no other process is running.');
    return false;
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }));
  return true;
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

function safeWrite(file: string, data: any): boolean {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    const verify = JSON.parse(fs.readFileSync(tmp, 'utf-8'));
    if (Array.isArray(data) && verify.length !== data.length) throw new Error('Verify failed');
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    return false;
  }
}

function createBackup(data: EnrichedOrganization[]): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `test_${ts}.json`);
  if (safeWrite(backupFile, data)) {
    log(`Backup: ${path.basename(backupFile)} (${data.length} orgs)`);
    return backupFile;
  }
  throw new Error('Backup failed!');
}

async function enrichOrg(anthropic: Anthropic, org: Organization): Promise<EnrichedOrganization> {
  const prompt = `Analizează această organizație medicală din România și determină dacă este o rețea cu multiple locații.

DATE:
- Denumire: ${org.legalName}
- CUI: ${org.cui || 'necunoscut'}
- Adresă: ${org.primaryLocation.address || 'necunoscută'}
- Email: ${org.primaryLocation.email || 'necunoscut'}

Răspunde în JSON:
{
  "isNetwork": true/false,
  "networkBrand": "brand sau null",
  "confidence": 0-100,
  "reasoning": "explicație scurtă",
  "locations": []
}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) throw new Error('No JSON');

    const result = JSON.parse(json[0]);

    return {
      ...org,
      isNetwork: result.isNetwork === true,
      networkBrand: result.networkBrand || null,
      networkWebsite: null,
      aiConfidence: result.confidence || 50,
      aiReasoning: result.reasoning || '',
      discoveredLocations: [{
        name: result.networkBrand || org.legalName,
        address: org.primaryLocation.address || '',
        city: org.primaryLocation.city || '',
        county: org.primaryLocation.county,
        confidence: 100,
      }],
      aiEnrichedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    return {
      ...org,
      isNetwork: false,
      networkBrand: null,
      networkWebsite: null,
      aiConfidence: 0,
      aiReasoning: `Error: ${e.message}`,
      discoveredLocations: [{
        name: org.legalName,
        address: org.primaryLocation.address || '',
        city: org.primaryLocation.city || '',
        county: org.primaryLocation.county,
        confidence: 100,
      }],
      aiEnrichedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     TEST RUN - 10 Organizations Only       ║');
  console.log('╚════════════════════════════════════════════╝\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set!');
    process.exit(1);
  }

  // Create directories
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  if (!acquireLock()) process.exit(1);

  process.on('exit', releaseLock);
  process.on('SIGINT', () => { releaseLock(); process.exit(1); });

  try {
    const orgs: Organization[] = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'organizations.json'), 'utf-8')
    );
    log(`Loaded ${orgs.length} total organizations`);
    log(`Testing with first ${TEST_LIMIT} organizations\n`);

    const testOrgs = orgs.slice(0, TEST_LIMIT);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const enriched: EnrichedOrganization[] = [];
    let networks = 0;

    // Process in batches
    for (let i = 0; i < testOrgs.length; i += BATCH_SIZE) {
      const batch = testOrgs.slice(i, i + BATCH_SIZE);
      log(`Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(TEST_LIMIT/BATCH_SIZE)}`);

      const results = await Promise.all(batch.map(async (org, idx) => {
        const name = org.legalName.substring(0, 35).padEnd(35);
        process.stdout.write(`  [${i + idx + 1}/${TEST_LIMIT}] ${name} `);

        const result = await enrichOrg(anthropic, org);

        if (result.aiConfidence === 0) {
          console.log('✗ ERROR');
        } else if (result.isNetwork) {
          console.log(`✓ NETWORK: ${result.networkBrand}`);
          networks++;
        } else {
          console.log('✓ single');
        }

        return result;
      }));

      enriched.push(...results);

      // Create backup after each batch
      createBackup(enriched);

      // Save main file
      if (!safeWrite(OUTPUT_FILE, enriched)) {
        throw new Error('Failed to save main output!');
      }
      log(`Saved: ${enriched.length} organizations\n`);

      // Small delay
      if (i + BATCH_SIZE < testOrgs.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('           TEST COMPLETE');
    console.log('═'.repeat(50));
    console.log(`  Processed:  ${enriched.length}`);
    console.log(`  Networks:   ${networks}`);
    console.log(`  Errors:     ${enriched.filter(e => e.aiConfidence === 0).length}`);
    console.log('═'.repeat(50));
    console.log(`\nOutput: ${OUTPUT_FILE}`);
    console.log(`Backups: ${BACKUP_DIR}`);

    // Verify final save
    const final = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    console.log(`\n✓ Verified: ${final.length} organizations saved correctly`);

  } finally {
    releaseLock();
  }
}

main().catch(e => { console.error('Fatal:', e); releaseLock(); process.exit(1); });
