import { NextResponse } from 'next/server';
import { supabase, TABLES } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from(TABLES.SPECIALTIES)
      .select('id, name, category')
      .order('name');

    if (error) {
      console.error('Specialties fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch specialties' }, { status: 500 });
    }

    return NextResponse.json({
      specialties: data || [],
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
