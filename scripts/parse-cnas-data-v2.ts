/**
 * Parse CNAS Data v2
 *
 * Creates organizations and their primary locations from CNAS Excel files.
 * This is Step 1 of the data pipeline.
 *
 * Usage: npx tsx scripts/parse-cnas-data-v2.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const CAS_DATA_DIR = path.join(process.cwd(), 'data', 'CAS');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'v2');

// Primary provider files - source of truth for CNAS contracts
const PRIMARY_PROVIDER_FILES = [
  { file: '20251215-furnizori-de-servicii-medicale-si-conexe-in-contract-la-01.12.2025.xlsx', type: 'clinic' as const },
  { file: '20250526-lista-furnizori-investigatii-paraclinice-01.04.2025.xlsx', type: 'paraclinic' as const },
  { file: '20250605-lista-furnizori-servicii-medicale-de-recuperare-reabilitare (1).xlsx', type: 'recovery' as const },
  { file: '20251212-furnizori-de-servicii-de-ecografie.xlsx', type: 'clinic' as const },
  { file: '20250520-contracte-spitale-mai-2025.xlsx', type: 'hospital' as const },
];

// ============================================
// TYPES
// ============================================

interface ParsedRow {
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
  dataSourceDate?: string;
}

interface Organization {
  cui?: string;
  legalName: string;
  providerType: string;
  cnasContractNumber?: string;
  dataSource: string;
  dataSourceDate?: string;
  specialties: string[];
  // Primary location data (from CNAS file)
  primaryLocation: {
    address?: string;
    city?: string;
    county: string;
    phone?: string;
    email?: string;
    website?: string;
  };
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

// ============================================
// PARSING HELPERS (from original script)
// ============================================

function extractFileDate(filename: string): string | undefined {
  const dateMatch = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }
  return undefined;
}

function getServiceType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('reca') || lower.includes('recuperare') || lower.includes('reabilitare')) return 'recovery';
  if (lower.includes('paraclinic') || lower.includes('laborator')) return 'paraclinic';
  if (lower.includes('spital')) return 'hospital';
  if (lower.includes('clinic') && !lower.includes('paraclinic')) return 'clinic';
  if (lower.includes('eco') || lower.includes('ecograf')) return 'ultrasound';
  return 'other';
}

function extractPeriod(filename: string): { year: number; month: number } {
  const monthNames: Record<string, number> = {
    'ianuarie': 1, 'februarie': 2, 'martie': 3, 'aprilie': 4,
    'mai': 5, 'iunie': 6, 'iulie': 7, 'august': 8,
    'septembrie': 9, 'octombrie': 10, 'noiembrie': 11, 'decembrie': 12
  };

  const lower = filename.toLowerCase();
  for (const [monthName, monthNum] of Object.entries(monthNames)) {
    if (lower.includes(monthName)) {
      const yearMatch = filename.match(/20\d{2}/g);
      if (yearMatch) {
        return { year: parseInt(yearMatch[yearMatch.length - 1]), month: monthNum };
      }
    }
  }

  const dateMatch = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (dateMatch) {
    return { year: parseInt(dateMatch[1]), month: parseInt(dateMatch[2]) };
  }

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function isFundAllocationFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.includes('valori') || lower.includes('alocare') || lower.includes('transe');
}

function parseCurrency(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Math.abs(value);
  const str = String(value).replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? undefined : Math.abs(num);
}

function findHeaderRow(data: any[][]): { index: number; columns: Record<string, number> } {
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const columns: Record<string, number> = {};

    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').toLowerCase().trim();

      if ((cell.includes('denumire') && (cell.includes('furnizor') || cell.includes('unitat'))) ||
          (cell.includes('nume') && cell.includes('furnizor')) ||
          cell === 'denumire' || cell === 'furnizor' ||
          cell === 'denumire furnizor' || cell === 'nume furnizor') {
        columns.name = j;
      }
      else if (cell.includes('cui') || cell.includes('cif') || cell.includes('cod fiscal') ||
               cell.includes('cod unic') || cell === 'c.u.i.' || cell === 'c.i.f.') {
        columns.cui = j;
      }
      else if ((cell.includes('nr') && cell.includes('contr')) || cell === 'contract') {
        columns.contract = j;
      }
      else if (cell.includes('punct') && cell.includes('lucru')) {
        columns.punctLucru = j;
      }
      else if (cell.includes('sediu') && cell.includes('social')) {
        columns.sediuSocial = j;
      }
      else if (cell.includes('adresa') && !columns.address) {
        columns.address = j;
      }
      else if (cell.includes('telefon') || cell.includes('tel')) {
        columns.phone = j;
      }
      else if (cell.includes('email') || cell.includes('e-mail')) {
        columns.email = j;
      }
      else if (cell.includes('website') || cell.includes('web') || cell.includes('site')) {
        columns.website = j;
      }
      else if (cell.includes('specialitat') || cell.includes('serviciu') || cell.includes('tip serviciu')) {
        columns.specialty = j;
      }
      else if (cell === 'total' || cell.includes('valoare') || cell.includes('suma')) {
        if (!columns.total) columns.total = j;
      }
    }

    if (columns.name !== undefined) {
      return { index: i, columns };
    }
  }

  return { index: -1, columns: {} };
}

// ============================================
// MAIN PARSING
// ============================================

function parseExcelFile(filePath: string, overrideType?: string): { rows: ParsedRow[]; allocations: ParsedFundAllocation[] } {
  const filename = path.basename(filePath);
  const rows: ParsedRow[] = [];
  const allocations: ParsedFundAllocation[] = [];

  if (filename.startsWith('~$')) {
    return { rows, allocations };
  }

  const serviceType = getServiceType(filename);
  const providerType = overrideType || serviceType;
  const period = extractPeriod(filename);
  const isAllocation = isFundAllocationFile(filename);

  try {
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length < 3) continue;

      const { index: headerIndex, columns } = findHeaderRow(data);
      if (headerIndex === -1 || columns.name === undefined) continue;

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

      for (let i = dataStartRow; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        const name = String(row[columns.name] || '').trim();
        if (!name || name.length < 3) continue;
        if (name.toLowerCase().includes('total') || /^\d+$/.test(name)) continue;

        // Fund allocations
        if (isAllocation) {
          let amount: number | undefined;
          if (columns.total !== undefined) {
            amount = parseCurrency(row[columns.total]);
          }
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

            if (columns.cui !== undefined && row[columns.cui]) {
              const cuiValue = String(row[columns.cui]).trim().replace(/\D/g, '');
              if (cuiValue.length >= 4 && cuiValue.length <= 12) {
                allocation.providerCui = cuiValue;
              }
            }

            allocations.push(allocation);
          }
        }

        // Provider data
        const parsed: ParsedRow = {
          name,
          providerType,
          county: 'B',
          specialties: [],
          dataSource: filename,
          dataSourceDate: extractFileDate(filename)
        };

        // CUI
        if (columns.cui !== undefined && row[columns.cui]) {
          const cuiValue = String(row[columns.cui]).trim().replace(/\D/g, '');
          if (cuiValue.length >= 4 && cuiValue.length <= 12) {
            parsed.cui = cuiValue;
          }
        }

        // Address (prefer punct_lucru)
        if (columns.punctLucru !== undefined && row[columns.punctLucru]) {
          parsed.address = String(row[columns.punctLucru]).trim();
          parsed.addressType = 'punct_lucru';
        } else if (columns.sediuSocial !== undefined && row[columns.sediuSocial]) {
          parsed.address = String(row[columns.sediuSocial]).trim();
          parsed.addressType = 'sediu_social';
        } else if (columns.address !== undefined && row[columns.address]) {
          parsed.address = String(row[columns.address]).trim();
          parsed.addressType = 'unknown';
        }

        if (parsed.address) {
          if (parsed.address.toLowerCase().includes('bucureşti') ||
              parsed.address.toLowerCase().includes('bucuresti')) {
            parsed.city = 'București';
          }
        }

        if (columns.phone !== undefined && row[columns.phone]) {
          parsed.phone = String(row[columns.phone]).trim();
        }
        if (columns.email !== undefined && row[columns.email]) {
          parsed.email = String(row[columns.email]).trim().toLowerCase();
        }
        if (columns.website !== undefined && row[columns.website]) {
          parsed.website = String(row[columns.website]).trim().toLowerCase();
        }
        if (columns.contract !== undefined && row[columns.contract]) {
          parsed.contractNumber = String(row[columns.contract]).trim();
        }

        // Specialties
        if (columns.specialty !== undefined && row[columns.specialty]) {
          const specialtyValue = String(row[columns.specialty]).trim();
          if (specialtyValue) {
            const specialtyParts = specialtyValue.split(/[\/,]/).map(s => s.trim().toLowerCase()).filter(s => s.length > 2);
            for (const spec of specialtyParts) {
              if (spec === 'other' || spec === 'clinic' || spec === 'paraclinic') continue;
              if (!parsed.specialties.includes(spec)) {
                parsed.specialties.push(spec);
              }
            }
          }
        }

        rows.push(parsed);
      }
    }
  } catch (error) {
    console.error(`  Error parsing ${filename}:`, error);
  }

  return { rows, allocations };
}

// ============================================
// ORGANIZATION BUILDING
// ============================================

function buildOrganizations(rows: ParsedRow[]): Map<string, Organization> {
  const organizations = new Map<string, Organization>();

  for (const row of rows) {
    // Key: prefer CUI, fallback to normalized name
    const key = row.cui || normalizeName(row.name);

    if (organizations.has(key)) {
      // Merge with existing
      const existing = organizations.get(key)!;

      // Merge specialties
      const specs = new Set([...existing.specialties, ...row.specialties]);
      existing.specialties = Array.from(specs);

      // Update with better data if available
      if (!existing.primaryLocation.phone && row.phone) {
        existing.primaryLocation.phone = row.phone;
      }
      if (!existing.primaryLocation.email && row.email) {
        existing.primaryLocation.email = row.email;
      }
      if (!existing.primaryLocation.website && row.website) {
        existing.primaryLocation.website = row.website;
      }
      // Prefer punct_lucru address
      if (row.addressType === 'punct_lucru' && row.address) {
        existing.primaryLocation.address = row.address;
      }
    } else {
      // Create new organization
      const org: Organization = {
        cui: row.cui,
        legalName: row.name,
        providerType: row.providerType,
        cnasContractNumber: row.contractNumber,
        dataSource: row.dataSource,
        dataSourceDate: row.dataSourceDate,
        specialties: [...row.specialties],
        primaryLocation: {
          address: row.address,
          city: row.city,
          county: row.county,
          phone: row.phone,
          email: row.email,
          website: row.website,
        }
      };
      organizations.set(key, org);
    }
  }

  return organizations;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bs\.?c\.?\s*/gi, '')
    .replace(/\bs\.?r\.?l\.?\s*$/gi, '')
    .replace(/\bs\.?a\.?\s*$/gi, '')
    .replace(/[.,;:'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  console.log('=== Parse CNAS Data v2 ===\n');
  console.log('Step 1: Parse CNAS files → Create Organizations + Primary Locations\n');

  if (!fs.existsSync(CAS_DATA_DIR)) {
    console.error(`CAS data directory not found: ${CAS_DATA_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Parse primary files
  console.log('Parsing primary provider files...\n');
  const allRows: ParsedRow[] = [];
  const allAllocations: ParsedFundAllocation[] = [];

  for (const pf of PRIMARY_PROVIDER_FILES) {
    const filePath = path.join(CAS_DATA_DIR, pf.file);
    if (!fs.existsSync(filePath)) {
      console.log(`  WARNING: File not found: ${pf.file}`);
      continue;
    }

    console.log(`  Parsing: ${pf.file}`);
    const { rows, allocations } = parseExcelFile(filePath, pf.type);
    console.log(`    → ${rows.length} providers (${pf.type})`);

    allRows.push(...rows);
    allAllocations.push(...allocations);
  }

  // Parse additional allocation files
  console.log('\nParsing allocation files...\n');
  const files = fs.readdirSync(CAS_DATA_DIR)
    .filter(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'))
    .filter(f => !PRIMARY_PROVIDER_FILES.some(pf => pf.file === f));

  for (const file of files) {
    if (!isFundAllocationFile(file)) continue;

    const filePath = path.join(CAS_DATA_DIR, file);
    console.log(`  Parsing: ${file.substring(0, 50)}...`);
    const { allocations } = parseExcelFile(filePath);
    if (allocations.length > 0) {
      console.log(`    → ${allocations.length} allocations`);
      allAllocations.push(...allocations);
    }
  }

  // Build organizations
  console.log('\nBuilding organizations...');
  const organizations = buildOrganizations(allRows);
  console.log(`  → ${organizations.size} unique organizations`);

  // Convert to array for output
  const orgsArray = Array.from(organizations.values());

  // Statistics
  const withCui = orgsArray.filter(o => o.cui).length;
  const withAddress = orgsArray.filter(o => o.primaryLocation.address).length;
  const withPhone = orgsArray.filter(o => o.primaryLocation.phone).length;
  const withEmail = orgsArray.filter(o => o.primaryLocation.email).length;

  const byType = new Map<string, number>();
  for (const org of orgsArray) {
    byType.set(org.providerType, (byType.get(org.providerType) || 0) + 1);
  }

  console.log('\n=== Statistics ===');
  console.log(`Total organizations: ${orgsArray.length}`);
  console.log(`  With CUI: ${withCui} (${Math.round(withCui / orgsArray.length * 100)}%)`);
  console.log(`  With address: ${withAddress} (${Math.round(withAddress / orgsArray.length * 100)}%)`);
  console.log(`  With phone: ${withPhone} (${Math.round(withPhone / orgsArray.length * 100)}%)`);
  console.log(`  With email: ${withEmail} (${Math.round(withEmail / orgsArray.length * 100)}%)`);

  console.log('\nBy provider type:');
  for (const [type, count] of byType.entries()) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\nTotal allocations: ${allAllocations.length}`);

  // Save outputs
  const orgsFile = path.join(OUTPUT_DIR, 'organizations.json');
  const allocsFile = path.join(OUTPUT_DIR, 'allocations.json');

  fs.writeFileSync(orgsFile, JSON.stringify(orgsArray, null, 2));
  fs.writeFileSync(allocsFile, JSON.stringify(allAllocations, null, 2));

  console.log('\n=== Output ===');
  console.log(`  ${orgsFile}`);
  console.log(`  ${allocsFile}`);

  console.log('\n✓ Step 1 complete. Run next: npx tsx scripts/ai-enrich-organizations.ts');
}

main().catch(console.error);
