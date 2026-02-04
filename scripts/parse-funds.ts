/**
 * Script to parse fund allocation Excel files
 *
 * Usage: npm run sync:parse (runs after parse-providers.ts)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

interface ParsedFundAllocation {
  providerCui?: string;
  providerName: string;
  periodYear: number;
  periodMonth: number;
  serviceType: string;
  allocatedAmount: number;
  consumedAmount?: number;
  availableAmount?: number;
  contractNumber?: string;
  dataSource: string;
}

const DATA_DIR = path.join(process.cwd(), 'data', 'current');
const OUTPUT_FILE = path.join(DATA_DIR, 'parsed_funds.json');

// Parse currency value
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

// Extract period from filename
function extractPeriodFromFilename(filename: string): { year: number; month: number } {
  // Try pattern like "FEBRUARIE 2026" in filename
  const monthNames: Record<string, number> = {
    'ianuarie': 1, 'february': 2, 'februarie': 2, 'march': 3, 'martie': 3,
    'april': 4, 'aprilie': 4, 'may': 5, 'mai': 5, 'june': 6, 'iunie': 6,
    'july': 7, 'iulie': 7, 'august': 8, 'september': 9, 'septembrie': 9,
    'october': 10, 'octombrie': 10, 'november': 11, 'noiembrie': 11,
    'december': 12, 'decembrie': 12
  };

  const lowerFilename = filename.toLowerCase();

  for (const [monthName, monthNum] of Object.entries(monthNames)) {
    if (lowerFilename.includes(monthName)) {
      const yearMatch = filename.match(/20\d{2}/);
      if (yearMatch) {
        return {
          year: parseInt(yearMatch[0]),
          month: monthNum
        };
      }
    }
  }

  // Default to current date
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// Parse fund allocation Excel file
function parseFundsFile(filePath: string): ParsedFundAllocation[] {
  console.log(`\nParsing funds: ${path.basename(filePath)}`);

  const allocations: ParsedFundAllocation[] = [];

  // Skip temp files
  if (path.basename(filePath).startsWith('~$')) {
    return allocations;
  }

  try {
    const workbook = XLSX.readFile(filePath);
    const period = extractPeriodFromFilename(path.basename(filePath));
    console.log(`  Period: ${period.month}/${period.year}`);

    for (const sheetName of workbook.SheetNames) {
      console.log(`  Sheet: ${sheetName}`);

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length < 5) {
        console.log('    (insufficient data)');
        continue;
      }

      // Find header row - looking for "DENUMIRE FURNIZOR" or "NR.CRT."
      let headerRowIndex = -1;
      let nameColIndex = -1;
      let contractColIndex = -1;
      let totalColIndex = -1;

      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!row) continue;

        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').toLowerCase().trim();

          if (cell.includes('denumire') && cell.includes('furnizor')) {
            headerRowIndex = i;
            nameColIndex = j;
          } else if (cell === 'nr. contr' || cell === 'nr.contr' || cell.includes('nr. contr')) {
            contractColIndex = j;
          } else if (cell === 'total') {
            totalColIndex = j;
          }
        }

        if (headerRowIndex !== -1) break;
      }

      if (headerRowIndex === -1 || nameColIndex === -1) {
        console.log('    (no header found)');
        continue;
      }

      // If no TOTAL column found in header, look in the next row (sub-header)
      if (totalColIndex === -1 && headerRowIndex + 1 < data.length) {
        const subHeaderRow = data[headerRowIndex + 1];
        if (subHeaderRow) {
          for (let j = 0; j < subHeaderRow.length; j++) {
            const cell = String(subHeaderRow[j] || '').toLowerCase().trim();
            if (cell === 'total') {
              totalColIndex = j;
              break;
            }
          }
        }
      }

      console.log(`    Header at row ${headerRowIndex}, name col ${nameColIndex}, contract col ${contractColIndex}, total col ${totalColIndex}`);

      // Parse data rows (start after header and possible sub-header)
      const hasSubHeader = totalColIndex !== -1 && headerRowIndex + 1 < data.length &&
        data[headerRowIndex + 1]?.some((c: any) => String(c || '').toLowerCase().includes('laborator'));
      const dataStartRow = hasSubHeader ? headerRowIndex + 2 : headerRowIndex + 1;

      let count = 0;
      for (let i = dataStartRow; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        // Get provider name
        const name = String(row[nameColIndex] || '').trim();
        if (!name || name.length < 3) continue;

        // Skip summary rows and headers
        if (name.toLowerCase().includes('total') ||
            name.toLowerCase().includes('denumire') ||
            /^\d+$/.test(name)) continue;

        // Get contract number if available
        const contractNumber = contractColIndex !== -1
          ? String(row[contractColIndex] || '').trim()
          : undefined;

        // Get allocated amount (TOTAL column)
        let allocatedAmount: number | undefined;

        if (totalColIndex !== -1) {
          allocatedAmount = parseCurrency(row[totalColIndex]);
        }

        // If no total, try to find any numeric value that looks like an amount
        if (!allocatedAmount) {
          for (let j = nameColIndex + 1; j < row.length; j++) {
            const val = parseCurrency(row[j]);
            if (val && val > 100) {  // Assume amounts are at least 100 lei
              allocatedAmount = val;
              break;
            }
          }
        }

        if (!allocatedAmount || allocatedAmount <= 0) continue;

        allocations.push({
          providerName: name,
          periodYear: period.year,
          periodMonth: period.month,
          serviceType: 'paraclinic',
          allocatedAmount,
          contractNumber,
          dataSource: path.basename(filePath)
        });

        count++;
      }

      console.log(`    Parsed ${count} fund allocations`);
    }
  } catch (error) {
    console.error(`  ✗ Error parsing file: ${error}`);
  }

  return allocations;
}

// Main function
async function parseFunds() {
  console.log('=== FondCAS Fund Allocation Parser ===');

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  // Find fund allocation files (files with 'valori' in name)
  const files = fs.readdirSync(DATA_DIR).filter(f =>
    (f.endsWith('.xlsx') || f.endsWith('.xls')) &&
    !f.startsWith('~$') &&
    f.toLowerCase().includes('valori')
  );

  if (files.length === 0) {
    console.log('No fund allocation files found.');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2));
    return;
  }

  console.log(`\nFound ${files.length} fund allocation file(s)`);

  // Parse all files
  const allAllocations: ParsedFundAllocation[] = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const allocations = parseFundsFile(filePath);
    allAllocations.push(...allocations);
  }

  // Save to JSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allAllocations, null, 2));

  console.log('\n=== Parse Complete ===');
  console.log(`Total allocations: ${allAllocations.length}`);
  console.log(`Output saved to: ${OUTPUT_FILE}`);
}

parseFunds().catch(console.error);
