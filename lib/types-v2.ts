// FondCAS Database Types v2
// Redesigned to support multiple locations per organization

// ============================================
// DATABASE ENTITIES
// ============================================

export interface County {
  id: string;
  code: string;
  name: string;
  cas_website?: string;
  created_at: string;
}

export interface Organization {
  id: string;
  cui?: string;
  legal_name: string;
  is_network: boolean;
  network_brand?: string;
  network_website?: string;
  provider_type: ProviderType;
  cnas_contract_number?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  ai_enriched: boolean;
  ai_enriched_at?: string;
  ai_confidence?: number;
  data_source?: string;
  data_source_date?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  locations?: Location[];
  specialties?: Specialty[];
  fund_allocation?: FundAllocation;
}

export interface Location {
  id: string;
  organization_id: string;
  name: string;
  address?: string;
  city?: string;
  county_id?: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
  geocoded_at?: string;
  geocode_source?: string;
  phone?: string;
  email?: string;
  website?: string;
  opening_hours?: Record<string, string>;
  source: LocationSource;
  confidence: number;
  is_primary: boolean;
  verified_by_user: boolean;
  user_verification_count: number;
  last_user_verification?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  organization?: Organization;
  county?: County;
  specialties?: Specialty[];
  distance_km?: number; // For nearby search results
}

export type LocationSource = 'cnas' | 'ai_discovered' | 'user_reported' | 'manual';

export type ProviderType = 'clinic' | 'paraclinic' | 'hospital' | 'pharmacy' | 'recovery';

export interface Specialty {
  id: string;
  code?: string;
  name: string;
  category?: SpecialtyCategory;
  created_at: string;
}

export type SpecialtyCategory = 'clinical' | 'paraclinical' | 'dental' | 'recovery';

export interface FundAllocation {
  id: string;
  organization_id: string;
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
  location_id: string;
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

export interface AIEnrichmentLog {
  id: string;
  organization_id: string;
  detected_as_network: boolean;
  detected_brand_name?: string;
  detected_website?: string;
  locations_found: number;
  ai_response?: Record<string, unknown>;
  success: boolean;
  error_message?: string;
  processed_at: string;
}

// ============================================
// API TYPES
// ============================================

export interface SearchParams {
  county?: string;
  type?: ProviderType;
  specialty?: string;
  query?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  minConfidence?: number;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  locations: Location[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FundAvailabilityStatus {
  status: 'likely_available' | 'uncertain' | 'likely_exhausted';
  confidence: number;
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

// ============================================
// PARSED DATA (from Excel files)
// ============================================

export interface ParsedOrganization {
  cui?: string;
  legalName: string;
  providerType: ProviderType;
  address?: string;
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

export interface ParsedFundAllocation {
  organizationCui?: string;
  organizationName: string;
  periodYear: number;
  periodMonth: number;
  serviceType: string;
  allocatedAmount: number;
  consumedAmount?: number;
  availableAmount?: number;
  dataSource: string;
}

// ============================================
// AI ENRICHMENT TYPES
// ============================================

export interface AINetworkDetectionResult {
  isNetwork: boolean;
  confidence: number;
  networkBrand?: string;
  networkWebsite?: string;
  reasoning: string;
}

export interface AIDiscoveredLocation {
  name: string;
  address: string;
  city: string;
  county?: string;
  phone?: string;
  email?: string;
  website?: string;
  openingHours?: string;
  confidence: number;
}

export interface AIEnrichmentResult {
  organizationId: string;
  detection: AINetworkDetectionResult;
  locations: AIDiscoveredLocation[];
  success: boolean;
  error?: string;
}

// ============================================
// UI TYPES
// ============================================

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  organizationName: string;
  type: ProviderType;
  confidence: number;
  source: LocationSource;
  fundStatus?: 'available' | 'uncertain' | 'exhausted';
}

// ============================================
// CONSTANTS
// ============================================

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  clinic: 'Clinică',
  paraclinic: 'Paraclinic (Laborator/Radiologie)',
  hospital: 'Spital',
  pharmacy: 'Farmacie',
  recovery: 'Recuperare medicală',
};

export const LOCATION_SOURCE_LABELS: Record<LocationSource, string> = {
  cnas: 'Date CNAS',
  ai_discovered: 'Descoperit AI',
  user_reported: 'Raportat de utilizatori',
  manual: 'Adăugat manual',
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  funds_available: 'Fonduri disponibile',
  funds_exhausted: 'Fonduri epuizate',
  long_wait: 'Timp mare de așteptare',
  good_service: 'Servicii bune',
};

export const ROMANIAN_MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie',
  'Mai', 'Iunie', 'Iulie', 'August',
  'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
] as const;
