/**
 * Train Prediction Model Script
 *
 * Analyzes historical fund consumption data and builds prediction patterns
 * for each provider. Stores patterns in the database for use by the
 * FundAvailabilityPredictor.
 *
 * Usage: npm run ml:train
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

const DATA_DIR = path.join(process.cwd(), 'data', 'historical');
const INPUT_FILE = path.join(DATA_DIR, 'parsed_historical_funds.json');

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
  isEndOfQuarter: boolean;
  isDecember: boolean;
  sourceFile: string;
}

interface ProviderPattern {
  providerCui: string;
  avgConsumptionRate: number;
  stddevConsumptionRate: number;
  monthlyPattern: Record<number, number>;
  depletionCurve: Record<number, number>;
  earlyDepletionFrequency: number;
  typicalDepletionDay: number;
  dataPointsCount: number;
  firstDataDate: string;
  lastDataDate: string;
}

/**
 * Calculate mean of an array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Group array by key
 */
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Build consumption patterns for a provider
 */
function buildProviderPattern(
  cui: string,
  records: HistoricalFundRecord[]
): ProviderPattern | null {
  // Need at least 6 months of data
  if (records.length < 6) {
    return null;
  }

  // Filter records with valid consumption rate
  const validRecords = records.filter(r =>
    r.consumptionRate !== undefined &&
    r.consumptionRate >= 0 &&
    r.consumptionRate <= 2  // Allow some overspend
  );

  if (validRecords.length < 6) {
    return null;
  }

  // Calculate average consumption rate
  const rates = validRecords.map(r => r.consumptionRate!);
  const avgRate = mean(rates);
  const stddevRate = standardDeviation(rates);

  // Calculate monthly pattern
  const byMonth = groupBy(validRecords, r => r.month.toString());
  const monthlyPattern: Record<number, number> = {};

  for (let m = 1; m <= 12; m++) {
    const monthRecords = byMonth[m.toString()] || [];
    if (monthRecords.length > 0) {
      monthlyPattern[m] = mean(monthRecords.map(r => r.consumptionRate!));
    } else {
      // Use average if no data for this month
      monthlyPattern[m] = avgRate;
    }
  }

  // Build depletion curve (linear approximation based on average rate)
  // This represents cumulative consumption by day of month
  const depletionCurve: Record<number, number> = {};
  const dailyRate = avgRate / 30;  // Approximate daily consumption

  for (let d = 1; d <= 31; d++) {
    depletionCurve[d] = Math.min(1, dailyRate * d);
  }

  // Calculate early depletion frequency
  // (How often do they use >90% of funds before day 20)
  const earlyDepletions = validRecords.filter(r =>
    r.consumptionRate! > 0.9
  ).length;
  const earlyDepletionFreq = earlyDepletions / validRecords.length;

  // Estimate typical depletion day
  // (At average rate, when would 90% be consumed?)
  const typicalDepletionDay = avgRate > 0
    ? Math.round(30 * (0.9 / avgRate))
    : 30;

  // Get date range
  const sortedRecords = [...validRecords].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const firstRecord = sortedRecords[0];
  const lastRecord = sortedRecords[sortedRecords.length - 1];

  return {
    providerCui: cui,
    avgConsumptionRate: avgRate,
    stddevConsumptionRate: stddevRate,
    monthlyPattern,
    depletionCurve,
    earlyDepletionFrequency: earlyDepletionFreq,
    typicalDepletionDay: Math.min(30, Math.max(1, typicalDepletionDay)),
    dataPointsCount: validRecords.length,
    firstDataDate: `${firstRecord.year}-${firstRecord.month.toString().padStart(2, '0')}-01`,
    lastDataDate: `${lastRecord.year}-${lastRecord.month.toString().padStart(2, '0')}-01`
  };
}

/**
 * Upload historical data to database
 */
async function uploadHistoricalData(records: HistoricalFundRecord[]): Promise<void> {
  console.log('\n--- Uploading Historical Data ---');

  let uploaded = 0;
  let errors = 0;

  // Process in batches
  const batchSize = 100;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const data = batch.map(r => ({
      provider_cui: r.providerCui || null,
      year: r.year,
      month: r.month,
      day_of_month: r.dayOfMonth || null,
      allocated_amount: r.allocatedAmount,
      consumed_amount: r.consumedAmount || null,
      consumption_rate: r.consumptionRate || null,
      service_type: r.serviceType,
      is_end_of_quarter: r.isEndOfQuarter,
      is_december: r.isDecember,
      source_file: r.sourceFile
    }));

    const { error } = await supabase
      .from('historical_fund_data')
      .upsert(data, {
        onConflict: 'provider_cui,year,month,service_type'
      });

    if (error) {
      errors += batch.length;
      console.error(`Batch error:`, error.message);
    } else {
      uploaded += batch.length;
    }

    if ((i + batchSize) % 500 === 0) {
      console.log(`Uploaded ${i + batchSize}/${records.length}...`);
    }
  }

  console.log(`Historical data uploaded: ${uploaded} (${errors} errors)`);
}

