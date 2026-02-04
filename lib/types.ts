// Database entity types

export interface County {
  id: string;
  code: string;
  name: string;
  cas_website?: string;
  created_at: string;
}

export interface Provider {
  id: string;
  external_id?: string;
  cui?: string;
  name: string;
  brand_name?: string;
  verified_address?: string;
  verified_phone?: string;
  verification_confidence?: number;
  verified_at?: string;
  provider_type: ProviderType;
  address?: string;
  city?: string;
  county_id?: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
  geocoded_at?: string;
  phone?: string;
  email?: string;
  website?: string;
  cas_contract_number?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  data_source?: string;
  data_source_date?: string; // YYYY-MM-DD when the source data was published
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  county?: County;
  specialties?: Specialty[];
  fund_allocation?: FundAllocation;
}

export type ProviderType = 'clinic' | 'paraclinic' | 'hospital' | 'pharmacy' | 'recovery';

export interface Specialty {
  id: string;
  code?: string;
  name: string;
  category?: SpecialtyCategory;
  created_at: string;
}

export type SpecialtyCategory = 'clinical' | 'paraclinical' | 'dental' | 'recovery';

export interface ProviderSpecialty {
  provider_id: string;
  specialty_id: string;
}

export interface FundAllocation {
  id: string;
  provider_id: string;
  period_year: number;
  period_month: number;
  service_type?: string;
  allocated_amount?: number;
  consumed_amount?: number;
  available_amount?: number;
  data_source?: string;
  synced_at: string;
}

export interface UserReport {
  id: string;
  provider_id: string;
  report_type: ReportType;
  comment?: string;
  reported_at: string;
  reporter_ip_hash?: string;
  upvotes: number;
  downvotes: number;
  verified: boolean;
  verified_at?: string;
}

export type ReportType = 'funds_available' | 'funds_exhausted' | 'long_wait' | 'good_service';

// Historical data for ML
export interface HistoricalFundData {
  id: string;
  provider_id?: string;
  provider_cui?: string;
  year: number;
  month: number;
  day_of_month?: number;
  allocated_amount?: number;
  consumed_amount?: number;
  consumption_rate?: number;
  service_type?: string;
  specialty_category?: string;
  is_end_of_quarter: boolean;
  is_december: boolean;
  days_until_month_end?: number;
  source_file?: string;
  extracted_at: string;
}

export interface ProviderConsumptionPattern {
  id: string;
  provider_id?: string;
  provider_cui?: string;
  avg_consumption_rate?: number;
  stddev_consumption_rate?: number;
  monthly_pattern?: Record<number, number>;
  depletion_curve?: Record<number, number>;
  early_depletion_frequency?: number;
  typical_depletion_day?: number;
  data_points_count?: number;
  first_data_date?: string;
  last_data_date?: string;
  model_updated_at: string;
}

// API types

export interface SearchParams {
  county?: string;
  type?: ProviderType;
  specialty?: string;
  query?: string;
  lat?: number;
  lng?: number;
  radius?: number; // km
  hasAvailableFunds?: boolean;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  providers: Provider[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FundAvailabilityStatus {
  status: 'likely_available' | 'uncertain' | 'likely_exhausted';
  confidence: number; // 0-100
  allocatedAmount: number;
  estimatedConsumed: number;
  estimatedAvailable: number;
  dayOfMonth: number;
  lastUserReport?: {
    type: ReportType;
    reportedAt: string;
    isRecent: boolean;
  };
  message: string;
}

export interface PredictionOutput {
  predictedAvailability: number; // 0-1 probability
  predictedRemainingAmount: number;
  predictedDepletionDate: string | null;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: {
    historicalPattern: number;
    dayOfMonthEffect: number;
    seasonalityEffect: number;
    recentReportsEffect: number;
    providerSizeEffect: number;
  };
  explanation: string;
}

// Parsed data from Excel files

export interface ParsedProvider {
  cui?: string;
  name: string;
  providerType: ProviderType;
  address?: string;
  city?: string;
  county: string;
  phone?: string;
  email?: string;
  specialties: string[];
  contractNumber?: string;
  dataSource: string;
}

export interface ParsedFundAllocation {
  providerCui?: string;
  providerName: string;
  periodYear: number;
  periodMonth: number;
  serviceType: string;
  allocatedAmount: number;
  consumedAmount?: number;
  availableAmount?: number;
  dataSource: string;
}

// UI types

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: ProviderType;
  fundStatus?: 'available' | 'uncertain' | 'exhausted';
}

// Romanian months for display
export const ROMANIAN_MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie',
  'Mai', 'Iunie', 'Iulie', 'August',
  'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
] as const;

// Provider type labels in Romanian
export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  clinic: 'Clinică',
  paraclinic: 'Paraclinic (Laborator/Radiologie)',
  hospital: 'Spital',
  pharmacy: 'Farmacie',
  recovery: 'Recuperare medicală',
};

// Report type labels in Romanian
export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  funds_available: 'Fonduri disponibile',
  funds_exhausted: 'Fonduri epuizate',
  long_wait: 'Timp mare de așteptare',
  good_service: 'Servicii bune',
};

// Risk level labels in Romanian
export const RISK_LEVEL_LABELS: Record<'low' | 'medium' | 'high', string> = {
  low: 'Risc scăzut',
  medium: 'Risc mediu',
  high: 'Risc ridicat',
};
