import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Fetch the location with organization and county
    const { data: location, error } = await supabase
      .from('locations')
      .select(`
        *,
        organization:organizations (
          id,
          cui,
          legal_name,
          is_network,
          network_brand,
          network_website,
          provider_type,
          cnas_contract_number,
          ai_confidence,
          data_source_date
        ),
        county:counties (
          id,
          code,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error || !location) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      );
    }

    // Fetch specialties for this organization
    let specialties: string[] = [];

    if (location.organization_id) {
      const { data: orgSpecialties } = await supabase
        .from('organization_specialties')
        .select(`
          specialty:specialties (
            id,
            name
          )
        `)
        .eq('organization_id', location.organization_id);

      if (orgSpecialties) {
        specialties = orgSpecialties
          .map((os: any) => os.specialty?.name)
          .filter(Boolean)
          .sort();
      }
    }

    // If this is a network, fetch sibling locations
    let siblingLocations: any[] = [];

    if (location.organization?.is_network) {
      const { data: siblings } = await supabase
        .from('locations')
        .select(`
          id,
          name,
          address,
          city,
          source,
          confidence,
          is_primary,
          county:counties (
            id,
            code,
            name
          )
        `)
        .eq('organization_id', location.organization_id)
        .neq('id', id)
        .order('is_primary', { ascending: false })
        .order('city')
        .order('name');

      siblingLocations = siblings || [];
    }

    return NextResponse.json({
      location,
      siblingLocations,
      specialties,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
