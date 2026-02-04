/**
 * Script to download Excel files from CAS websites
 *
 * Usage: npm run sync:download
 *
 * This script:
 * 1. Fetches the HTML page listing Excel files
 * 2. Identifies the most recent .xlsx files
 * 3. Downloads them to the /data folder
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const DATA_DIR = path.join(process.cwd(), 'data', 'current');

// CAS data sources for București (pilot)
const CAS_SOURCES = {
  bucuresti: {
    name: 'CASMB București',
    baseUrl: 'https://www.casmb.ro',
    pages: [
      {
        name: 'furnizori_clinici',
        url: 'https://www.casmb.ro/casmb_furniz_clin_contracte',
        filePattern: /FURNIZORI.*SERVICII.*MEDICALE.*\.xlsx?$/i,
      },
      {
        name: 'furnizori_paraclinic',
        url: 'https://www.casmb.ro/casmb_furniz_para_fisiere_contracte',
        filePattern: /FURNIZORI.*PARACLINIC.*\.xlsx?$/i,
      },
      {
        name: 'valori_paraclinic',
        url: 'https://www.casmb.ro/casmb_furniz_para_fisiere_contracte_valori',
        filePattern: /VALORI.*CONTRACTE.*PARACLINIC.*\.xlsx?$/i,
      },
    ],
  },
};

// Simple fetch function for downloading files
function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          fetchUrl(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// Extract Excel file links from HTML
function extractExcelLinks(html: string, baseUrl: string, pattern: RegExp): string[] {
  const links: string[] = [];

  // Find all href attributes
  const hrefRegex = /href=["']([^"']+\.xlsx?)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (pattern.test(href)) {
      // Convert relative URL to absolute
      const absoluteUrl = href.startsWith('http')
        ? href
        : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
      links.push(absoluteUrl);
    }
  }

  return links;
}

// Download a file
async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading: ${url}`);

  try {
    const buffer = await fetchUrl(url);
    fs.writeFileSync(destPath, buffer);
    console.log(`  ✓ Saved: ${path.basename(destPath)} (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (error) {
    console.error(`  ✗ Failed to download: ${error}`);
    throw error;
  }
}

// Main download function
async function downloadCasData() {
  console.log('=== FondCAS Data Download ===\n');

  // Create data directory
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created directory: ${DATA_DIR}\n`);
  }

  for (const [region, config] of Object.entries(CAS_SOURCES)) {
    console.log(`\n📂 ${config.name}`);
    console.log('─'.repeat(40));

    for (const page of config.pages) {
      console.log(`\n  Page: ${page.name}`);

      try {
        // Fetch the page HTML
        console.log(`  Fetching: ${page.url}`);
        const html = (await fetchUrl(page.url)).toString('utf-8');

        // Extract Excel links
        const links = extractExcelLinks(html, config.baseUrl, page.filePattern);

        if (links.length === 0) {
          console.log('  ⚠ No Excel files found matching pattern');
          continue;
        }

        console.log(`  Found ${links.length} Excel file(s)`);

        // Download the most recent file (usually first)
        const mostRecentUrl = links[0];
        const fileName = `${region}_${page.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const destPath = path.join(DATA_DIR, fileName);

        await downloadFile(mostRecentUrl, destPath);
      } catch (error) {
        console.error(`  ✗ Error processing page: ${error}`);
      }
    }
  }

  console.log('\n=== Download Complete ===');
  console.log(`Files saved to: ${DATA_DIR}`);
  console.log('\nNext step: npm run sync:parse');
}

// Run if called directly
downloadCasData().catch(console.error);
