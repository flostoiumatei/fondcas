/**
 * Parse Historical Funds Script
 *
 * Parses historical Excel files and extracts fund consumption data
 * for ML training purposes
 *
 * Usage: npm run sync:parse-historical
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const DATA_DIR = path.join(process.cwd(), 'data', 'historical');
const OUTPUT_FILE = path.join(DATA_DIR, 'parsed_historical_funds.json');

interface HistoricalFundRecord {
  providerCui?: string;
  providerName: string;
  year: number;
  month: number;
  dayOfMonth?: number;
  allocatedAmount: number;
  consumedAmount?: number;
  consumptionRate?: number;
  serviceType: string;
  specialtyCategory?: string;
  isEndOfQuarter: boolean;
  isDecember: boolean;
  daysUntilMonthEnd?: number;
  sourceFile: string;
}

// Column name mappings (Romanian to English)
const COLUMN_MAPPINGS: Record<string, string> = {
  // Provider identification
  'cui': 'cui',
  'c.u.i.': 'cui',
  'cod fiscal': 'cui',
  'cif': 'cui',
  'denumire': 'name',
  'denumire furnizor': 'name',
  'furnizor': 'name',
  'nume furnizor': 'name',
  'denumirea furnizorului': 'name',

  // Financial data
  'valoare contract': 'allocatedAmount',
  'valoare': 'allocatedAmount',
  'suma contractata': 'allocatedAmount',
  'valoare contractata': 'allocatedAmount',
  'contract': 'allocatedAmount',
  'buget': 'allocatedAmount',
  'alocat': 'allocatedAmount',
  'suma alocata': 'allocatedAmount',

  'decontat': 'consumedAmount',
  'realizat': 'consumedAmount',
  'consumat': 'consumedAmount',
  'suma decontata': 'consumedAmount',
  'valoare decontata': 'consumedAmount',
  'executie': 'consumedAmount',

  'disponibil': 'availableAmount',
  'rest': 'availableAmount',
  'ramas': 'availableAmount',
  'diferenta': 'availableAmount'
};

/**
 * Normalize column name
 */
function normalizeColumnName(name: string): string {
  const normalized = name.toLowerCase().trim();
  return COLUMN_MAPPINGS[normalized] || normalized;
}

/**
 * Parse currency value
 */
function parseCurrency(value: any): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  const str = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const num = parseFloat(str);
  return isNaN(num) ? undefined : num;
}

/**
 * Extract year and month from filename
 */
function extractPeriodFromFilename(filename: string): { year: number; month: number } | null {
  // Try prefix pattern: bucuresti_allocation_01_20240115_...
  const prefixMatch = filename.match(/_(\d{2})_\d{8}_/);
  if (prefixMatch) {
    const fullMatch = filename.match(/_(\d{2})_(\d{4})(\d{2})/);
    if (fullMatch) {
      return {
        year: parseInt(fullMatch[2]),
        month: parseInt(fullMatch[1])
      };
    }
  }

  // Try year folder extraction
  const yearFolderMatch = filename.match(/[\\\/](\d{4})[\\\/]/);
  const monthMatch = filename.match(/_(\d{2})_/);
  if (yearFolderMatch && monthMatch) {
    return {
      year: parseInt(yearFolderMatch[1]),
      month: parseInt(monthMatch[1])
    };
  }

  // Romanian month names
  const monthNames: Record<string, number> = {
    'ianuarie': 1, 'februarie': 2, 'martie': 3, 'aprilie': 4,
    'mai': 5, 'iunie': 6, 'iulie': 7, 'august': 8,
    'septembrie': 9, 'octombrie': 10, 'noiembrie': 11, 'decembrie': 12
  };

  for (const [monthName, monthNum] of Object.entries(monthNames)) {
    if (filename.toLowerCase().includes(monthName)) {
      const yearMatch = filename.match(/(\d{4})/);
      if (yearMatch) {
        return {
          year: parseInt(yearMatch[1]),
          month: monthNum
        };
      }
    }
  }

  return null;
}

/**
 * Parse a single Excel file
 */
