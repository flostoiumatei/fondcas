-- FondCAS Database Schema v2
-- FRESH INSTALL - Drops all old tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- DROP ALL OLD TABLES
-- ============================================
DROP TABLE IF EXISTS provider_verifications CASCADE;
DROP TABLE IF EXISTS user_reports CASCADE;
DROP TABLE IF EXISTS fund_allocations CASCADE;
DROP TABLE IF EXISTS provider_specialties CASCADE;
DROP TABLE IF EXISTS provider_consumption_patterns CASCADE;
DROP TABLE IF EXISTS historical_fund_data CASCADE;
DROP TABLE IF EXISTS providers CASCADE;
DROP TABLE IF EXISTS specialties CASCADE;
DROP TABLE IF EXISTS counties CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS organization_specialties CASCADE;
DROP TABLE IF EXISTS location_specialties CASCADE;
DROP TABLE IF EXISTS ai_enrichment_log CASCADE;

-- Drop old views
DROP VIEW IF EXISTS location_details CASCADE;

-- ============================================
-- CORE TABLES
-- ============================================

-- Counties/Regions (Județe)
CREATE TABLE counties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) UNIQUE NOT NULL,
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
    ('VN', 'Vrancea', 'https://www.casvrancea.ro');

-- Organizations (Legal entities that hold CNAS contracts)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cui VARCHAR(20) UNIQUE,
    legal_name VARCHAR(255) NOT NULL,
    is_network BOOLEAN DEFAULT FALSE,
    network_brand VARCHAR(255),
    network_website VARCHAR(255),
    provider_type VARCHAR(50) NOT NULL,
    cnas_contract_number VARCHAR(50),
    contract_start_date DATE,
    contract_end_date DATE,
    ai_enriched BOOLEAN DEFAULT FALSE,
    ai_enriched_at TIMESTAMPTZ,
    ai_confidence INT,
    data_source VARCHAR(255),
    data_source_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Locations (Physical clinic locations)
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    county_id UUID REFERENCES counties(id),
    postal_code VARCHAR(10),
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    geocoded_at TIMESTAMPTZ,
    geocode_source VARCHAR(50),
    phone VARCHAR(100),
    email VARCHAR(255),
    website VARCHAR(255),
    opening_hours JSONB,
    source VARCHAR(50) NOT NULL DEFAULT 'cnas',
    confidence INT NOT NULL DEFAULT 100,
    is_primary BOOLEAN DEFAULT FALSE,
    verified_by_user BOOLEAN DEFAULT FALSE,
    user_verification_count INT DEFAULT 0,
    last_user_verification TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, address, city)
);

-- Specialties
CREATE TABLE specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization specialties
CREATE TABLE organization_specialties (
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    specialty_id UUID REFERENCES specialties(id) ON DELETE CASCADE,
    PRIMARY KEY (organization_id, specialty_id)
);

-- Location specialties
CREATE TABLE location_specialties (
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
    specialty_id UUID REFERENCES specialties(id) ON DELETE CASCADE,
    PRIMARY KEY (location_id, specialty_id)
);

-- Fund allocations
CREATE TABLE fund_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    period_year INT NOT NULL,
    period_month INT NOT NULL,
    service_type VARCHAR(50),
    allocated_amount DECIMAL(12, 2),
    consumed_amount DECIMAL(12, 2),
    available_amount DECIMAL(12, 2),
    data_source VARCHAR(255),
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, period_year, period_month, service_type)
);

-- User reports
CREATE TABLE user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL,
    comment TEXT,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    reporter_ip_hash VARCHAR(64),
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ
);

-- AI enrichment log
CREATE TABLE ai_enrichment_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    detected_as_network BOOLEAN,
    detected_brand_name VARCHAR(255),
    detected_website VARCHAR(255),
    locations_found INT DEFAULT 0,
    ai_response JSONB,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_organizations_cui ON organizations(cui);
CREATE INDEX idx_organizations_type ON organizations(provider_type);
CREATE INDEX idx_organizations_network ON organizations(is_network) WHERE is_network = TRUE;

CREATE INDEX idx_locations_org ON locations(organization_id);
CREATE INDEX idx_locations_county ON locations(county_id);
CREATE INDEX idx_locations_geo ON locations(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX idx_locations_name ON locations(name);
CREATE INDEX idx_locations_city ON locations(city);
CREATE INDEX idx_locations_confidence ON locations(confidence) WHERE confidence >= 70;
CREATE INDEX idx_locations_source ON locations(source);

CREATE INDEX idx_fund_org ON fund_allocations(organization_id);
CREATE INDEX idx_fund_period ON fund_allocations(period_year, period_month);

CREATE INDEX idx_reports_location ON user_reports(location_id, reported_at DESC);

-- ============================================
-- FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON organizations;
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_locations_updated_at ON locations;
CREATE TRIGGER trigger_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_enrichment_log ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read" ON organizations FOR SELECT USING (true);
CREATE POLICY "Public read" ON locations FOR SELECT USING (true);
CREATE POLICY "Public read" ON specialties FOR SELECT USING (true);
CREATE POLICY "Public read" ON organization_specialties FOR SELECT USING (true);
CREATE POLICY "Public read" ON location_specialties FOR SELECT USING (true);
CREATE POLICY "Public read" ON fund_allocations FOR SELECT USING (true);
CREATE POLICY "Public read" ON user_reports FOR SELECT USING (true);
CREATE POLICY "Public read" ON counties FOR SELECT USING (true);
CREATE POLICY "Public read" ON ai_enrichment_log FOR SELECT USING (true);

-- Public insert for user reports
CREATE POLICY "Public insert reports" ON user_reports FOR INSERT WITH CHECK (true);

-- Anon insert/update for sync operations
CREATE POLICY "Anon insert orgs" ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update orgs" ON organizations FOR UPDATE USING (true);
CREATE POLICY "Anon insert locations" ON locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update locations" ON locations FOR UPDATE USING (true);
CREATE POLICY "Anon insert specialties" ON specialties FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert org_spec" ON organization_specialties FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert loc_spec" ON location_specialties FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert funds" ON fund_allocations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update funds" ON fund_allocations FOR UPDATE USING (true);
CREATE POLICY "Anon insert ai_log" ON ai_enrichment_log FOR INSERT WITH CHECK (true);

-- ============================================
-- VIEWS
-- ============================================
CREATE OR REPLACE VIEW location_details AS
SELECT
    l.id,
    l.name,
    l.address,
    l.city,
    l.lat,
    l.lng,
    l.phone,
    l.email,
    l.website,
    l.opening_hours,
    l.source,
    l.confidence,
    l.is_primary,
    l.verified_by_user,
    l.created_at,
    l.updated_at,
    o.id AS organization_id,
    o.cui,
    o.legal_name,
    o.is_network,
    o.network_brand,
    o.provider_type,
    o.cnas_contract_number,
    c.id AS county_id,
    c.code AS county_code,
    c.name AS county_name
FROM locations l
JOIN organizations o ON l.organization_id = o.id
LEFT JOIN counties c ON l.county_id = c.id;
