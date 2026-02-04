/**
 * AI Enrich - TEST NETWORKS
 * Tests with known healthcare networks to verify multi-location detection
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const DATA_DIR = path.join(process.cwd(), 'data', 'v2');
const TEST_DIR = path.join(DATA_DIR, 'test');
const OUTPUT_FILE = path.join(TEST_DIR, 'test_networks.json');

// Test these specific indices (known networks)
const TEST_INDICES = [175, 181, 218, 250, 324, 386, 799]; // GRAL, Affidea, Sanador, Medicover, MedLife, Regina Maria, Synlab

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

function log(msg: string) {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${msg}`);
}

function extractDomain(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!match) return null;
  const domain = match[1].toLowerCase();
  const free = ['gmail.com', 'yahoo.com', 'yahoo.ro', 'hotmail.com', 'outlook.com'];
  return free.includes(domain) ? null : domain;
}

async function fetchWebsite(url: string): Promise<string | null> {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(fullUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const html = await res.text();

    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000);
  } catch {
    return null;
  }
}

async function tryFetchWebsite(org: Organization): Promise<{ content: string; url: string } | null> {
  const urls: string[] = [];

  if (org.primaryLocation.website) urls.push(org.primaryLocation.website);
  if (org.primaryLocation.email) {
    const domain = extractDomain(org.primaryLocation.email);
    if (domain) {
      urls.push(`https://${domain}`);
      urls.push(`https://www.${domain}`);
    }
  }

  for (const url of urls) {
    const content = await fetchWebsite(url);
    if (content && content.length > 500) {
      return { content, url };
    }
  }
  return null;
}

async function enrichOrg(anthropic: Anthropic, org: Organization): Promise<EnrichedOrganization> {
  const website = await tryFetchWebsite(org);
  const emailDomain = org.primaryLocation.email ? extractDomain(org.primaryLocation.email) : null;

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

${website ? `CONȚINUT WEBSITE (${website.url}):
${website.content.slice(0, 10000)}` : 'WEBSITE: Nu am putut accesa un website pentru această organizație.'}

INSTRUCȚIUNI:
1. Determină dacă aceasta este o REȚEA MEDICALĂ (are multiple puncte de lucru/clinici) sau o LOCAȚIE UNICĂ.
2. Identifică BRANDUL comercial (poate fi diferit de denumirea juridică).
3. Dacă este rețea, identifică TOATE locațiile cu adrese specifice din România.
4. Acordă un scor de încredere (0-100) bazat pe calitatea informațiilor.

BRANDURI CUNOSCUTE: MedLife, Regina Maria, Medicover, Sanador, GRAL Medical, Affidea, Synlab, Hiperdia - acestea sunt rețele mari cu multe locații în România.

Răspunde STRICT în format JSON (fără text suplimentar):
{
  "isNetwork": true/false,
  "networkBrand": "Numele brandului comercial sau null",
  "networkWebsite": "URL-ul principal sau null",
  "confidence": 0-100,
  "reasoning": "Explicație concisă (max 100 cuvinte)",
  "locations": [
    {
      "name": "Numele punctului de lucru",
      "address": "Adresa completă",
      "city": "Orașul",
      "county": "Județul (B, CJ, TM, etc.)",
      "phone": "Telefon sau null",
      "openingHours": "Program sau null",
      "confidence": 0-100
    }
  ]
}

IMPORTANT: Pentru rețele mari (MedLife, Regina Maria, etc.), include CÂT MAI MULTE locații posibil din informațiile disponibile.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) throw new Error('No JSON in response');

    const result = JSON.parse(json[0]);

    const enriched: EnrichedOrganization = {
      ...org,
      isNetwork: result.isNetwork === true,
      networkBrand: result.networkBrand || null,
      networkWebsite: result.networkWebsite || website?.url || null,
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

    // Always ensure at least primary location
    if (enriched.discoveredLocations.length === 0) {
      enriched.discoveredLocations.push({
        name: enriched.networkBrand || org.legalName,
        address: org.primaryLocation.address || '',
        city: org.primaryLocation.city || '',
        county: org.primaryLocation.county,
        phone: org.primaryLocation.phone || null,
        website: enriched.networkWebsite || null,
        openingHours: null,
        confidence: 100,
      });
    }

    return enriched;
  } catch (e: any) {
    console.error(`Error enriching ${org.legalName}:`, e.message);
    return {
      ...org,
      isNetwork: false,
      networkBrand: null,
      networkWebsite: website?.url || null,
      aiConfidence: 0,
      aiReasoning: `Error: ${e.message}`,
      discoveredLocations: [{
        name: org.legalName,
        address: org.primaryLocation.address || '',
        city: org.primaryLocation.city || '',
        county: org.primaryLocation.county,
        phone: org.primaryLocation.phone || null,
        website: null,
        openingHours: null,
        confidence: 100,
      }],
      aiEnrichedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     TEST NETWORKS - Multi-location Detection           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set!');
    process.exit(1);
  }

  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const orgs: Organization[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'organizations.json'), 'utf-8')
  );

  const testOrgs = TEST_INDICES.map(i => ({ index: i, org: orgs[i] }));

  console.log('Testing these known networks:\n');
  testOrgs.forEach(t => console.log(`  [${t.index}] ${t.org.legalName}`));
  console.log('');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: EnrichedOrganization[] = [];

  for (const { index, org } of testOrgs) {
    log(`Processing: ${org.legalName}`);

    const enriched = await enrichOrg(anthropic, org);
    results.push(enriched);

    if (enriched.isNetwork) {
      console.log(`  ✓ NETWORK: ${enriched.networkBrand}`);
      console.log(`    Locations found: ${enriched.discoveredLocations.length}`);
      enriched.discoveredLocations.forEach((loc, i) => {
        console.log(`      ${i+1}. ${loc.name} - ${loc.city} (${loc.address.substring(0, 40)}...)`);
      });
    } else {
      console.log(`  → Single location (confidence: ${enriched.aiConfidence}%)`);
    }
    console.log('');

    // Save after each
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

    // Rate limit
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n' + '═'.repeat(60));
  console.log('                    TEST COMPLETE');
  console.log('═'.repeat(60));

  const networks = results.filter(r => r.isNetwork);
  const totalLocs = results.reduce((sum, r) => sum + r.discoveredLocations.length, 0);

  console.log(`  Organizations tested: ${results.length}`);
  console.log(`  Networks detected:    ${networks.length}`);
  console.log(`  Total locations:      ${totalLocs}`);
  console.log(`  Errors:               ${results.filter(r => r.aiConfidence === 0).length}`);
  console.log('═'.repeat(60));
  console.log(`\nOutput: ${OUTPUT_FILE}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