function parseExcelFile(filePath: string): HistoricalFundRecord[] {
  const records: HistoricalFundRecord[] = [];
  const filename = path.basename(filePath);

  // Extract period from filename or path
  const period = extractPeriodFromFilename(filePath);
  if (!period) {
    console.warn(`Could not extract period from: ${filename}`);
    return records;
  }

  try {
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length < 2) continue;

      // Find header row
      let headerRowIndex = -1;
      let columnMap: Record<string, number> = {};

      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!row) continue;

        const hasNameCol = row.some((cell: any) => {
          const str = String(cell || '').toLowerCase();
          return str.includes('denumire') || str.includes('furnizor') || str.includes('nume');
        });

        const hasValueCol = row.some((cell: any) => {
          const str = String(cell || '').toLowerCase();
          return str.includes('valoare') || str.includes('contract') || str.includes('suma');
        });

        if (hasNameCol && hasValueCol) {
          headerRowIndex = i;

          // Build column map
          row.forEach((cell: any, index: number) => {
            if (cell) {
              const normalized = normalizeColumnName(String(cell));
              columnMap[normalized] = index;
            }
          });

          break;
        }
      }

      if (headerRowIndex === -1) continue;

      // Parse data rows
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        // Get provider name
        const nameIndex = columnMap['name'];
        const name = nameIndex !== undefined ? String(row[nameIndex] || '').trim() : '';

        if (!name || name.length < 3) continue;

        // Get CUI
        const cuiIndex = columnMap['cui'];
        const cui = cuiIndex !== undefined ? String(row[cuiIndex] || '').trim() : undefined;

        // Get amounts
        const allocatedIndex = columnMap['allocatedAmount'];
        const consumedIndex = columnMap['consumedAmount'];

        const allocatedAmount = allocatedIndex !== undefined
          ? parseCurrency(row[allocatedIndex])
          : undefined;

        const consumedAmount = consumedIndex !== undefined
          ? parseCurrency(row[consumedIndex])
          : undefined;

        if (!allocatedAmount || allocatedAmount <= 0) continue;

        // Calculate consumption rate
        const consumptionRate = consumedAmount && allocatedAmount
          ? consumedAmount / allocatedAmount
          : undefined;

        // Determine service type from filename
        let serviceType = 'paraclinic';
        if (filename.toLowerCase().includes('clinic')) {
          serviceType = 'clinic';
        } else if (filename.toLowerCase().includes('recup') || filename.toLowerCase().includes('recovery')) {
          serviceType = 'recovery';
        }

        // Calculate contextual features
        const isEndOfQuarter = [3, 6, 9, 12].includes(period.month);
        const isDecember = period.month === 12;
        const daysInMonth = new Date(period.year, period.month, 0).getDate();

        records.push({
          providerCui: cui,
          providerName: name,
          year: period.year,
          month: period.month,
          allocatedAmount,
          consumedAmount,
          consumptionRate,
          serviceType,
          isEndOfQuarter,
          isDecember,
          daysUntilMonthEnd: daysInMonth,
          sourceFile: filename
        });
      }
    }
  } catch (error) {
    console.error(`Error parsing ${filename}:`, error);
  }

  return records;
}

/**
 * Find all Excel files recursively
 */
function findExcelFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findExcelFiles(fullPath));
    } else if (entry.isFile() && /\.xlsx?$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Main parsing function
 */
async function parseHistoricalFunds(): Promise<void> {
  console.log('Starting historical data parsing...\n');

  // Find all Excel files
  const excelFiles = findExcelFiles(DATA_DIR);
  console.log(`Found ${excelFiles.length} Excel files`);

  if (excelFiles.length === 0) {
    console.warn('No Excel files found. Run npm run sync:download-historical first.');
    return;
  }

  // Parse all files
  const allRecords: HistoricalFundRecord[] = [];

  for (const file of excelFiles) {
    console.log(`Parsing: ${path.basename(file)}`);
    const records = parseExcelFile(file);
    console.log(`  Found ${records.length} records`);
    allRecords.push(...records);
  }

  // Remove duplicates (same provider + year + month + service type)
  const uniqueKey = (r: HistoricalFundRecord) =>
    `${r.providerCui || r.providerName}_${r.year}_${r.month}_${r.serviceType}`;

  const uniqueRecords = Array.from(
    new Map(allRecords.map(r => [uniqueKey(r), r])).values()
  );

  // Sort by year, month
  uniqueRecords.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.providerName.localeCompare(b.providerName);
  });

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueRecords, null, 2));

  // Print statistics
  const years = [...new Set(uniqueRecords.map(r => r.year))].sort();
  const providers = new Set(uniqueRecords.map(r => r.providerCui || r.providerName));

  console.log('\n=== Parsing Complete ===');
  console.log(`Total records: ${uniqueRecords.length}`);
  console.log(`Unique providers: ${providers.size}`);
  console.log(`Years covered: ${years.join(', ')}`);
  console.log(`\nOutput saved to: ${OUTPUT_FILE}`);

  // Print sample
  console.log('\n--- Sample Records ---');
  uniqueRecords.slice(0, 3).forEach(r => {
    console.log(`${r.providerName} (${r.year}/${r.month}): ${r.allocatedAmount} allocated, ${r.consumptionRate?.toFixed(2) || 'N/A'} rate`);
  });
}

// Run the script
parseHistoricalFunds().catch(console.error);
