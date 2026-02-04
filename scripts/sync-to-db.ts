/**
 * Sync to Database Script
 *
 * Strategy:
 * 1. FIRST: Create providers from fund allocations (the complete list with CAS contracts)
 * 2. THEN: Enrich providers with details (address, phone, email) from provider detail files
 * 3. FINALLY: Sync fund allocations to their providers
 *
 * Matching logic:
 * - Primary: Match by email domain (handles company name changes like Ghencea Medical -> Anima)
 * - Secondary: Match by normalized name
 * - Brand names are preserved when legal names change
 *
 * Usage: npm run sync:upload
 */

import * as fs from 'fs';
import * as path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data', 'current');

// Feature flag: set to true once data_source_date column is added to Supabase
let HAS_DATA_SOURCE_DATE_COLUMN = false;

async function checkDataSourceDateColumn(): Promise<boolean> {
  try {
    // Try to query the column - if it fails, column doesn't exist
    const { error } = await supabase
      .from('providers')
      .select('data_source_date')
      .limit(1);

    if (error && error.message.includes('data_source_date')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Known brand name mappings (legal name -> brand name)
// Note: Only use for names that ALWAYS map to a brand, regardless of location
const BRAND_NAME_MAPPINGS: Record<string, string> = {
  // 'anima speciality medical services srl': 'Ghencea Medical Center', // REMOVED - multiple locations with same name
  // Add more mappings as discovered
};

// Email domain to brand name mappings
const EMAIL_BRAND_MAPPINGS: Record<string, string> = {
  'ghenceamedicalcenter.ro': 'Ghencea Medical Center',
  // Add more mappings as discovered
};

// Address-based brand name mappings (for multi-location companies)
// Key is normalized address pattern, value is brand name
const ADDRESS_BRAND_MAPPINGS: Record<string, string> = {
  'ghencea-43': 'Ghencea Medical Center',  // Bulevardul Ghencea 43B
  // Add more mappings as discovered
};

// Generic email domains that should NOT be used for matching
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.ro', 'yahoo.co.uk',
  'hotmail.com', 'hotmail.ro', 'outlook.com',
  'mail.com', 'email.com', 'icloud.com',
  'live.com', 'msn.com', 'aol.com',
  'protonmail.com', 'zoho.com',
  'yaho.com', 'gmai.com', // Common typos in data
]);

// Matching score thresholds
const MATCH_THRESHOLD = 80;
const SCORES = {
  CUI_MATCH: 1000,           // Definitive match
  BUSINESS_EMAIL: 100,       // Custom email domain match
  PHONE_MATCH: 50,           // Same phone number
  ADDRESS_MATCH: 50,         // Same normalized address
  NAME_HIGH_SIMILARITY: 30,  // Name >80% similar
  NAME_EXACT: 50,            // Exact normalized name
};

interface ParsedProvider {
  cui?: string;
  name: string;
  providerType: string;
  address?: string;
  addressType?: 'punct_lucru' | 'sediu_social' | 'unknown';
  city?: string;
  county: string;
  phone?: string;
  email?: string;
  website?: string;
  specialties: string[];
  contractNumber?: string;
  dataSource: string;
  dataSourceDate?: string;
  lat?: number;
  lng?: number;
  // Runtime: set during sync to track which DB record this maps to
  _dbProviderId?: string;
}

/**
 * Get București county ID
 */
async function getBucurestiCountyId(): Promise<string | null> {
  const { data } = await supabase
    .from('counties')
    .select('id')
    .eq('code', 'B')
    .single();

  return data?.id || null;
}

/**
 * Normalize provider name for matching
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:'"()]/g, '')
    .replace(/\bs\.?c\.?\s*/gi, '')  // Remove SC prefix
    .replace(/\bs\.?r\.?l\.?\b/gi, 'srl')
    .replace(/\bs\.?a\.?\b/gi, 'sa')
    .trim();
}

/**
 * Extract email domain (handles multiple emails separated by spaces/commas)
 */
function getEmailDomain(email: string | undefined): string | null {
  if (!email) return null;
  // Get the first email if multiple are present
  const firstEmail = email.split(/[\s,;]+/)[0];
  const match = firstEmail.toLowerCase().match(/@([a-z0-9.-]+)/);
  return match ? match[1] : null;
}

