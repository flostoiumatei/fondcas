import { NextRequest, NextResponse } from 'next/server';
import { supabase, TABLES } from '@/lib/supabase';
import { estimateFundAvailability } from '@/lib/fund-estimator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { providerId } = await params;
    const { searchParams } = new URL(request.url);
    const serviceType = searchParams.get('serviceType') || 'paraclinic';

    const now = new Date();

    // Get current fund allocation
    const { data: allocation, error: allocError } = await supabase
      .from(TABLES.FUND_ALLOCATIONS)
      .select('*')
      .eq('provider_id', providerId)
      .eq('period_year', now.getFullYear())
      .eq('period_month', now.getMonth() + 1)
      .eq('service_type', serviceType)
      .single();

    if (allocError && allocError.code !== 'PGRST116') {
      console.error('Fund allocation error:', allocError);
    }

    // Get recent user reports
    const { data: reports } = await supabase
      .from(TABLES.USER_REPORTS)
      .select('*')
      .eq('provider_id', providerId)
      .gte('reported_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('reported_at', { ascending: false });

    // Calculate fund status
    const fundStatus = estimateFundAvailability(allocation, reports || [], now);

    return NextResponse.json({
      allocation,
      reports: reports?.slice(0, 5) || [],
      status: fundStatus,
      disclaimer:
        'Aceasta este o estimare bazată pe date istorice și rapoarte ale utilizatorilor. Vă rugăm confirmați telefonic înainte de deplasare.',
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
