/**
 * Search Excel files for a specific term
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const CAS_DATA_DIR = path.join(process.cwd(), 'data', 'CAS');
const searchTerm = process.argv[2] || 'Ghencea Medical';

console.log(`Searching for "${searchTerm}" in all Excel files...\n`);

const files = fs.readdirSync(CAS_DATA_DIR)
  .filter(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'));

let totalMatches = 0;

for (const file of files) {
  const filePath = path.join(CAS_DATA_DIR, file);

  try {
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;

        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '');
          if (cell.toLowerCase().includes(searchTerm.toLowerCase())) {
            console.log(`\n📄 ${file}`);
            console.log(`   Sheet: ${sheetName}, Row: ${i + 1}`);
            console.log(`   Match: "${cell.substring(0, 100)}${cell.length > 100 ? '...' : ''}"`);

            // Print some context (other cells in the row)
            const context = row.filter((c: any) => c !== null && c !== undefined && c !== '').slice(0, 6);
            console.log(`   Row data: ${JSON.stringify(context)}`);

            totalMatches++;
          }
        }
      }
    }
  } catch (error) {
    // Skip files that can't be read
  }
}

console.log(`\n=== Search Complete ===`);
console.log(`Found ${totalMatches} matches for "${searchTerm}"`);