/**
 * Extract all email domains from a possibly multi-email string
 */
function getAllEmailDomains(email: string | undefined): string[] {
  if (!email) return [];
  const domains: string[] = [];
  const emailParts = email.split(/[\s,;]+/);
  for (const part of emailParts) {
    const match = part.toLowerCase().match(/@([a-z0-9.-]+)/);
    if (match && !domains.includes(match[1])) {
      domains.push(match[1]);
    }
  }
  return domains;
}

/**
 * Get business email domain (returns null for generic domains)
 */
function getBusinessEmailDomain(email: string | undefined): string | null {
  const domains = getAllEmailDomains(email);
  for (const domain of domains) {
    if (!GENERIC_EMAIL_DOMAINS.has(domain)) {
      return domain;
    }
  }
  return null;
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  // Remove everything except digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return null;
  // Remove country code prefix if present
  if (digits.startsWith('40') && digits.length > 10) {
    return digits.substring(2);
  }
  if (digits.startsWith('0040')) {
    return digits.substring(4);
  }
  return digits;
}

/**
 * Normalize address for comparison
 */
function normalizeAddress(address: string | undefined): string | null {
  if (!address) return null;

  let normalized = address.toLowerCase()
    // Standardize street type abbreviations
    .replace(/\bbulevardul\b/g, 'bd')
    .replace(/\bb-dul\b/g, 'bd')
    .replace(/\bbdul\b/g, 'bd')
    .replace(/\bbd\.\b/g, 'bd')
    .replace(/\bstrada\b/g, 'str')
    .replace(/\bstr\.\b/g, 'str')
    .replace(/\bcalea\b/g, 'cal')
    .replace(/\bsoseaua\b/g, 'sos')
    .replace(/\bsos\.\b/g, 'sos')
    .replace(/\bprelungirea\b/g, 'prel')
    .replace(/\baleea\b/g, 'al')
    .replace(/\bpiata\b/g, 'pta')
    // Standardize number indicators
    .replace(/\bnumar\b/g, 'nr')
    .replace(/\bnumăr\b/g, 'nr')
    .replace(/\bnr\.\b/g, 'nr')
    .replace(/\bnum[aă]rul\b/g, 'nr')
    // Standardize sector
    .replace(/\bsectorul\b/g, 'sect')
    .replace(/\bsector\b/g, 'sect')
    .replace(/\bsect\.\b/g, 'sect')
    // Remove common filler words
    .replace(/\bloc\.\b/g, '')
    .replace(/\blocalitatea\b/g, '')
    .replace(/\bjude[tț]ul?\b/g, '')
    .replace(/\bbucure[sș]ti\b/g, '')
    // Remove punctuation and extra spaces
    .replace(/[.,;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract key components: street name, number, sector
  const sectorMatch = normalized.match(/sect\s*(\d)/);
  const sector = sectorMatch ? sectorMatch[1] : '';

  // Try to extract street number
  const numberMatch = normalized.match(/nr\s*(\d+[a-z]?)/i);
  const streetNumber = numberMatch ? numberMatch[1] : '';

  // Get first meaningful word (usually street name)
  const words = normalized.split(' ').filter(w => w.length > 2 && !['str', 'bd', 'cal', 'sos', 'nr', 'sect', 'prel', 'al'].includes(w));
  const streetName = words[0] || '';

  if (!streetName) return null;

  // Return normalized key: streetname-number-sector
  return `${streetName}-${streetNumber}-${sector}`.replace(/--+/g, '-').replace(/-$/, '');
}

/**
 * Calculate name similarity (0-100)
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 100;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) {
    const shorter = n1.length < n2.length ? n1 : n2;
    const longer = n1.length >= n2.length ? n1 : n2;
    return Math.round((shorter.length / longer.length) * 100);
  }

  // Levenshtein-based similarity
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 100;

  const distance = levenshteinDistance(n1, n2);
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

/**
 * Provider matching data structure
 */
interface ProviderMatchData {
  id: string;
  name: string;
  brandName?: string;
  cui?: string;
  email?: string;
  phone?: string;
  address?: string;
  // Normalized values for matching
  normalizedName: string;
  businessEmailDomain: string | null;
  normalizedPhone: string | null;
  normalizedAddress: string | null;
}

/**
 * Calculate match score between two providers
 */
function calculateMatchScore(
  provider1: ProviderMatchData,
  provider2: { name: string; cui?: string; email?: string; phone?: string; address?: string }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // CUI match - definitive
  if (provider1.cui && provider2.cui && provider1.cui === provider2.cui) {
    return { score: SCORES.CUI_MATCH, reasons: ['CUI match'] };
  }

  // Business email domain match
  const p2BusinessEmail = getBusinessEmailDomain(provider2.email);
  const emailsMatch = provider1.businessEmailDomain && p2BusinessEmail &&
      provider1.businessEmailDomain === p2BusinessEmail;

  // IMPORTANT: Email match alone should NOT merge different locations
  // Only add email score if addresses also match OR if one doesn't have an address
  const p2Address = normalizeAddress(provider2.address);
  const bothHaveAddresses = provider1.normalizedAddress && p2Address;
  const addressesMatchForEmail = !bothHaveAddresses || provider1.normalizedAddress === p2Address;

  if (emailsMatch && addressesMatchForEmail) {
    score += SCORES.BUSINESS_EMAIL;
    reasons.push(`email domain: ${p2BusinessEmail}`);
  } else if (emailsMatch && bothHaveAddresses) {
    // Same email but different addresses = different locations of same company
    // Don't add score, but note it for debugging
    reasons.push(`email match ignored (different addresses)`);
  }

  // Phone match
  const p2Phone = normalizePhone(provider2.phone);
  const phonesMatch = provider1.normalizedPhone && p2Phone &&
      provider1.normalizedPhone === p2Phone;

  if (phonesMatch) {
    score += SCORES.PHONE_MATCH;
    reasons.push(`phone: ${p2Phone}`);
  }

  // Address match (p2Address already computed above for email check)
  const addressesMatch = provider1.normalizedAddress && p2Address &&
      provider1.normalizedAddress === p2Address;

  if (addressesMatch) {
    score += SCORES.ADDRESS_MATCH;
    reasons.push(`address: ${p2Address}`);
  }

  // Name similarity
  const p2NormalizedName = normalizeName(provider2.name);
  const namesMatchExact = provider1.normalizedName === p2NormalizedName;
  const nameSimilarity = calculateNameSimilarity(provider1.name, provider2.name);

  if (namesMatchExact) {
    // IMPORTANT: If names match exactly but BOTH providers have different business emails
    // OR different addresses, they are likely DIFFERENT locations of the same company
    const bothHaveEmails = provider1.businessEmailDomain && p2BusinessEmail;
    const bothHaveAddresses = provider1.normalizedAddress && p2Address;

    if (bothHaveEmails && !emailsMatch) {
      // Same name, but clearly different business emails = different company/location
      // Don't add name score - this prevents false matches
      reasons.push('name match ignored (different emails)');
    } else if (bothHaveAddresses && !addressesMatch && !emailsMatch && !phonesMatch) {
      // Same name, different address, no other matches = likely different location
      reasons.push('name match ignored (different address, no other matches)');
    } else {
      score += SCORES.NAME_EXACT;
      reasons.push('exact name');
    }
  } else if (nameSimilarity >= 80) {
    score += SCORES.NAME_HIGH_SIMILARITY;
    reasons.push(`name ${nameSimilarity}% similar`);
  }

  return { score, reasons };
}

/**
 * Find best matching provider from existing providers
 */
function findBestMatch(
  existingProviders: ProviderMatchData[],
  newProvider: { name: string; cui?: string; email?: string; phone?: string; address?: string }
): { provider: ProviderMatchData; score: number; reasons: string[] } | null {
  let bestMatch: { provider: ProviderMatchData; score: number; reasons: string[] } | null = null;

  for (const existing of existingProviders) {
    const { score, reasons } = calculateMatchScore(existing, newProvider);

    if (score >= MATCH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { provider: existing, score, reasons };
    }
  }

  return bestMatch;
}

/**
 * Get brand name from legal name, email, or address
 */
function getBrandName(legalName: string, email?: string, address?: string): string | null {
  // Check email domain first (most reliable)
  if (email) {
    const domains = getAllEmailDomains(email);
    for (const domain of domains) {
      if (EMAIL_BRAND_MAPPINGS[domain]) {
        return EMAIL_BRAND_MAPPINGS[domain];
      }
    }
  }

  // Check address-based mappings (for multi-location companies)
  if (address) {
    const normalizedAddr = normalizeAddress(address);
    if (normalizedAddr) {
      for (const [addrPattern, brandName] of Object.entries(ADDRESS_BRAND_MAPPINGS)) {
        if (normalizedAddr.includes(addrPattern)) {
          return brandName;
        }
      }
    }
  }

  // Check legal name mappings (least reliable for multi-location)
  const normalized = normalizeName(legalName);
  if (BRAND_NAME_MAPPINGS[normalized]) {
    return BRAND_NAME_MAPPINGS[normalized];
  }

  return null;
}

/**
 * Check if two names match (fuzzy)
 */
function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Exact match
  if (n1 === n2) return true;

  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // First word match (company name usually)
  const words1 = n1.split(' ');
  const words2 = n2.split(' ');
  if (words1[0] === words2[0] && words1[0].length > 3) return true;

  return false;
}

/**
 * Normalize specialty names to fix common variations and typos
 */
const SPECIALTY_NORMALIZATIONS: Record<string, string> = {
  // ORL variations
  'orl': 'otorinolaringologie',
  'otorinolanrigologie': 'otorinolaringologie',  // typo
  'oto-rino-laringologie': 'otorinolaringologie',
  // Dermatology variations
  'dermato-venerologie': 'dermatovenerologie',
  'dermato venerologie': 'dermatovenerologie',
  // Diabetes variations
  'diabet zaharat, nutritie si boli metabolice': 'diabet zaharat',
  'nutritie si boli metabolice': 'nutritie',
  // Obstetrics variations
  'obstetrica - ginecologie': 'obstetrica-ginecologie',
  'obstetrică-ginecologie': 'obstetrica-ginecologie',
  'ginecologie': 'obstetrica-ginecologie',
  // Internal medicine variations
  'medicina internă': 'medicina interna',
  // Surgery variations
  'chirurgie generalã': 'chirurgie generala',
  // Other common normalizations
  'alergologie si imunologie clinica': 'alergologie',
  'alergologie şi imunologie clinică': 'alergologie',
  'nefrologie': 'nefrologie',
  'pneumologie': 'pneumologie',
  'reumatologie': 'reumatologie',
};

function normalizeSpecialtyName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return SPECIALTY_NORMALIZATIONS[trimmed] || trimmed;
}

