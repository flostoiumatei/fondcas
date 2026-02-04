import { NextRequest, NextResponse } from 'next/server';
import { supabase, TABLES } from '@/lib/supabase';
import { estimateFundAvailability } from '@/lib/fund-estimator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get provider with related data
    const { data: provider, error } = await supabase
      .from(TABLES.PROVIDERS)
      .select(`
        *,
        county:counties(id, code, name),
        specialties:provider_specialties(
          specialty:specialties(id, code, name, category)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    // Transform specialties
    const transformedProvider = {
      ...provider,
      specialties: (provider.specialties || []).map(
        (ps: { specialty: unknown }) => ps.specialty
      ),
    };

    // Get current fund allocations (may have multiple service types)
    const now = new Date();
    const { data: allocations } = await supabase
      .from(TABLES.FUND_ALLOCATIONS)
      .select('*')
      .eq('provider_id', id)
      .eq('period_year', now.getFullYear())
      .eq('period_month', now.getMonth() + 1);

    // Sum all allocations for this month
    const allocation = allocations && allocations.length > 0 ? {
      ...allocations[0],
      allocated_amount: allocations.reduce((sum, a) => sum + (a.allocated_amount || 0), 0),
      consumed_amount: allocations.some(a => a.consumed_amount !== null)
        ? allocations.reduce((sum, a) => sum + (a.consumed_amount || 0), 0)
        : null,
      service_types: allocations.map(a => a.service_type),
    } : null;

    // Get recent user reports
    const { data: reports } = await supabase
      .from(TABLES.USER_REPORTS)
      .select('*')
      .eq('provider_id', id)
      .gte('reported_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('reported_at', { ascending: false });

    // Calculate fund status
    const fundStatus = estimateFundAvailability(allocation, reports || [], now);

    return NextResponse.json({
      provider: transformedProvider,
      fundStatus,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
