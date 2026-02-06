import { NextRequest, NextResponse } from 'next/server';
import { supabase, TABLES } from '@/lib/supabase';
import { SearchParams, Provider } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const county = searchParams.get('county');
    const type = searchParams.get('type');
    const specialty = searchParams.get('specialty');
    const query = searchParams.get('query');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = searchParams.get('radius') || '3';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // If searching by location
    if (lat && lng) {
      const { data, error } = await supabase.rpc('search_providers_nearby', {
        search_lat: parseFloat(lat),
        search_lng: parseFloat(lng),
        radius_km: parseFloat(radius),
      });

      if (error) {
        console.error('Nearby search error:', error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
      }

      // Filter by type if specified
      let results = data || [];
      if (type) {
        results = results.filter((p: { provider_type: string }) => p.provider_type === type);
      }

      return NextResponse.json({
        providers: results.slice(offset, offset + limit),
        total: results.length,
        page,
        limit,
        hasMore: results.length > offset + limit,
      });
    }

    // Standard search
    let queryBuilder = supabase
      .from(TABLES.PROVIDERS)
      .select(`
        *,
        county:counties(id, code, name),
        specialties:provider_specialties(
          specialty:specialties(id, code, name, category)
        )
      `, { count: 'exact' });

    // Apply filters
    if (county) {
      // Get county ID first
      const { data: countyData } = await supabase
        .from(TABLES.COUNTIES)
        .select('id')
        .eq('code', county)
        .single();

      if (countyData) {
        queryBuilder = queryBuilder.eq('county_id', countyData.id);
      }
    }

    if (type) {
      queryBuilder = queryBuilder.eq('provider_type', type);
    }

    if (query) {
      queryBuilder = queryBuilder.or(`name.ilike.%${query}%,brand_name.ilike.%${query}%,address.ilike.%${query}%`);
    }

    // Apply pagination
    queryBuilder = queryBuilder
      .range(offset, offset + limit - 1)
      .order('name');

    const { data, error, count } = await queryBuilder;

    if (error) {
      console.error('Search error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    // Transform the nested specialties
    const providers: Provider[] = (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      specialties: (p.specialties as Array<{ specialty: unknown }> || []).map(
        (ps: { specialty: unknown }) => ps.specialty
      ),
    })) as Provider[];

    // Filter by specialty if specified (need to do this after getting specialties)
    let filteredProviders = providers;
    let filteredTotal = count || 0;

    if (specialty) {
      // For specialty filtering, we need to fetch all matching providers first
      // then paginate the filtered results
      // This is a workaround since Supabase doesn't easily support filtering by nested relations

      // First, get all providers matching other filters (without pagination)
      let allQuery = supabase
        .from(TABLES.PROVIDERS)
        .select(`
          *,
          county:counties(id, code, name),
          specialties:provider_specialties(
            specialty:specialties(id, code, name, category)
          )
        `);

      if (county) {
        const { data: countyData } = await supabase
          .from(TABLES.COUNTIES)
          .select('id')
          .eq('code', county)
          .single();
        if (countyData) {
          allQuery = allQuery.eq('county_id', countyData.id);
        }
      }
      if (type) {
        allQuery = allQuery.eq('provider_type', type);
      }
      if (query) {
        allQuery = allQuery.or(`name.ilike.%${query}%,brand_name.ilike.%${query}%,address.ilike.%${query}%`);
      }

      const { data: allData } = await allQuery.order('name');

      // Transform and filter all providers by specialty
      const allProviders: Provider[] = (allData || []).map((p: Record<string, unknown>) => ({
        ...p,
        specialties: (p.specialties as Array<{ specialty: unknown }> || []).map(
          (ps: { specialty: unknown }) => ps.specialty
        ),
      })) as Provider[];

      const allFiltered = allProviders.filter((p) =>
        p.specialties?.some((s) =>
          s.name.toLowerCase().includes(specialty.toLowerCase()) ||
          s.code?.toLowerCase().includes(specialty.toLowerCase())
        )
      );

      filteredTotal = allFiltered.length;
      filteredProviders = allFiltered.slice(offset, offset + limit);
    }

    return NextResponse.json({
      providers: filteredProviders,
      total: filteredTotal,
      page,
      limit,
      hasMore: filteredTotal > offset + limit,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
