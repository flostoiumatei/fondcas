import { NextRequest, NextResponse } from 'next/server';
import { supabase, TABLES } from '@/lib/supabase';
import { fundPredictor } from '@/lib/fund-predictor';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { providerId } = await params;
    const { searchParams } = new URL(request.url);
    const serviceType = searchParams.get('serviceType') || 'paraclinic';

    // Get provider details
    const { data: provider, error: provError } = await supabase
      .from(TABLES.PROVIDERS)
      .select('id, name, cui')
      .eq('id', providerId)
      .single();

    if (provError || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const now = new Date();

    // Get current allocation
    const { data: allocation } = await supabase
      .from(TABLES.FUND_ALLOCATIONS)
      .select('*')
      .eq('provider_id', providerId)
      .eq('period_year', now.getFullYear())
      .eq('period_month', now.getMonth() + 1)
      .eq('service_type', serviceType)
      .single();

    // Get recent user reports (last 48 hours)
    const { data: reports } = await supabase
      .from(TABLES.USER_REPORTS)
      .select('*')
      .eq('provider_id', providerId)
      .gte('reported_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('reported_at', { ascending: false });

    // Run prediction
    const prediction = await fundPredictor.predict({
      providerId,
      providerCui: provider.cui || '',
      serviceType,
      currentDate: now,
      allocatedAmount: allocation?.allocated_amount || 0,
      recentUserReports: reports || [],
    });

    return NextResponse.json({
      provider: {
        id: provider.id,
        name: provider.name,
      },
      prediction,
      disclaimer:
        'Aceasta este o estimare bazată pe date istorice. Vă rugăm confirmați telefonic înainte de deplasare.',
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
