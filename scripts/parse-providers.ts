/**
 * Script to parse provider Excel files and extract normalized data
 *
 * Usage: npm run sync:parse
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

interface ParsedProvider {
  cui?: string;
  name: string;
  providerType: string;
  address?: string;
  city?: string;
  county: string;
  phone?: string;
  email?: string;
  specialties: string[];
  contractNumber?: string;
  dataSource: string;
}

const DATA_DIR = path.join(process.cwd(), 'data', 'current');
const OUTPUT_FILE = path.join(DATA_DIR, 'parsed_providers.json');

// Column name patterns to identify header row
const NAME_PATTERNS = ['denumire', 'den.furnizor', 'furnizor', 'nume'];
const ADDRESS_PATTERNS = ['adresa', 'sediu'];
const PHONE_PATTERNS = ['telefon', 'tel'];
const EMAIL_PATTERNS = ['email', 'e-mail'];

function matchesPattern(value: string, patterns: string[]): boolean {
  const lower = value.toLowerCase().trim();
  return patterns.some(p => lower.includes(p));
}

// Find the header row index by looking for known column names
function findHeaderRow(data: any[][]): number {
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!row) continue;

    const hasNameCol = row.some(cell =>
      cell && matchesPattern(String(cell), NAME_PATTERNS)
    );
    const hasAddressOrPhone = row.some(cell =>
      cell && (matchesPattern(String(cell), ADDRESS_PATTERNS) ||
               matchesPattern(String(cell), PHONE_PATTERNS))
    );

    if (hasNameCol && hasAddressOrPhone) {
      return i;
    }
  }
  return -1;
}

// Build column index map from header row
function buildColumnMap(headerRow: any[]): Record<string, number> {
  const map: Record<string, number> = {};

  headerRow.forEach((cell, index) => {
    if (!cell) return;
    const value = String(cell).toLowerCase().trim();

    if (matchesPattern(value, NAME_PATTERNS) && !map.name) {
      map.name = index;
    } else if (matchesPattern(value, ADDRESS_PATTERNS) && !map.address) {
      map.address = index;
    } else if (matchesPattern(value, PHONE_PATTERNS) && !map.phone) {
      map.phone = index;
    } else if (matchesPattern(value, EMAIL_PATTERNS) && !map.email) {
      map.email = index;
    } else if (value.includes('cui') || value.includes('cod fiscal')) {
      map.cui = index;
    } else if (value.includes('contract')) {
      map.contract = index;
    }
  });

  return map;
}

// Parse a single Excel file
function parseExcelFile(filePath: string): ParsedProvider[] {
  console.log(`\nParsing: ${path.basename(filePath)}`);

  const providers: ParsedProvider[] = [];

  // Skip temp files
  if (path.basename(filePath).startsWith('~$')) {
    console.log('  (skipping temp file)');
    return providers;
  }

  // Skip fund allocation files
  if (filePath.includes('valori')) {
    console.log('  (skipping fund allocation file)');
    return providers;
  }

  try {
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      console.log(`  Sheet: ${sheetName}`);

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length < 3) {
        console.log('    (insufficient data)');
        continue;
      }

      // Find header row
      const headerRowIndex = findHeaderRow(data);
      if (headerRowIndex === -1) {
        console.log('    (no header found)');
        continue;
      }

      // Build column map
      const columnMap = buildColumnMap(data[headerRowIndex]);
      if (!columnMap.name) {
        console.log('    (no name column found)');
        continue;
      }

      console.log(`    Header at row ${headerRowIndex}, columns: ${JSON.stringify(columnMap)}`);

      // Parse data rows
      let count = 0;
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        // Get name
        const name = columnMap.name !== undefined ? String(row[columnMap.name] || '').trim() : '';
        if (!name || name.length < 3) continue;

        // Skip if name looks like a header or number
        if (/^(nr|denumire|furnizor|\d+)$/i.test(name)) continue;

        const provider: ParsedProvider = {
          name,
          providerType: 'paraclinic',
          county: 'B',
          dataSource: path.basename(filePath),
          specialties: [sheetName], // Use sheet name as specialty
        };

        if (columnMap.address !== undefined && row[columnMap.address]) {
          provider.address = String(row[columnMap.address]).trim();
          // Extract city from address if it starts with București
          if (provider.address.toLowerCase().includes('bucureşti') ||
              provider.address.toLowerCase().includes('bucuresti')) {
            provider.city = 'București';
          }
        }

        if (columnMap.phone !== undefined && row[columnMap.phone]) {
          provider.phone = String(row[columnMap.phone]).trim();
        }

        if (columnMap.email !== undefined && row[columnMap.email]) {
          provider.email = String(row[columnMap.email]).trim().toLowerCase();
        }

        if (columnMap.cui !== undefined && row[columnMap.cui]) {
          provider.cui = String(row[columnMap.cui]).replace(/\D/g, '');
        }

        if (columnMap.contract !== undefined && row[columnMap.contract]) {
          provider.contractNumber = String(row[columnMap.contract]).trim();
        }

        providers.push(provider);
        count++;
      }

      console.log(`    Parsed ${count} providers`);
    }
  } catch (error) {
    console.error(`  ✗ Error parsing file: ${error}`);
  }

  return providers;
}

// Main function
async function parseProviders() {
  console.log('=== FondCAS Provider Parser ===\n');

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    console.log('Run "npm run sync:download" first.');
    process.exit(1);
  }

  // Find all Excel files
  const files = fs.readdirSync(DATA_DIR).filter(f =>
    (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$')
  );

  if (files.length === 0) {
    console.log('No Excel files found in data directory.');
    console.log('Run "npm run sync:download" first.');
    process.exit(1);
  }

  console.log(`Found ${files.length} Excel file(s)`);

  // Parse all files
  const allProviders: ParsedProvider[] = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const providers = parseExcelFile(filePath);
    allProviders.push(...providers);
  }

  // Deduplicate by name (merge specialties)
  const uniqueProviders = new Map<string, ParsedProvider>();

  for (const provider of allProviders) {
    const key = provider.name.toLowerCase();

    if (uniqueProviders.has(key)) {
      const existing = uniqueProviders.get(key)!;
      const combinedSpecialties = new Set([
        ...existing.specialties,
        ...provider.specialties,
      ]);
      existing.specialties = Array.from(combinedSpecialties);
      // Merge any missing fields
      if (!existing.address && provider.address) existing.address = provider.address;
      if (!existing.phone && provider.phone) existing.phone = provider.phone;
      if (!existing.email && provider.email) existing.email = provider.email;
    } else {
      uniqueProviders.set(key, provider);
    }
  }

  const finalProviders = Array.from(uniqueProviders.values());

  // Save to JSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalProviders, null, 2));

  console.log('\n=== Parse Complete ===');
  console.log(`Total providers: ${allProviders.length}`);
  console.log(`Unique providers: ${finalProviders.length}`);
  console.log(`Output saved to: ${OUTPUT_FILE}`);
  console.log('\nNext step: npm run sync:geocode');
}

parseProviders().catch(console.error);
