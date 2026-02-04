/**
 * AI Enrich Organizations - SAFE VERSION
 *
 * Features:
 * - Lock file to prevent concurrent runs
 * - Timestamped backups after every batch
 * - Atomic writes (temp file + rename)
 * - Verification after each save
 * - Detailed logging
 *
 * Usage: npx tsx scripts/ai-enrich-safe.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Paths
const DATA_DIR = path.join(process.cwd(), 'data', 'v2');
const LOCK_FILE = path.join(DATA_DIR, 'enrichment.lock');
const MAIN_OUTPUT_FILE = path.join(DATA_DIR, 'enriched_organizations.json');
const CHECKPOINT_FILE = path.join(DATA_DIR, 'safe_checkpoint.json');
const LOG_FILE = path.join(DATA_DIR, 'safe_enrichment.log');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Configuration
const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const MAX_RETRIES = 3;

// Types
interface Organization {
  cui?: string;
  legalName: string;
  providerType: string;
  cnasContractNumber?: string;
  dataSource: string;
  dataSourceDate?: string;
  specialties: string[];
  primaryLocation: {
    address?: string;
    city?: string;
    county: string;
    phone?: string;
    email?: string;
    website?: string;
  };
}

interface DiscoveredLocation {
  name: string;
  address: string;
  city: string;
  county?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  confidence: number;
}

interface EnrichedOrganization extends Organization {
  isNetwork: boolean;
  networkBrand?: string;
  networkWebsite?: string;
  aiConfidence: number;
  aiReasoning: string;
  discoveredLocations: DiscoveredLocation[];
  aiEnrichedAt: string;
}

interface Checkpoint {
  lastProcessedIndex: number;
  enrichedCount: number;
  networksFound: number;
  totalLocations: number;
  lastBackupFile: string;
  lastUpdated: string;
}

// Logging
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  console.log(logLine);
  fs.appendFileSync(LOG_FILE, logLine + '\n');
}

function logError(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ERROR: ${message}`;
  console.error(logLine);
  fs.appendFileSync(LOG_FILE, logLine + '\n');
}

// Lock file management
function acquireLock(): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    const lockData = fs.readFileSync(LOCK_FILE, 'utf-8');
    logError(`Another process is running! Lock file exists: ${lockData}`);
    return false;
  }

  const lockInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    hostname: os.hostname(),
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lockInfo, null, 2));
  log(`Lock acquired: PID ${process.pid}`);
  return true;
}

function releaseLock(): void {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
    log('Lock released');
  }
}

// Safe file operations
function safeWriteJSON(filePath: string, data: any): boolean {
  const tempFile = filePath + '.tmp';

  try {
    // Write to temp file
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempFile, jsonStr);

    // Verify temp file
    const readBack = fs.readFileSync(tempFile, 'utf-8');
    const parsed = JSON.parse(readBack);

    if (Array.isArray(data) && Array.isArray(parsed)) {
      if (parsed.length !== data.length) {
        throw new Error(`Verification failed: wrote ${data.length} items but read back ${parsed.length}`);
      }
    }

    // Atomic rename
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempFile, filePath);

    return true;
  } catch (error) {
    logError(`Failed to write ${filePath}: ${error}`);
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    return false;
  }
}

function createBackup(data: EnrichedOrganization[]): string {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `enriched_${timestamp}.json`);

  if (safeWriteJSON(backupFile, data)) {
    log(`Backup created: ${backupFile} (${data.length} organizations)`);
    return backupFile;
  } else {
    throw new Error('Failed to create backup!');
  }
}

// Helper functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractDomainFromEmail(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!match) return null;
  const domain = match[1].toLowerCase();
  const freeEmailDomains = ['gmail.com', 'yahoo.com', 'yahoo.ro', 'hotmail.com', 'outlook.com', 'icloud.com', 'mail.com', 'protonmail.com'];
  if (freeEmailDomains.includes(domain)) return null;
  return domain;
}

async function fetchWebsiteContent(url: string, timeoutMs: number = 10000): Promise<string | null> {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const html = await response.text();

    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);
  } catch {
    return null;
  }
}

async function tryFetchWebsite(org: Organization): Promise<{ content: string; url: string } | null> {
  const urlsToTry: string[] = [];

  if (org.primaryLocation.website) {
    urlsToTry.push(org.primaryLocation.website);
  }

  if (org.primaryLocation.email) {
    const domain = extractDomainFromEmail(org.primaryLocation.email);
    if (domain) {
      urlsToTry.push(`https://${domain}`);
      urlsToTry.push(`https://www.${domain}`);
    }
  }

  for (const url of urlsToTry) {
    const content = await fetchWebsiteContent(url);
    if (content && content.length > 300) {
      return { content, url };
    }
  }

  return null;
}

// AI Enrichment
async function enrichOrganization(
  anthropic: Anthropic,
  org: Organization,
  retryCount: number = 0
): Promise<EnrichedOrganization> {
  const websiteResult = await tryFetchWebsite(org);
  const emailDomain = org.primaryLocation.email ? extractDomainFromEmail(org.primaryLocation.email) : null;

  const prompt = `Ești un expert în identificarea clinicilor și rețelelor medicale din România.

SARCINĂ: Analizează această organizație medicală și determină dacă este o rețea cu multiple locații sau o clinică individuală.

DATE OFICIALE CNAS:
- Denumire juridică: ${org.legalName}
- CUI: ${org.cui || 'necunoscut'}
- Tip furnizor: ${org.providerType}
- Specialități: ${org.specialties.join(', ') || 'nespecificate'}
- Adresă oficială: ${org.primaryLocation.address || 'necunoscută'}
- Oraș: ${org.primaryLocation.city || 'necunoscut'}
- Județ: ${org.primaryLocation.county}
- Telefon: ${org.primaryLocation.phone || 'necunoscut'}
- Email: ${org.primaryLocation.email || 'necunoscut'}
${emailDomain ? `- Domeniu email corporativ: ${emailDomain}` : ''}

${websiteResult ? `CONȚINUT WEBSITE (${websiteResult.url}):
${websiteResult.content.slice(0, 8000)}` : 'WEBSITE: Nu am putut accesa un website pentru această organizație.'}

INSTRUCȚIUNI:
1. Determină dacă aceasta este o REȚEA MEDICALĂ (are multiple puncte de lucru/clinici) sau o LOCAȚIE UNICĂ.
2. Identifică BRANDUL comercial (poate fi diferit de denumirea juridică).
3. Dacă este rețea, identifică TOATE locațiile cu adrese specifice.
4. Acordă un scor de încredere (0-100) bazat pe calitatea informațiilor.

INDICII pentru identificarea rețelelor:
- Prezența cuvintelor: "locații", "puncte de lucru", "clinici", "centre"
- Liste de adrese pe website
- Branduri cunoscute: MedLife, Regina Maria, Medicover, Sanador, etc.

INDICII pentru locații unice:
- CMI (Cabinet Medical Individual)
- O singură adresă menționată
- Nume de medic în denumire

Răspunde STRICT în format JSON (fără text suplimentar):
{
  "isNetwork": true/false,
  "networkBrand": "Numele brandului comercial sau null dacă e CMI/locație unică",
  "networkWebsite": "URL-ul principal al rețelei sau null",
  "confidence": 0-100,
  "reasoning": "Explicație concisă a deciziei (max 100 cuvinte)",
  "locations": [
    {
      "name": "Numele punctului de lucru",
      "address": "Adresa completă",
      "city": "Orașul",
      "county": "Județul (cod 2 litere: B, CJ, TM, etc.)",
      "phone": "Telefon sau null",
      "openingHours": "Program sau null",
      "confidence": 0-100
    }
  ]
}

IMPORTANT:
- Dacă NU e rețea, returnează un array "locations" GOL [].
- Pentru rețele, include DOAR locațiile despre care ai informații concrete.
- Nu inventa date. Dacă nu ești sigur, pune confidence scăzut.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    const enriched: EnrichedOrganization = {
      ...org,
      isNetwork: result.isNetwork === true,
      networkBrand: result.networkBrand || null,
      networkWebsite: result.networkWebsite || websiteResult?.url || null,
      aiConfidence: typeof result.confidence === 'number' ? result.confidence : 50,
      aiReasoning: result.reasoning || '',
      discoveredLocations: [],
      aiEnrichedAt: new Date().toISOString(),
    };

    if (result.isNetwork && Array.isArray(result.locations) && result.locations.length > 0) {
      enriched.discoveredLocations = result.locations.map((loc: any) => ({
        name: loc.name || enriched.networkBrand || org.legalName,
        address: loc.address || '',
        city: loc.city || '',
        county: loc.county || org.primaryLocation.county,
        phone: loc.phone || null,
        website: loc.website || enriched.networkWebsite || null,
        openingHours: loc.openingHours || null,
        confidence: typeof loc.confidence === 'number' ? loc.confidence : 70,
      }));
    }

    if (enriched.discoveredLocations.length === 0) {
      enriched.discoveredLocations.push({
        name: enriched.networkBrand || org.legalName,
        address: org.primaryLocation.address || '',
        city: org.primaryLocation.city || '',
        county: org.primaryLocation.county,
        phone: org.primaryLocation.phone || null,
        website: enriched.networkWebsite || org.primaryLocation.website || null,
        openingHours: null,
        confidence: 100,
      });
    }

    return enriched;
  } catch (error: any) {
    if (error?.status === 429 && retryCount < MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000;
      log(`Rate limited, waiting ${waitTime / 1000}s before retry...`);
      await sleep(waitTime);
      return enrichOrganization(anthropic, org, retryCount + 1);
    }

    return {
      ...org,
      isNetwork: false,
      networkBrand: null,
      networkWebsite: websiteResult?.url || null,
      aiConfidence: 0,
      aiReasoning: `Error: ${error?.message || error}`,
      discoveredLocations: [{
        name: org.legalName,
        address: org.primaryLocation.address || '',
        city: org.primaryLocation.city || '',
        county: org.primaryLocation.county,
        phone: org.primaryLocation.phone || null,
        website: org.primaryLocation.website || null,
        openingHours: null,
        confidence: 100,
      }],
      aiEnrichedAt: new Date().toISOString(),
    };
  }
}

// Main function
async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     AI Enrich Organizations - SAFE VERSION                   ║');
  console.log('║     With backups, locking, and verification                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize log
  fs.appendFileSync(LOG_FILE, '\n' + '='.repeat(60) + '\n');
  log('Starting safe enrichment process');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    logError('ANTHROPIC_API_KEY not set in .env.local');
    process.exit(1);
  }

  // Acquire lock
  if (!acquireLock()) {
    logError('Could not acquire lock. Another process may be running.');
    logError('If you are sure no other process is running, delete: ' + LOCK_FILE);
    process.exit(1);
  }

  // Setup cleanup on exit
  process.on('exit', () => releaseLock());
  process.on('SIGINT', () => { releaseLock(); process.exit(1); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(1); });
  process.on('uncaughtException', (err) => {
    logError(`Uncaught exception: ${err}`);
    releaseLock();
    process.exit(1);
  });

  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      log(`Created backup directory: ${BACKUP_DIR}`);
    }

    // Load organizations
    const orgsFile = path.join(DATA_DIR, 'organizations.json');
    const organizations: Organization[] = JSON.parse(fs.readFileSync(orgsFile, 'utf-8'));
    log(`Loaded ${organizations.length} organizations from source`);

    // Load checkpoint if exists
    let checkpoint: Checkpoint | null = null;
    let enrichedOrgs: EnrichedOrganization[] = [];
    let startIndex = 0;

    if (fs.existsSync(CHECKPOINT_FILE)) {
      checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
      log(`Found checkpoint: last processed index ${checkpoint!.lastProcessedIndex}`);

      // Load from last backup
      if (checkpoint!.lastBackupFile && fs.existsSync(checkpoint!.lastBackupFile)) {
        enrichedOrgs = JSON.parse(fs.readFileSync(checkpoint!.lastBackupFile, 'utf-8'));
        log(`Loaded ${enrichedOrgs.length} organizations from backup: ${checkpoint!.lastBackupFile}`);
        startIndex = checkpoint!.lastProcessedIndex + 1;
      }
    }

    // Build set of already processed CUIs/names
    const processedKeys = new Set(enrichedOrgs.map(e => e.cui || e.legalName));

    // Filter what still needs processing
    const toProcess: { org: Organization; index: number }[] = [];
    for (let i = startIndex; i < organizations.length; i++) {
      const org = organizations[i];
      if (!processedKeys.has(org.cui || org.legalName)) {
        toProcess.push({ org, index: i });
      }
    }

    log(`Organizations to process: ${toProcess.length}`);

    if (toProcess.length === 0) {
      log('All organizations already enriched!');
      releaseLock();
      return;
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Stats
    let networksFound = enrichedOrgs.filter(e => e.isNetwork).length;
    let totalLocations = enrichedOrgs.reduce((sum, e) => sum + e.discoveredLocations.length, 0);
    let errors = 0;

    log(`Starting batch processing (batch size: ${BATCH_SIZE})`);

    // Process in batches
    const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const batchStart = batchNum * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, toProcess.length);
      const batch = toProcess.slice(batchStart, batchEnd);

      const lastOrgIndex = batch[batch.length - 1].index;
      log(`Batch ${batchNum + 1}/${totalBatches} (orgs ${batch[0].index + 1}-${lastOrgIndex + 1} of ${organizations.length})`);

      // Process batch concurrently
      const batchPromises = batch.map(async ({ org, index }) => {
        const orgName = org.legalName.substring(0, 40).padEnd(40);
        process.stdout.write(`  [${index + 1}] ${orgName} `);

        const enriched = await enrichOrganization(anthropic, org);

        if (enriched.aiConfidence === 0) {
          console.log('✗ ERROR');
          errors++;
        } else if (enriched.isNetwork) {
          console.log(`✓ NETWORK: ${enriched.networkBrand} (${enriched.discoveredLocations.length} locs)`);
          networksFound++;
        } else {
          console.log(`✓ ${enriched.networkBrand || 'single'}`);
        }

        totalLocations += enriched.discoveredLocations.length;
        return { enriched, index };
      });

      const batchResults = await Promise.all(batchPromises);

      // Add results to enriched list
      for (const { enriched } of batchResults) {
        const existingIdx = enrichedOrgs.findIndex(e =>
          (e.cui && e.cui === enriched.cui) || e.legalName === enriched.legalName
        );
        if (existingIdx >= 0) {
          enrichedOrgs[existingIdx] = enriched;
        } else {
          enrichedOrgs.push(enriched);
        }
      }

      // Create backup after each batch
      const backupFile = createBackup(enrichedOrgs);

      // Update checkpoint
      const newCheckpoint: Checkpoint = {
        lastProcessedIndex: lastOrgIndex,
        enrichedCount: enrichedOrgs.length,
        networksFound,
        totalLocations,
        lastBackupFile: backupFile,
        lastUpdated: new Date().toISOString(),
      };

      if (!safeWriteJSON(CHECKPOINT_FILE, newCheckpoint)) {
        throw new Error('Failed to save checkpoint!');
      }

      // Also update main output file
      if (!safeWriteJSON(MAIN_OUTPUT_FILE, enrichedOrgs)) {
        log('Warning: Failed to update main output file, but backup exists');
      }

      log(`Batch ${batchNum + 1} complete: ${enrichedOrgs.length} total, backup: ${path.basename(backupFile)}`);

      // Delay between batches
      if (batchNum < totalBatches - 1) {
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('                    ENRICHMENT COMPLETE');
    console.log('═'.repeat(60));
    console.log(`  Total organizations:  ${enrichedOrgs.length}`);
    console.log(`  Networks identified:  ${networksFound}`);
    console.log(`  Total locations:      ${totalLocations}`);
    console.log(`  Errors:               ${errors}`);
    console.log('═'.repeat(60));
    console.log(`\nMain output: ${MAIN_OUTPUT_FILE}`);
    console.log(`Backups in:  ${BACKUP_DIR}`);

    log('Enrichment completed successfully');

  } finally {
    releaseLock();
  }
}

main().catch(error => {
  logError(`Fatal error: ${error}`);
  releaseLock();
  process.exit(1);
});
