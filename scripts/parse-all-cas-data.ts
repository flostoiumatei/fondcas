/**
 * Parse All CAS Data
 *
 * Comprehensive parser for all downloaded CAS Excel files
 * Extracts providers and fund allocations from multiple file types
 *
 * Usage: npx tsx scripts/parse-all-cas-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const CAS_DATA_DIR = path.join(process.cwd(), 'data', 'CAS');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'current');

// === PRIMARY PROVIDER FILES ===
// These files are the SOURCE OF TRUTH for providers with active CNAS contracts.
// Providers from ALL these files will be combined (deduplicated by name).
// Other files (valori, decont) are used only for fund allocation data.
const PRIMARY_PROVIDER_FILES = [
  // Clinic - servicii medicale și conexe (CMI-uri, clinici)
  { file: '20251215-furnizori-de-servicii-medicale-si-conexe-in-contract-la-01.12.2025.xlsx', type: 'clinic' as const },
  // Paraclinic - laboratoare, radiologie, imagistică
  { file: '20250526-lista-furnizori-investigatii-paraclinice-01.04.2025.xlsx', type: 'paraclinic' as const },
  // Recuperare - kinetoterapie, recuperare medicală
  { file: '20250605-lista-furnizori-servicii-medicale-de-recuperare-reabilitare (1).xlsx', type: 'recovery' as const },
  // Ecografie - servicii de ecografie
  { file: '20251212-furnizori-de-servicii-de-ecografie.xlsx', type: 'clinic' as const },
  // Spitale - hospitals
  { file: '20250520-contracte-spitale-mai-2025.xlsx', type: 'hospital' as const },
];

// Minimum year for fund allocations to be considered "current"
// Historical data (before this year) is only used for ML predictions
const CURRENT_YEAR = 2026;

interface ParsedProvider {
  name: string;
  cui?: string;
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
  dataSourceDate?: string; // YYYY-MM-DD format
}

interface ParsedFundAllocation {
  providerName: string;
  providerCui?: string;
  periodYear: number;
  periodMonth: number;
  serviceType: string;
  allocatedAmount: number;
  consumedAmount?: number;
  availableAmount?: number;
  contractNumber?: string;
  dataSource: string;
}

// Determine service type from filename
function getServiceType(filename: string): string {
  const lower = filename.toLowerCase();

  if (lower.includes('reca') || lower.includes('recuperare') || lower.includes('reabilitare')) {
    return 'recovery';
  }
  if (lower.includes('paraclinic') || lower.includes('laborator')) {
    return 'paraclinic';
  }
  if (lower.includes('spital')) {
    return 'hospital';
  }
  if (lower.includes('pns') || lower.includes('program')) {
    return 'pns';
  }
  if (lower.includes('clinic') && !lower.includes('paraclinic')) {
    return 'clinic';
  }
  if (lower.includes('eco') || lower.includes('ecograf')) {
    return 'ultrasound';
  }
  if (lower.includes('pet-ct')) {
    return 'pet-ct';
  }
  if (lower.includes('genetic') || lower.includes('tg')) {
    return 'genetic-testing';
  }
  if (lower.includes('hg') || lower.includes('hemoglobin')) {
    return 'hba1c';
  }
  if (lower.includes('ahm')) {
    return 'ahm';
  }
  if (lower.includes('acupunctura')) {
    return 'acupuncture';
  }
  if (lower.includes('radiologie') || lower.includes('dentara')) {
    return 'dental-radiology';
  }

  return 'other';
}

// Determine provider type from service type
function getProviderType(serviceType: string): string {
  switch (serviceType) {
    case 'hospital':
      return 'hospital';
    case 'recovery':
      return 'recovery';
    case 'paraclinic':
    case 'pet-ct':
    case 'genetic-testing':
    case 'hba1c':
    case 'ahm':
      return 'paraclinic';
    case 'clinic':
    case 'ultrasound':
    case 'acupuncture':
      return 'clinic';
    default:
      return 'clinic';
  }
}

// Extract file date from filename (YYYYMMDD prefix)
function extractFileDate(filename: string): string | undefined {
  const dateMatch = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }
  return undefined;
}

// Extract period from filename
function extractPeriod(filename: string): { year: number; month: number } {
  const monthNames: Record<string, number> = {
    'ianuarie': 1, 'february': 2, 'februarie': 2, 'martie': 3,
    'aprilie': 4, 'mai': 5, 'iunie': 6, 'iulie': 7,
    'august': 8, 'septembrie': 9, 'octombrie': 10,
    'noiembrie': 11, 'decembrie': 12
  };

  const lower = filename.toLowerCase();

  // Try month name + year pattern
  for (const [monthName, monthNum] of Object.entries(monthNames)) {
    if (lower.includes(monthName)) {
      const yearMatch = filename.match(/20\d{2}/g);
      if (yearMatch) {
        // Get the last year mentioned (usually the target period)
        const year = parseInt(yearMatch[yearMatch.length - 1]);
        return { year, month: monthNum };
      }
    }
  }

  // Try date pattern in filename prefix (YYYYMMDD)
  const dateMatch = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (dateMatch) {
    return {
      year: parseInt(dateMatch[1]),
      month: parseInt(dateMatch[2])
    };
  }

  // Default to current date
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// Check if file is a fund allocation file (valori/contracte)
function isFundAllocationFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.includes('valori') ||
         lower.includes('contract') ||
         lower.includes('alocare') ||
         lower.includes('transe');
}

// Check if file is a settlement/decont file
function isDecontFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.includes('decont');
}

// Check if file is a provider list file
function isProviderListFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.includes('furnizori') ||
         lower.includes('lista') ||
         (lower.includes('contract') && !lower.includes('valori'));
}

// Parse currency value
function parseCurrency(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Math.abs(value);

  const str = String(value)
    .replace(/[^\d,.\-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const num = parseFloat(str);
  return isNaN(num) ? undefined : Math.abs(num);
}

// Find header row in sheet data
function findHeaderRow(data: any[][]): { index: number; columns: Record<string, number> } {
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const columns: Record<string, number> = {};

    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').toLowerCase().trim();

      // Provider name column - various formats
      if ((cell.includes('denumire') && (cell.includes('furnizor') || cell.includes('unitat'))) ||
          (cell.includes('nume') && cell.includes('furnizor')) ||
          cell === 'denumire' || cell === 'furnizor' ||
          cell === 'denumire furnizor' || cell === 'nume furnizor') {
        columns.name = j;
      }
      // CUI (unique company ID)
      else if (cell.includes('cui') || cell.includes('cif') || cell.includes('cod fiscal') ||
               cell.includes('cod unic') || cell === 'c.u.i.' || cell === 'c.i.f.') {
        columns.cui = j;
      }
      // Contract number - various formats
      else if ((cell.includes('nr') && cell.includes('contr')) ||
               cell === 'contract' || cell.includes('nr. contract')) {
        columns.contract = j;
      }
      // Address - prefer PUNCT DE LUCRU over SEDIU SOCIAL
      else if (cell.includes('punct') && cell.includes('lucru')) {
        columns.punctLucru = j;
      }
      else if (cell.includes('sediu') && cell.includes('social')) {
        columns.sediuSocial = j;
      }
      else if (cell.includes('adresa') && !columns.address) {
        columns.address = j;
      }
      // Phone
      else if (cell.includes('telefon') || cell.includes('tel')) {
        columns.phone = j;
      }
      // Email
      else if (cell.includes('email') || cell.includes('e-mail')) {
        columns.email = j;
      }
      // Website
      else if (cell.includes('website') || cell.includes('web') || cell.includes('site')) {
        columns.website = j;
      }
      // Specialty/Service
      else if (cell.includes('specialitat') || cell.includes('serviciu') || cell.includes('tip serviciu')) {
        columns.specialty = j;
      }
      // Total/Amount
      else if (cell === 'total' || cell.includes('valoare') || cell.includes('suma')) {
        if (!columns.total) columns.total = j;
      }
    }

    // Check if we found key columns
    if (columns.name !== undefined) {
      return { index: i, columns };
    }
  }

  return { index: -1, columns: {} };
}

// Parse a single Excel file
function parseExcelFile(filePath: string): { providers: ParsedProvider[]; allocations: ParsedFundAllocation[] } {
  const filename = path.basename(filePath);
  const providers: ParsedProvider[] = [];
  const allocations: ParsedFundAllocation[] = [];

  // Skip temp files only (files like ~$filename.xlsx created by Excel when file is open)
  // Note: We no longer skip files with (1) suffix as they may be the only copy we have
  if (filename.startsWith('~$')) {
    return { providers, allocations };
  }

  const serviceType = getServiceType(filename);
  const providerType = getProviderType(serviceType);
  const period = extractPeriod(filename);
  const isAllocation = isFundAllocationFile(filename);
  const isDecont = isDecontFile(filename);

  try {
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length < 3) continue;

      const { index: headerIndex, columns } = findHeaderRow(data);
      if (headerIndex === -1 || columns.name === undefined) continue;

      // Check for sub-header row (TOTAL column might be there)
      let dataStartRow = headerIndex + 1;
      if (dataStartRow < data.length) {
        const nextRow = data[dataStartRow];
        if (nextRow) {
          for (let j = 0; j < nextRow.length; j++) {
            const cell = String(nextRow[j] || '').toLowerCase().trim();
            if (cell === 'total' && columns.total === undefined) {
              columns.total = j;
              dataStartRow++;
              break;
            }
          }
        }
      }

      // Parse data rows
      for (let i = dataStartRow; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        const name = String(row[columns.name] || '').trim();
        if (!name || name.length < 3) continue;
        if (name.toLowerCase().includes('total') || /^\d+$/.test(name)) continue;

        // For fund allocation files
        if (isAllocation || isDecont) {
          let amount: number | undefined;

          if (columns.total !== undefined) {
            amount = parseCurrency(row[columns.total]);
          }

          // Try to find any large number as amount
          if (!amount) {
            for (let j = (columns.name || 0) + 1; j < row.length; j++) {
              const val = parseCurrency(row[j]);
              if (val && val > 100) {
                amount = val;
                break;
              }
            }
          }

          if (amount && amount > 0) {
            const allocation: ParsedFundAllocation = {
              providerName: name,
              periodYear: period.year,
              periodMonth: period.month,
              serviceType,
              allocatedAmount: amount,
              contractNumber: columns.contract !== undefined ? String(row[columns.contract] || '').trim() : undefined,
              dataSource: filename
            };

            // Extract CUI for allocation
            if (columns.cui !== undefined && row[columns.cui]) {
              const cuiValue = String(row[columns.cui]).trim().replace(/\D/g, '');
              if (cuiValue.length >= 4 && cuiValue.length <= 12) {
                allocation.providerCui = cuiValue;
              }
            }

            allocations.push(allocation);
          }
        }

        // Always extract provider info
        const provider: ParsedProvider = {
          name,
          providerType,
          county: 'B',
          specialties: [], // Will be populated from specialty column
          dataSource: filename,
          dataSourceDate: extractFileDate(filename)
        };

        // Extract CUI
        if (columns.cui !== undefined && row[columns.cui]) {
          const cuiValue = String(row[columns.cui]).trim().replace(/\D/g, '');
          if (cuiValue.length >= 4 && cuiValue.length <= 12) {
            provider.cui = cuiValue;
          }
        }

        // Address: prefer PUNCT DE LUCRU over SEDIU SOCIAL over generic ADRESA
        if (columns.punctLucru !== undefined && row[columns.punctLucru]) {
          provider.address = String(row[columns.punctLucru]).trim();
          provider.addressType = 'punct_lucru';
        } else if (columns.sediuSocial !== undefined && row[columns.sediuSocial]) {
          provider.address = String(row[columns.sediuSocial]).trim();
          provider.addressType = 'sediu_social';
        } else if (columns.address !== undefined && row[columns.address]) {
          provider.address = String(row[columns.address]).trim();
          provider.addressType = 'unknown';
        }

        if (provider.address) {
          if (provider.address.toLowerCase().includes('bucureşti') ||
              provider.address.toLowerCase().includes('bucuresti')) {
            provider.city = 'București';
          }
        }

        if (columns.phone !== undefined && row[columns.phone]) {
          provider.phone = String(row[columns.phone]).trim();
        }

        if (columns.email !== undefined && row[columns.email]) {
          provider.email = String(row[columns.email]).trim().toLowerCase();
        }

        if (columns.website !== undefined && row[columns.website]) {
          provider.website = String(row[columns.website]).trim().toLowerCase();
        }

        if (columns.contract !== undefined && row[columns.contract]) {
          provider.contractNumber = String(row[columns.contract]).trim();
        }

        // Extract additional specialty from specialty column
        // Specialties may be separated by "/" or ","
        if (columns.specialty !== undefined && row[columns.specialty]) {
          const specialtyValue = String(row[columns.specialty]).trim();
          if (specialtyValue) {
            // Split by / or , and clean each specialty
            const specialtyParts = specialtyValue.split(/[\/,]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 2);
            for (const spec of specialtyParts) {
              // Skip generic values
              if (spec === 'other' || spec === 'clinic' || spec === 'paraclinic' || spec === 'ultrasound' || spec === 'recovery') continue;
              if (!provider.specialties.includes(spec)) {
                provider.specialties.push(spec);
              }
            }
          }
        }

        providers.push(provider);
      }
    }
  } catch (error) {
    console.error(`  Error parsing ${filename}:`, error);
  }

  return { providers, allocations };
}

// Main function
async function parseAllCasData(): Promise<void> {
  console.log('=== Parsing All CAS Data ===\n');
  console.log(`PRIMARY PROVIDER FILES: ${PRIMARY_PROVIDER_FILES.length} files`);
  for (const pf of PRIMARY_PROVIDER_FILES) {
    console.log(`  - ${pf.file} (${pf.type})`);
  }
  console.log(`CURRENT_YEAR threshold: ${CURRENT_YEAR}\n`);

  if (!fs.existsSync(CAS_DATA_DIR)) {
    console.error(`CAS data directory not found: ${CAS_DATA_DIR}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // === STEP 1: Parse ALL PRIMARY provider files (sources of truth) ===
  console.log(`\n=== Step 1: Parsing PRIMARY provider files ===\n`);

  const primaryProviders: ParsedProvider[] = [];
  const primaryAllocations: ParsedFundAllocation[] = [];
  const primaryFileNames = new Set<string>();

  for (const primaryFile of PRIMARY_PROVIDER_FILES) {
    const primaryFilePath = path.join(CAS_DATA_DIR, primaryFile.file);
    primaryFileNames.add(primaryFile.file);

    if (!fs.existsSync(primaryFilePath)) {
      console.log(`WARNING: Primary file not found: ${primaryFile.file} - skipping`);
      continue;
    }

    console.log(`Parsing: ${primaryFile.file}`);
    const { providers, allocations } = parseExcelFile(primaryFilePath);

    // Override provider type based on file category
    for (const p of providers) {
      p.providerType = primaryFile.type;
    }

    console.log(`  Found ${providers.length} providers (${primaryFile.type})\n`);

    primaryProviders.push(...providers);
    primaryAllocations.push(...allocations);
  }

  console.log(`Total from primary files: ${primaryProviders.length} providers\n`);

  // Build a set of valid providers from the primary files
  const validProviderNames = new Set<string>();
  for (const p of primaryProviders) {
    validProviderNames.add(p.name.toLowerCase().trim());
  }

  // === STEP 2: Parse all other files for fund allocation data ===
  console.log(`=== Step 2: Parsing fund allocation files ===\n`);

  const files = fs.readdirSync(CAS_DATA_DIR)
    .filter(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'))
    .filter(f => !primaryFileNames.has(f)); // Skip primary files (already parsed)

  console.log(`Found ${files.length} additional Excel files\n`);

  const allAllocations: ParsedFundAllocation[] = [...primaryAllocations];
  const supplementaryProviders: ParsedProvider[] = [];

  // Parse each file for allocations
  for (const file of files) {
    const filePath = path.join(CAS_DATA_DIR, file);
    process.stdout.write(`Parsing: ${file.substring(0, 60)}...`);

    const { providers, allocations } = parseExcelFile(filePath);

    if (allocations.length > 0) {
      console.log(` ${allocations.length} allocations`);
      allAllocations.push(...allocations);
    } else if (providers.length > 0) {
      console.log(` ${providers.length} providers (supplementary)`);
      supplementaryProviders.push(...providers);
    } else {
      console.log(' (no data)');
    }
  }

  // === STEP 3: Build final provider list from PRIMARY file ===
  console.log(`\n=== Step 3: Building final provider list ===`);
  console.log(`Using ${primaryProviders.length} providers from PRIMARY file as base`);

  // Start with primary providers as the base
  const currentProviders = [...primaryProviders];

  // Helper to normalize provider name for comparison
  function normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\bs\.?c\.?\s*/gi, '') // Remove SC prefix
      .replace(/\bs\.?r\.?l\.?\s*$/gi, '') // Remove SRL suffix
      .replace(/\bs\.?a\.?\s*$/gi, '')  // Remove SA suffix
      .replace(/[.,;:'"()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Helper to create a unique key for provider (name + location)
  // This ensures different locations of the same company are kept as separate providers
  function getProviderKey(name: string, address?: string): string {
    const normalizedName = normalizeName(name);

    if (!address) return normalizedName;

    // Normalize address: standardize street type prefixes and extract key parts
    let addrLower = address.toLowerCase()
      .replace(/[,\.\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Standardize common street type abbreviations
    addrLower = addrLower
      .replace(/\bb-?dul\b/g, 'bulevardul')
      .replace(/\bbd\b/g, 'bulevardul')
      .replace(/\bsos\b/g, 'soseaua')
      .replace(/\bstr\b/g, 'strada')
      .replace(/\bprel\b/g, 'prelungirea')
      .replace(/\bpta\b/g, 'piata')
      .replace(/\bnr\b/g, 'numar')
      .replace(/\bnum\b/g, 'numar');

    // Extract key parts: street name + number
    const streetMatch = addrLower.match(/(?:strada|bulevardul|soseaua|calea|prelungirea|piata|aleea)\s+([a-z\s]+?)(?:\s+numar)?\s*(\d+)/i);

    if (streetMatch) {
      const streetName = streetMatch[1].trim().substring(0, 15); // First 15 chars of street name
      const streetNum = streetMatch[2];
      return `${normalizedName}|${streetName}-${streetNum}`;
    }

    // Fallback: try to extract just the first word and any number
    const simpleMatch = addrLower.match(/([a-z]+)[^a-z]*(\d+)/i);
    if (simpleMatch) {
      return `${normalizedName}|${simpleMatch[1].substring(0, 10)}-${simpleMatch[2]}`;
    }

    // Last fallback: use first 20 chars of normalized address
    const addrKey = addrLower.replace(/[^a-z0-9]/g, '').substring(0, 20);
    return `${normalizedName}|${addrKey}`;
  }

  // Deduplicate primary providers by name + location (case-insensitive)
  const uniqueProviders = new Map<string, ParsedProvider>();
  for (const provider of currentProviders) {
    const key = getProviderKey(provider.name, provider.address);
    if (!uniqueProviders.has(key)) {
      uniqueProviders.set(key, provider);
    } else {
      // Merge specialties from duplicate entries at same location
      const existing = uniqueProviders.get(key)!;
      const specs = new Set([...existing.specialties, ...provider.specialties]);
      existing.specialties = Array.from(specs);
    }
  }

  // Enrich with supplementary provider data (e.g., punct_lucru addresses from other files)
  let enrichedCount = 0;
  for (const supp of supplementaryProviders) {
    // Try to match by name + address first, then by name only
    let key = getProviderKey(supp.name, supp.address);
    if (!uniqueProviders.has(key)) {
      // Fallback: try name-only match for supplementary data that might have different address format
      key = supp.name.toLowerCase().trim();
      // But only if this is the ONLY provider with that name (avoid merging different locations)
      const nameMatches = Array.from(uniqueProviders.keys()).filter(k => k.startsWith(key + '|') || k === key);
      if (nameMatches.length !== 1) continue;
      key = nameMatches[0];
    }
    if (uniqueProviders.has(key)) {
      const existing = uniqueProviders.get(key)!

      // Prefer punct_lucru address over sediu_social
      if (supp.address && supp.addressType === 'punct_lucru') {
        if (existing.addressType !== 'punct_lucru') {
          existing.address = supp.address;
          existing.addressType = supp.addressType;
          existing.dataSource = supp.dataSource;
          existing.dataSourceDate = supp.dataSourceDate;
          enrichedCount++;
        }
      }

      // Merge specialties
      const specs = new Set([...existing.specialties, ...supp.specialties]);
      existing.specialties = Array.from(specs);

      // Fill in missing fields
      if (!existing.cui && supp.cui) existing.cui = supp.cui;
      if (!existing.address && supp.address) {
        existing.address = supp.address;
        existing.addressType = supp.addressType;
      }
      if (!existing.phone && supp.phone) existing.phone = supp.phone;
      if (!existing.email && supp.email) existing.email = supp.email;
      if (!existing.website && supp.website) existing.website = supp.website;
    }
  }
  console.log(`Enriched ${enrichedCount} providers with better addresses from supplementary files`);

  const finalProviders = Array.from(uniqueProviders.values());

  // Separate allocations: current (2025+) for display, historical for ML
  const currentAllocations = allAllocations.filter(a => a.periodYear >= CURRENT_YEAR);
  const historicalAllocations = allAllocations.filter(a => a.periodYear < CURRENT_YEAR);

  // Save providers (only those with current contracts)
  const providersFile = path.join(OUTPUT_DIR, 'all_providers.json');
  fs.writeFileSync(providersFile, JSON.stringify(finalProviders, null, 2));

  // Save current allocations (for display)
  const allocationsFile = path.join(OUTPUT_DIR, 'all_allocations.json');
  fs.writeFileSync(allocationsFile, JSON.stringify(currentAllocations, null, 2));

  // Save historical allocations (for ML prediction only)
  const historicalFile = path.join(OUTPUT_DIR, 'historical_allocations.json');
  fs.writeFileSync(historicalFile, JSON.stringify(historicalAllocations, null, 2));

  // Statistics
  console.log('\n=== Parse Complete ===');
  console.log(`PRIMARY FILES: ${PRIMARY_PROVIDER_FILES.length} files`);
  console.log(`Total providers from primary files: ${finalProviders.length}`);
  console.log(`Current allocations (${CURRENT_YEAR}+): ${currentAllocations.length}`);
  console.log(`Historical allocations (for ML): ${historicalAllocations.length}`);

  // Count by service type
  const byServiceType = new Map<string, number>();
  for (const alloc of allAllocations) {
    byServiceType.set(alloc.serviceType, (byServiceType.get(alloc.serviceType) || 0) + 1);
  }

  console.log('\nAllocations by service type:');
  for (const [type, count] of byServiceType.entries()) {
    console.log(`  ${type}: ${count}`);
  }

  // Count by provider type
  const byProviderType = new Map<string, number>();
  for (const p of finalProviders) {
    byProviderType.set(p.providerType, (byProviderType.get(p.providerType) || 0) + 1);
  }

  console.log('\nProviders by type:');
  for (const [type, count] of byProviderType.entries()) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\nOutput saved to:`);
  console.log(`  ${providersFile}`);
  console.log(`  ${allocationsFile}`);
}

parseAllCasData().catch(console.error);
