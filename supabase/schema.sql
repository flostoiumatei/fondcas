-- FondCAS Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

-- Counties/Regions (Județe)
CREATE TABLE IF NOT EXISTS counties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL,  -- 'B' for București, 'CJ' for Cluj, etc.
    name VARCHAR(100) NOT NULL,
    cas_website VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Romanian counties
INSERT INTO counties (code, name, cas_website) VALUES
    ('B', 'București', 'https://www.casmb.ro'),
    ('AB', 'Alba', 'https://www.casalba.ro'),
    ('AR', 'Arad', 'https://www.casarad.ro'),
    ('AG', 'Argeș', 'https://www.casag.ro'),
    ('BC', 'Bacău', 'https://www.casbacau.ro'),
    ('BH', 'Bihor', 'https://www.casbihor.ro'),
    ('BN', 'Bistrița-Năsăud', 'https://www.casbn.ro'),
    ('BT', 'Botoșani', 'https://www.casbotosani.ro'),
    ('BV', 'Brașov', 'https://www.casbv.ro'),
    ('BR', 'Brăila', 'https://www.casbraila.ro'),
    ('BZ', 'Buzău', 'https://www.casbuzau.ro'),
    ('CS', 'Caraș-Severin', 'https://www.cascs.ro'),
    ('CL', 'Călărași', 'https://www.cascalarasi.ro'),
    ('CJ', 'Cluj', 'https://www.cascluj.ro'),
    ('CT', 'Constanța', 'https://www.casconstanta.ro'),
    ('CV', 'Covasna', 'https://www.cascovasna.ro'),
    ('DB', 'Dâmbovița', 'https://www.casdambovita.ro'),
    ('DJ', 'Dolj', 'https://www.casdolj.ro'),
    ('GL', 'Galați', 'https://www.casgalati.ro'),
    ('GR', 'Giurgiu', 'https://www.casgiurgiu.ro'),
    ('GJ', 'Gorj', 'https://www.casgorj.ro'),
    ('HR', 'Harghita', 'https://www.casharghita.ro'),
    ('HD', 'Hunedoara', 'https://www.cashunedoara.ro'),
    ('IL', 'Ialomița', 'https://www.casialomita.ro'),
    ('IS', 'Iași', 'https://www.casiasi.ro'),
    ('IF', 'Ilfov', 'https://www.casilfov.ro'),
    ('MM', 'Maramureș', 'https://www.casmaramures.ro'),
    ('MH', 'Mehedinți', 'https://www.casmehedinti.ro'),
    ('MS', 'Mureș', 'https://www.casmures.ro'),
    ('NT', 'Neamț', 'https://www.casneamt.ro'),
    ('OT', 'Olt', 'https://www.casolt.ro'),
    ('PH', 'Prahova', 'https://www.casprahova.ro'),
    ('SM', 'Satu Mare', 'https://www.cassatumare.ro'),
    ('SJ', 'Sălaj', 'https://www.cassalaj.ro'),
    ('SB', 'Sibiu', 'https://www.cassibiu.ro'),
    ('SV', 'Suceava', 'https://www.cassuceava.ro'),
    ('TR', 'Teleorman', 'https://www.casteleorman.ro'),
    ('TM', 'Timiș', 'https://www.castimis.ro'),
    ('TL', 'Tulcea', 'https://www.castulcea.ro'),
    ('VS', 'Vaslui', 'https://www.casvaslui.ro'),
    ('VL', 'Vâlcea', 'https://www.casvalcea.ro'),
    ('VN', 'Vrancea', 'https://www.casvrancea.ro')
ON CONFLICT (code) DO NOTHING;

-- Healthcare Providers (clinics, hospitals, labs)
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(50),  -- ID from CAS if available
    cui VARCHAR(20),  -- Company fiscal code (CUI)
    name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,  -- 'clinic', 'paraclinic', 'hospital', 'pharmacy', 'recovery'

    -- Address
    address TEXT,
    city VARCHAR(100),
    county_id UUID REFERENCES counties(id),
    postal_code VARCHAR(10),

    -- Geocoding
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    geocoded_at TIMESTAMPTZ,

    -- Contact
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),

    -- CAS Contract
    cas_contract_number VARCHAR(50),
    contract_start_date DATE,
    contract_end_date DATE,

    -- Metadata
    data_source VARCHAR(255),  -- URL of source Excel file
    data_source_date DATE,     -- Date from source file (YYYYMMDD in filename)
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Specialties offered by providers
CREATE TABLE IF NOT EXISTS specialties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20),
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),  -- 'clinical', 'paraclinical', 'dental', etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-many: providers <-> specialties
CREATE TABLE IF NOT EXISTS provider_specialties (
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
    specialty_id UUID REFERENCES specialties(id) ON DELETE CASCADE,
    PRIMARY KEY (provider_id, specialty_id)
);

-- Monthly fund allocations
CREATE TABLE IF NOT EXISTS fund_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,

    period_year INT NOT NULL,
    period_month INT NOT NULL,

    service_type VARCHAR(50),  -- 'paraclinic', 'recovery', 'dental', etc.

    allocated_amount DECIMAL(12, 2),  -- Total allocated for the month
    consumed_amount DECIMAL(12, 2),   -- Amount already used (if available)
    available_amount DECIMAL(12, 2),  -- Remaining (calculated or from source)

    data_source VARCHAR(255),
    synced_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(provider_id, period_year, period_month, service_type)
);