/**
 * Upload provider patterns to database
 */
async function uploadProviderPatterns(patterns: ProviderPattern[]): Promise<void> {
  console.log('\n--- Uploading Provider Patterns ---');

  let uploaded = 0;
  let errors = 0;

  for (const pattern of patterns) {
    // Find provider by CUI to get their ID
    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('cui', pattern.providerCui)
      .single();

    const data = {
      provider_id: provider?.id || null,
      provider_cui: pattern.providerCui,
      avg_consumption_rate: pattern.avgConsumptionRate,
      stddev_consumption_rate: pattern.stddevConsumptionRate,
      monthly_pattern: pattern.monthlyPattern,
      depletion_curve: pattern.depletionCurve,
      early_depletion_frequency: pattern.earlyDepletionFrequency,
      typical_depletion_day: pattern.typicalDepletionDay,
      data_points_count: pattern.dataPointsCount,
      first_data_date: pattern.firstDataDate,
      last_data_date: pattern.lastDataDate,
      model_updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('provider_consumption_patterns')
      .upsert(data, {
        onConflict: 'provider_cui'
      });

    if (error) {
      errors++;
      console.error(`Error uploading pattern for ${pattern.providerCui}:`, error.message);
    } else {
      uploaded++;
    }
  }

  console.log(`Patterns uploaded: ${uploaded} (${errors} errors)`);
}

/**
 * Main training function
 */
async function trainPredictionModel(): Promise<void> {
  console.log('Starting model training...\n');

  // Load historical data
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error('Please run npm run sync:parse-historical first');
    process.exit(1);
  }

  const records: HistoricalFundRecord[] = JSON.parse(
    fs.readFileSync(INPUT_FILE, 'utf-8')
  );

  console.log(`Loaded ${records.length} historical records`);

  // Upload historical data to database
  await uploadHistoricalData(records);

  // Group by provider (using CUI or name)
  const byProvider = groupBy(records, r => r.providerCui || r.providerName);

  console.log(`\n--- Building Provider Patterns ---`);
  console.log(`Unique providers: ${Object.keys(byProvider).length}`);

  // Build patterns for each provider
  const patterns: ProviderPattern[] = [];
  let skipped = 0;

  for (const [cui, providerRecords] of Object.entries(byProvider)) {
    const pattern = buildProviderPattern(cui, providerRecords);

    if (pattern) {
      patterns.push(pattern);
    } else {
      skipped++;
    }
  }

  console.log(`Patterns built: ${patterns.length}`);
  console.log(`Skipped (insufficient data): ${skipped}`);

  // Upload patterns to database
  await uploadProviderPatterns(patterns);

  // Calculate and display global statistics
  console.log('\n=== Training Complete ===');

  const avgRates = patterns.map(p => p.avgConsumptionRate);
  const globalAvgRate = mean(avgRates);
  const globalStddev = standardDeviation(avgRates);

  console.log(`\nGlobal Statistics:`);
  console.log(`  Average consumption rate: ${(globalAvgRate * 100).toFixed(1)}%`);
  console.log(`  Standard deviation: ${(globalStddev * 100).toFixed(1)}%`);
  console.log(`  Providers with patterns: ${patterns.length}`);

  // Show top 5 high-consumption providers
  const sortedByRate = [...patterns].sort((a, b) => b.avgConsumptionRate - a.avgConsumptionRate);
  console.log(`\nHighest consumption providers:`);
  sortedByRate.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.providerCui}: ${(p.avgConsumptionRate * 100).toFixed(1)}% avg rate`);
  });

  // Verify database
  const { count: historicalCount } = await supabase
    .from('historical_fund_data')
    .select('*', { count: 'exact', head: true });

  const { count: patternsCount } = await supabase
    .from('provider_consumption_patterns')
    .select('*', { count: 'exact', head: true });

  console.log(`\nDatabase Status:`);
  console.log(`  Historical records: ${historicalCount}`);
  console.log(`  Provider patterns: ${patternsCount}`);
}

// Run the script
trainPredictionModel().catch(console.error);
