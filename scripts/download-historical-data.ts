/**
 * Download Historical Data Script
 *
 * Downloads historical Excel files from CAS websites for ML training
 * Fetches data from 2020 onwards
 *
 * Usage: npm run sync:download-historical
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const DATA_DIR = path.join(process.cwd(), 'data', 'historical');

interface HistoricalFile {
  url: string;
  filename: string;
  year: number;
  month: number;
  type: 'allocation' | 'consumption';
  region: string;
}

// CAS București historical data pages
const HISTORICAL_SOURCES = [
  {
    region: 'bucuresti',
    name: 'CASMB Paraclinic Valori',
    baseUrl: 'https://www.casmb.ro',
    listPagePath: '/casmb_furniz_para_fisiere_contracte_valori',
    filePattern: /href="([^"]*\.xlsx?)"/gi,
    type: 'allocation' as const
  }
];

/**
 * Fetch URL content with redirect handling
 */
async function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          const fullUrl = redirectUrl.startsWith('http')
            ? redirectUrl
            : new URL(redirectUrl, url).href;
          fetchUrl(fullUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Download a file
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          const fullUrl = redirectUrl.startsWith('http')
            ? redirectUrl
            : new URL(redirectUrl, url).href;
          downloadFile(fullUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', reject);
    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Extract date from filename
 */
function extractDateFromFilename(filename: string): { year: number; month: number } | null {
  // Pattern 1: 20240202_... (YYYYMMDD prefix)
  const prefixMatch = filename.match(/^(\d{4})(\d{2})(\d{2})_/);
  if (prefixMatch) {
    return {
      year: parseInt(prefixMatch[1]),
      month: parseInt(prefixMatch[2])
    };
  }

  // Pattern 2: ...IANUARIE 2024... or ...FEBRUARY 2024...
  const monthNames: Record<string, number> = {
    'ianuarie': 1, 'february': 2, 'februarie': 2, 'march': 3, 'martie': 3,
    'april': 4, 'aprilie': 4, 'may': 5, 'mai': 5, 'june': 6, 'iunie': 6,
    'july': 7, 'iulie': 7, 'august': 8, 'september': 9, 'septembrie': 9,
    'october': 10, 'octombrie': 10, 'november': 11, 'noiembrie': 11,
    'december': 12, 'decembrie': 12
  };

  const monthPattern = new RegExp(
    `(${Object.keys(monthNames).join('|')})\\s*(\\d{4})`,
    'i'
  );
  const monthMatch = filename.match(monthPattern);
  if (monthMatch) {
    return {
      year: parseInt(monthMatch[2]),
      month: monthNames[monthMatch[1].toLowerCase()]
    };
  }

  // Pattern 3: dd.mm.yyyy in filename
  const dateMatch = filename.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dateMatch) {
    return {
      year: parseInt(dateMatch[3]),
      month: parseInt(dateMatch[2])
    };
  }

  return null;
}

/**
 * Parse historical file links from a page
 */
async function parseHistoricalFiles(source: typeof HISTORICAL_SOURCES[0]): Promise<HistoricalFile[]> {
  const pageUrl = `${source.baseUrl}${source.listPagePath}`;
  console.log(`Fetching: ${pageUrl}`);

  try {
    const html = await fetchUrl(pageUrl);
    const files: HistoricalFile[] = [];

    // Extract all Excel file links
    let match;
    while ((match = source.filePattern.exec(html)) !== null) {
      const href = match[1];

      // Skip non-Excel files
      if (!href.toLowerCase().endsWith('.xlsx') && !href.toLowerCase().endsWith('.xls')) {
        continue;
      }

      // Build full URL
      let fileUrl: string;
      if (href.startsWith('http')) {
        fileUrl = href;
      } else if (href.startsWith('/')) {
        fileUrl = `${source.baseUrl}${href}`;
      } else {
        fileUrl = `${source.baseUrl}/${href}`;
      }

      // Extract filename
      const filename = decodeURIComponent(path.basename(fileUrl));

      // Extract date from filename
      const dateInfo = extractDateFromFilename(filename);

      if (dateInfo && dateInfo.year >= 2020) {
        files.push({
          url: fileUrl,
          filename,
          year: dateInfo.year,
          month: dateInfo.month,
          type: source.type,
          region: source.region
        });
      }
    }

    return files;
  } catch (error) {
    console.error(`Error fetching ${pageUrl}:`, error);
    return [];
  }
}

/**
 * Main download function
 */
async function downloadHistoricalData(): Promise<void> {
  console.log('Starting historical data download...\n');

  // Create directory structure
  for (let year = 2020; year <= new Date().getFullYear(); year++) {
    const yearDir = path.join(DATA_DIR, year.toString());
    if (!fs.existsSync(yearDir)) {
      fs.mkdirSync(yearDir, { recursive: true });
    }
  }

  // Collect all files to download
  const allFiles: HistoricalFile[] = [];

  for (const source of HISTORICAL_SOURCES) {
    console.log(`\n--- Processing ${source.name} ---`);
    const files = await parseHistoricalFiles(source);
    console.log(`Found ${files.length} files`);
    allFiles.push(...files);
  }

  // Remove duplicates
  const uniqueFiles = allFiles.filter((file, index, self) =>
    index === self.findIndex(f => f.url === file.url)
  );

  console.log(`\nTotal unique files to download: ${uniqueFiles.length}`);

  // Download each file
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of uniqueFiles) {
    const yearDir = path.join(DATA_DIR, file.year.toString());
    const destPath = path.join(yearDir, `${file.region}_${file.type}_${file.month.toString().padStart(2, '0')}_${file.filename}`);

    // Skip if already downloaded
    if (fs.existsSync(destPath)) {
      skipped++;
      continue;
    }

    console.log(`\nDownloading: ${file.filename}`);
    console.log(`  Year: ${file.year}, Month: ${file.month}`);

    try {
      await downloadFile(file.url, destPath);
      downloaded++;
      console.log(`  ✓ Saved to ${path.basename(destPath)}`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      failed++;
      console.error(`  ✗ Failed:`, error);
    }
  }

  // Save metadata
  const metadataPath = path.join(DATA_DIR, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    files: uniqueFiles,
    stats: { downloaded, skipped, failed }
  }, null, 2));

  console.log('\n=== Download Complete ===');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nFiles saved to: ${DATA_DIR}`);
}

// Run the script
downloadHistoricalData().catch(console.error);