/**
 * Get or create specialty
 */
async function getOrCreateSpecialty(name: string): Promise<string> {
  const normalizedName = normalizeSpecialtyName(name);

  const { data: existing } = await supabase
    .from('specialties')
    .select('id')
    .ilike('name', normalizedName)
    .single();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('specialties')
    .insert({ name: normalizedName, category: 'paraclinical' })
    .select('id')
    .single();

  if (error) throw error;
  return created.id;
}

/**
 * Main sync function
 */
async function syncToDatabase(): Promise<void> {
  console.log('=== FondCAS Database Sync ===\n');

  // Check if data_source_date column exists
  HAS_DATA_SOURCE_DATE_COLUMN = await checkDataSourceDateColumn();
  if (HAS_DATA_SOURCE_DATE_COLUMN) {
    console.log('data_source_date column detected - will store source dates\n');
  } else {
    console.log('NOTE: data_source_date column not found - run this SQL in Supabase:');
    console.log('  ALTER TABLE providers ADD COLUMN data_source_date DATE;\n');
  }

  // Get București county ID
  const bucurestCountyId = await getBucurestiCountyId();
  if (!bucurestCountyId) {
    console.error('București county not found in database');
    process.exit(1);
  }

  // Load data files - prefer comprehensive files from parse-all-cas-data.ts
  const allProvidersFile = path.join(DATA_DIR, 'all_providers.json');
  const providersFile = path.join(DATA_DIR, 'parsed_providers.json');

  let providerDetails: ParsedProvider[] = [];

  if (fs.existsSync(allProvidersFile)) {
    providerDetails = JSON.parse(fs.readFileSync(allProvidersFile, 'utf-8'));
    console.log(`Loaded ${providerDetails.length} provider details from all_providers.json`);
  } else if (fs.existsSync(providersFile)) {
    providerDetails = JSON.parse(fs.readFileSync(providersFile, 'utf-8'));
    console.log(`Loaded ${providerDetails.length} provider details from parsed_providers.json`);
  } else {
    console.error('No provider file found. Run npm run sync:parse first.');
    process.exit(1);
  }

  // Build provider index from existing database for matching
  console.log('\n--- Building provider index for matching ---');
  const { data: existingDbProviders } = await supabase
    .from('providers')
    .select('id, name, brand_name, cui, email, phone, address');

  const existingProviderIndex: ProviderMatchData[] = [];

  if (existingDbProviders) {
    for (const p of existingDbProviders) {
      existingProviderIndex.push({
        id: p.id,
        name: p.name,
        brandName: p.brand_name,
        cui: p.cui,
        email: p.email,
        phone: p.phone,
        address: p.address,
        normalizedName: normalizeName(p.name),
        businessEmailDomain: getBusinessEmailDomain(p.email),
        normalizedPhone: normalizePhone(p.phone),
        normalizedAddress: normalizeAddress(p.address),
      });
    }
    console.log(`Loaded ${existingProviderIndex.length} existing providers for matching`);
    console.log(`  - With business email: ${existingProviderIndex.filter(p => p.businessEmailDomain).length}`);
    console.log(`  - With phone: ${existingProviderIndex.filter(p => p.normalizedPhone).length}`);
    console.log(`  - With address: ${existingProviderIndex.filter(p => p.normalizedAddress).length}`);
  }

  // === STEP 1: Create providers from PRIMARY provider details file ===
  // This is the source of truth for who has an active CNAS contract
  console.log('\n--- Step 1: Creating providers from PRIMARY provider file ---');
  console.log(`Found ${providerDetails.length} providers in primary file`);

  const providerIdMap = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const detailRecord of providerDetails) {
    try {
      const providerName = detailRecord.name;

      // Get details from the primary provider file
      const email = detailRecord.email;
      const phone = detailRecord.phone;
      const address = detailRecord.address;
      const cui = detailRecord.cui;
      const dataSourceDate = detailRecord.dataSourceDate;

      const contractNumber = detailRecord.contractNumber;

      // Try to find matching existing provider using scoring system
      const match = findBestMatch(existingProviderIndex, {
        name: providerName,
        cui,
        email,
        phone,
        address
      });

      let providerId: string;
      const brandName = getBrandName(providerName, email, address);

      if (match) {
        providerId = match.provider.id;
        console.log(`  Matched "${providerName}" (score: ${match.score}) - ${match.reasons.join(', ')}`);

        // Update legal name if different, but preserve brand name
        const updateData: Record<string, any> = {
          name: providerName, // Update to latest legal name
          last_synced_at: new Date().toISOString()
        };

        // Update contact info if we have better data
        if (email && !match.provider.email) updateData.email = email;
        if (phone && !match.provider.phone) updateData.phone = phone;
        if (address && !match.provider.address) updateData.address = address;

        // Set brand name if we have one and it's not already set
        if (brandName && !match.provider.brandName) {
          updateData.brand_name = brandName;
        }

        await supabase
          .from('providers')
          .update(updateData)
          .eq('id', providerId);

        // Update the index entry
        const indexEntry = existingProviderIndex.find(p => p.id === providerId);
        if (indexEntry) {
          indexEntry.name = providerName;
          indexEntry.normalizedName = normalizeName(providerName);
          if (email) {
            indexEntry.email = email;
            indexEntry.businessEmailDomain = getBusinessEmailDomain(email);
          }
          if (phone) {
            indexEntry.phone = phone;
            indexEntry.normalizedPhone = normalizePhone(phone);
          }
          if (address) {
            indexEntry.address = address;
            indexEntry.normalizedAddress = normalizeAddress(address);
          }
        }

        updated++;
      } else {
        // Create new provider
        const website = detailRecord.website;
        const city = detailRecord.city;
        const { data: newProvider, error } = await supabase
          .from('providers')
          .insert({
            name: providerName,
            brand_name: brandName,
            provider_type: detailRecord.providerType || 'clinic',
            county_id: bucurestCountyId,
            cas_contract_number: contractNumber,
            cui: cui,
            email: email,
            phone: phone,
            address: address,
            city: city,
            website: website,
            data_source: detailRecord.dataSource,
            ...(HAS_DATA_SOURCE_DATE_COLUMN && dataSourceDate ? { data_source_date: dataSourceDate } : {}),
            last_synced_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (error) throw error;
        providerId = newProvider.id;

        // Add to index for future matching
        existingProviderIndex.push({
          id: providerId,
          name: providerName,
          brandName: brandName || undefined,
          cui,
          email,
          phone,
          address,
          normalizedName: normalizeName(providerName),
          businessEmailDomain: getBusinessEmailDomain(email),
          normalizedPhone: normalizePhone(phone),
          normalizedAddress: normalizeAddress(address),
        });

        created++;
      }

      providerIdMap.set(providerName.toLowerCase(), providerId);

      // Also map by brand name if available
      if (brandName) {
        providerIdMap.set(brandName.toLowerCase(), providerId);
      }

      // Store the DB ID on the detail record for later specialty linking
      detailRecord._dbProviderId = providerId;

    } catch (error) {
      errors++;
      console.error(`Error creating provider "${detailRecord.name}":`, error);
    }
  }

  console.log(`Providers: ${created} created, ${updated} existing, ${errors} errors`);

  // === STEP 2: Link specialties ===
  console.log('\n--- Step 2: Linking specialties ---');

  let specialtiesLinked = 0;
  let specialtyErrors = 0;
  let processedProviders = 0;
  const totalWithSpecialties = providerDetails.filter(d => d.specialties && d.specialties.length > 0).length;
  console.log(`  Processing ${totalWithSpecialties} providers with specialties...`);

  for (const detail of providerDetails) {
    try {
      // Use the directly stored ID from Step 1 (much more reliable than name matching)
      const providerId = detail._dbProviderId;
      if (!providerId) continue;

      // Link specialties
      if (detail.specialties && detail.specialties.length > 0) {
        processedProviders++;
        if (processedProviders % 50 === 0) {
          console.log(`  Progress: ${processedProviders}/${totalWithSpecialties} providers, ${specialtiesLinked} links`);
        }
        for (const specialty of detail.specialties) {
          try {
            const specialtyId = await getOrCreateSpecialty(specialty);
            await supabase
              .from('provider_specialties')
              .upsert({
                provider_id: providerId,
                specialty_id: specialtyId
              }, { onConflict: 'provider_id,specialty_id' });
            specialtiesLinked++;
          } catch (err: unknown) {
            specialtyErrors++;
            if (specialtyErrors <= 5) {
              console.error(`  Error linking specialty "${specialty}": ${err instanceof Error ? err.message : err}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error linking specialties for "${detail.name}":`, error);
    }
  }

  console.log(`Linked ${specialtiesLinked} specialty associations (${specialtyErrors} errors)`);

  // === SUMMARY ===
  console.log('\n=== Sync Complete ===');

  const { count: dbProviders } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true });

  const { count: dbSpecialties } = await supabase
    .from('specialties')
    .select('*', { count: 'exact', head: true });

  const { count: dbLinks } = await supabase
    .from('provider_specialties')
    .select('*', { count: 'exact', head: true });

  // Count unique providers with specialties
  const { data: providerIds } = await supabase
    .from('provider_specialties')
    .select('provider_id');
  const uniqueWithSpecs = new Set(providerIds?.map(p => p.provider_id)).size;

  const { count: withCoords } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('lat', 'is', null)
    .not('lng', 'is', null);

  const { count: withPhone } = await supabase
    .from('providers')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null);

  console.log('\n--- Database Status ---');
  console.log(`Providers: ${dbProviders}`);
  console.log(`  With phone: ${withPhone}`);
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  With specialties: ${uniqueWithSpecs}`);
  console.log(`Specialties: ${dbSpecialties}`);
  console.log(`Provider-Specialty links: ${dbLinks}`);
}

// Run the script
syncToDatabase().catch(console.error);