-- User reports (crowdsourcing)
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,

    report_type VARCHAR(50) NOT NULL,  -- 'funds_available', 'funds_exhausted', 'long_wait', 'good_service'
    comment TEXT,

    reported_at TIMESTAMPTZ DEFAULT NOW(),
    reporter_ip_hash VARCHAR(64),  -- For spam prevention, hashed

    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,

    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ
);

-- ============================================
-- ML / HISTORICAL DATA TABLES
-- ============================================

-- Historical fund data for ML training
CREATE TABLE IF NOT EXISTS historical_fund_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES providers(id),
    provider_cui VARCHAR(20),  -- Backup identifier

    -- Time dimensions
    year INT NOT NULL,
    month INT NOT NULL,
    day_of_month INT,  -- If we have daily data

    -- Fund data
    allocated_amount DECIMAL(12, 2),
    consumed_amount DECIMAL(12, 2),
    consumption_rate DECIMAL(5, 4),  -- consumed/allocated

    -- Service categorization
    service_type VARCHAR(50),
    specialty_category VARCHAR(50),

    -- Contextual features
    is_end_of_quarter BOOLEAN DEFAULT FALSE,
    is_december BOOLEAN DEFAULT FALSE,  -- Budget year end
    days_until_month_end INT,

    -- Source tracking
    source_file VARCHAR(255),
    extracted_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(provider_cui, year, month, service_type)
);

-- Aggregated monthly patterns per provider
CREATE TABLE IF NOT EXISTS provider_consumption_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES providers(id),
    provider_cui VARCHAR(20),

    -- Average consumption patterns
    avg_consumption_rate DECIMAL(5, 4),
    stddev_consumption_rate DECIMAL(5, 4),

    -- Monthly patterns (JSON for flexibility)
    monthly_pattern JSONB,  -- {"1": 0.85, "2": 0.78, ...} avg rate per month

    -- Day-of-month depletion curve
    depletion_curve JSONB,  -- {"1": 0.03, "2": 0.07, "3": 0.11, ...} cumulative

    -- Risk indicators
    early_depletion_frequency DECIMAL(5, 4),  -- How often funds run out before day 20
    typical_depletion_day INT,  -- Average day when funds hit 90% consumed

    -- Metadata
    data_points_count INT,
    first_data_date DATE,
    last_data_date DATE,
    model_updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(provider_cui)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_providers_county ON providers(county_id);
CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(provider_type);
CREATE INDEX IF NOT EXISTS idx_providers_cui ON providers(cui);
CREATE INDEX IF NOT EXISTS idx_providers_name ON providers(name);
CREATE INDEX IF NOT EXISTS idx_providers_location ON providers(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fund_allocations_period ON fund_allocations(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_fund_allocations_provider ON fund_allocations(provider_id);

CREATE INDEX IF NOT EXISTS idx_user_reports_provider ON user_reports(provider_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_type ON user_reports(report_type);

CREATE INDEX IF NOT EXISTS idx_historical_provider_time ON historical_fund_data(provider_cui, year, month);
CREATE INDEX IF NOT EXISTS idx_patterns_cui ON provider_consumption_patterns(provider_cui);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_fund_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_consumption_patterns ENABLE ROW LEVEL SECURITY;

-- Public read access policies
CREATE POLICY "Public read access" ON providers FOR SELECT USING (true);
CREATE POLICY "Public read access" ON specialties FOR SELECT USING (true);
CREATE POLICY "Public read access" ON provider_specialties FOR SELECT USING (true);
CREATE POLICY "Public read access" ON fund_allocations FOR SELECT USING (true);
CREATE POLICY "Public read access" ON user_reports FOR SELECT USING (true);
CREATE POLICY "Public read access" ON counties FOR SELECT USING (true);
CREATE POLICY "Public read access" ON historical_fund_data FOR SELECT USING (true);
CREATE POLICY "Public read access" ON provider_consumption_patterns FOR SELECT USING (true);

-- Allow public to insert reports (with rate limiting in API)
CREATE POLICY "Public insert reports" ON user_reports FOR INSERT WITH CHECK (true);

-- Service role has full access (for sync operations)
CREATE POLICY "Service role full access" ON providers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON specialties FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON provider_specialties FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON fund_allocations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON historical_fund_data FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON provider_consumption_patterns FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for providers table
DROP TRIGGER IF EXISTS trigger_providers_updated_at ON providers;
CREATE TRIGGER trigger_providers_updated_at
    BEFORE UPDATE ON providers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to search providers by location (PostGIS-like using basic math)
CREATE OR REPLACE FUNCTION search_providers_nearby(
    search_lat DECIMAL,
    search_lng DECIMAL,
    radius_km DECIMAL DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    provider_type VARCHAR,
    address TEXT,
    lat DECIMAL,
    lng DECIMAL,
    distance_km DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.provider_type,
        p.address,
        p.lat,
        p.lng,
        (6371 * acos(
            cos(radians(search_lat)) * cos(radians(p.lat)) *
            cos(radians(p.lng) - radians(search_lng)) +
            sin(radians(search_lat)) * sin(radians(p.lat))
        ))::DECIMAL AS distance_km
    FROM providers p
    WHERE p.lat IS NOT NULL
      AND p.lng IS NOT NULL
      AND (6371 * acos(
            cos(radians(search_lat)) * cos(radians(p.lat)) *
            cos(radians(p.lng) - radians(search_lng)) +
            sin(radians(search_lat)) * sin(radians(p.lat))
        )) <= radius_km
    ORDER BY distance_km;
END;
$$ LANGUAGE plpgsql;
