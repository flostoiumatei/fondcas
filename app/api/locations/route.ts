import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const county = searchParams.get('county');
    const type = searchParams.get('type');
    const specialty = searchParams.get('specialty');
    const query = searchParams.get('query');
    const network = searchParams.get('network');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = searchParams.get('radius') || '10';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // If searching by location, use the RPC function
    if (lat && lng) {
      const { data, error } = await supabase.rpc('search_locations_nearby', {
        search_lat: parseFloat(lat),
        search_lng: parseFloat(lng),
        radius_km: parseFloat(radius),
      });

      if (error) {
        console.error('Nearby search error:', error);
        // Fall back to regular search if RPC doesn't exist
      } else if (data) {
        let results = data || [];
        if (type) {
          results = results.filter((l: any) => l.provider_type === type);
        }

        return NextResponse.json({
          locations: results.slice(offset, offset + limit),
          total: results.length,
          page,
          limit,
          hasMore: results.length > offset + limit,
        });
      }
    }

    // Build the query
    let queryBuilder = supabase
      .from('locations')
      .select(`
        id,
        name,
        address,
        city,
        lat,
        lng,
        phone,
        email,
        website,
        source,
        confidence,
        is_primary,
        organization_id,
        organization:organizations!inner (
          id,
          cui,
          legal_name,
          is_network,
          network_brand,
          network_website,
          provider_type,
          ai_confidence,
          data_source_date
        ),
        county:counties (
          id,
          code,
          name
        )
      `, { count: 'exact' });

    // Filter by county
    if (county) {
      const { data: countyData } = await supabase
        .from('counties')
        .select('id')
        .eq('code', county)
        .single();

      if (countyData) {
        queryBuilder = queryBuilder.eq('county_id', countyData.id);
      }
    }

    // Filter by provider type (from organization)
    if (type) {
      queryBuilder = queryBuilder.eq('organization.provider_type', type);
    }

    // Filter by network only
    if (network === 'true') {
      queryBuilder = queryBuilder.eq('organization.is_network', true);
    }

    // Filter by specialty - need to find organizations with this specialty first
    if (specialty) {
      // Get specialty ID
      const { data: specData } = await supabase
        .from('specialties')
        .select('id')
        .ilike('name', specialty)
        .single();

      if (specData) {
        // Get organization IDs that have this specialty
        const { data: orgSpecData } = await supabase
          .from('organization_specialties')
          .select('organization_id')
          .eq('specialty_id', specData.id);

        const orgIds = orgSpecData?.map(os => os.organization_id) || [];

        if (orgIds.length > 0) {
          queryBuilder = queryBuilder.in('organization_id', orgIds);
        } else {
          // No orgs have this specialty, return empty
          return NextResponse.json({
            locations: [],
            total: 0,
            page,
            limit,
            hasMore: false,
          });
        }
      }
    }

    // Search by name/address/organization/specialty
    // Note: PostgREST doesn't support nested fields in `or`, so we search locations first
    // then do a separate org search if needed
    if (query) {
      // First, find organization IDs that match the query by name/brand
      const { data: matchingOrgs } = await supabase
        .from('organizations')
        .select('id')
        .or(`legal_name.ilike.%${query}%,network_brand.ilike.%${query}%`);

      const orgIdsFromName = matchingOrgs?.map(o => o.id) || [];

      // Also find organizations that have a specialty matching the query
      const { data: matchingSpecialties } = await supabase
        .from('specialties')
        .select('id')
        .ilike('name', `%${query}%`);

      let orgIdsFromSpecialty: string[] = [];
      if (matchingSpecialties && matchingSpecialties.length > 0) {
        const specIds = matchingSpecialties.map(s => s.id);
        const { data: orgSpecData } = await supabase
          .from('organization_specialties')
          .select('organization_id')
          .in('specialty_id', specIds);

        orgIdsFromSpecialty = orgSpecData?.map(os => os.organization_id) || [];
      }

      // Combine org IDs from name search and specialty search
      const allOrgIds = Array.from(new Set([...orgIdsFromName, ...orgIdsFromSpecialty]));

      if (allOrgIds.length > 0) {
        // Search in location fields OR organization matches (by name or specialty)
        queryBuilder = queryBuilder.or(`name.ilike.%${query}%,address.ilike.%${query}%,organization_id.in.(${allOrgIds.join(',')})`);
      } else {
        // No org matches, just search location fields
        queryBuilder = queryBuilder.or(`name.ilike.%${query}%,address.ilike.%${query}%`);
      }
    }

    // Only show locations with reasonable confidence
    queryBuilder = queryBuilder.gte('confidence', 50);

    // Pagination and ordering
    queryBuilder = queryBuilder
      .range(offset, offset + limit - 1)
      .order('is_primary', { ascending: false })
      .order('confidence', { ascending: false })
      .order('name');

    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Search error:', error);
      return NextResponse.json({ error: 'Search failed', details: error.message }, { status: 500 });
    }

    // Transform the data to a flat structure for the frontend
    const locations = (data || []).map((loc: any) => ({
      // Location fields
      id: loc.id,
      name: loc.name,
      address: loc.address,
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng,
      phone: loc.phone,
      email: loc.email,
      website: loc.website,
      source: loc.source,
      confidence: loc.confidence,
      is_primary: loc.is_primary,

      // Organization fields (flattened)
      organization_id: loc.organization?.id,
      organization_name: loc.organization?.legal_name,
      organization_cui: loc.organization?.cui,
      is_network: loc.organization?.is_network,
      network_brand: loc.organization?.network_brand,
      network_website: loc.organization?.network_website,
      provider_type: loc.organization?.provider_type,
      data_source_date: loc.organization?.data_source_date,
      ai_confidence: loc.organization?.ai_confidence,

      // County
      county: loc.county,
    }));

    return NextResponse.json({
      locations,
      total: count || 0,
      page,
      limit,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
