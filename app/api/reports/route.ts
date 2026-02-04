import { NextRequest, NextResponse } from 'next/server';
import { supabase, TABLES } from '@/lib/supabase';
import { hashString } from '@/lib/utils';
import { ReportType } from '@/lib/types';

// GET - Get reports for a provider
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!providerId) {
      return NextResponse.json(
        { error: 'providerId is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from(TABLES.USER_REPORTS)
      .select('*')
      .eq('provider_id', providerId)
      .order('reported_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching reports:', error);
      return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
    }

    return NextResponse.json({ reports: data || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Submit a new report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId, reportType, comment } = body;

    // Validate required fields
    if (!providerId || !reportType) {
      return NextResponse.json(
        { error: 'providerId and reportType are required' },
        { status: 400 }
      );
    }

    // Validate report type
    const validTypes: ReportType[] = [
      'funds_available',
      'funds_exhausted',
      'long_wait',
      'good_service',
    ];
    if (!validTypes.includes(reportType)) {
      return NextResponse.json(
        { error: 'Invalid report type' },
        { status: 400 }
      );
    }

    // Verify provider exists
    const { data: provider } = await supabase
      .from(TABLES.PROVIDERS)
      .select('id')
      .eq('id', providerId)
      .single();

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }

    // Get IP for rate limiting (hash it for privacy)
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
    const ipHash = await hashString(ip + providerId);

    // Check for recent reports from same IP for same provider (rate limiting)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentReports } = await supabase
      .from(TABLES.USER_REPORTS)
      .select('id')
      .eq('provider_id', providerId)
      .eq('reporter_ip_hash', ipHash)
      .gte('reported_at', oneHourAgo);

    if (recentReports && recentReports.length > 0) {
      return NextResponse.json(
        { error: 'Poți trimite un singur raport pe oră pentru același furnizor' },
        { status: 429 }
      );
    }

    // Insert report
    const { data, error } = await supabase
      .from(TABLES.USER_REPORTS)
      .insert({
        provider_id: providerId,
        report_type: reportType,
        comment: comment?.slice(0, 500), // Limit comment length
        reporter_ip_hash: ipHash,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating report:', error);
      return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
    }

    return NextResponse.json({ report: data }, { status: 201 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
