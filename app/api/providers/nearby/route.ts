import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = searchParams.get('radius') || '3';
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!lat || !lng) {
      return NextResponse.json(
        { error: 'lat and lng parameters are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('search_providers_nearby', {
      search_lat: parseFloat(lat),
      search_lng: parseFloat(lng),
      radius_km: parseFloat(radius),
    });

    if (error) {
      console.error('Nearby search error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    let results = data || [];

    // Filter by type if specified
    if (type) {
      results = results.filter((p: { provider_type: string }) => p.provider_type === type);
    }

    // Limit results
    results = results.slice(0, limit);

    return NextResponse.json({
      providers: results,
      total: results.length,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
