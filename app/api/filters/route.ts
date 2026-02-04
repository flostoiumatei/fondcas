import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET() {
  try {
    // Fetch counties
    const { data: counties, error: countiesError } = await supabase
      .from('counties')
      .select('id, code, name')
      .order('name');

    if (countiesError) {
      console.error('Counties fetch error:', countiesError);
    }

    // Fetch specialties that are actually used
    const { data: specialties, error: specialtiesError } = await supabase
      .from('specialties')
      .select('id, name')
      .order('name');

    if (specialtiesError) {
      console.error('Specialties fetch error:', specialtiesError);
    }

    // Get unique cities from locations
    const { data: cities, error: citiesError } = await supabase
      .from('locations')
      .select('city')
      .not('city', 'is', null)
      .order('city');

    if (citiesError) {
      console.error('Cities fetch error:', citiesError);
    }

    // Get unique cities
    const uniqueCities = [...new Set(cities?.map(c => c.city).filter(Boolean) || [])].sort();

    // Provider types - static list matching our data
    const providerTypes = [
      { value: 'clinic', label: 'Clinică' },
      { value: 'paraclinic', label: 'Laborator / Radiologie' },
      { value: 'hospital', label: 'Spital' },
      { value: 'recovery', label: 'Recuperare medicală' },
    ];

    return NextResponse.json({
      counties: counties || [],
      cities: uniqueCities,
      specialties: specialties || [],
      providerTypes,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
