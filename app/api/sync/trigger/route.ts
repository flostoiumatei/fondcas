import { NextRequest, NextResponse } from 'next/server';

// This endpoint triggers the data sync process
// It should be called by a cron job or manually when needed
// Protected by a secret key

export async function POST(request: NextRequest) {
  try {
    // Verify secret key
    const authHeader = request.headers.get('authorization');
    const secretKey = process.env.SYNC_SECRET_KEY;

    if (!secretKey) {
      return NextResponse.json(
        { error: 'Sync not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // In a production environment, you would trigger the sync process here
    // This could involve:
    // 1. Running the download script
    // 2. Parsing the Excel files
    // 3. Geocoding addresses
    // 4. Uploading to database

    // For now, we'll just return a success message
    // The actual sync should be done via the CLI scripts

    return NextResponse.json({
      message: 'Sync triggered. Run the following commands to complete:',
      commands: [
        'npm run sync:download',
        'npm run sync:parse',
        'npm run sync:geocode',
        'npm run sync:upload',
      ],
      note: 'For production, integrate these scripts into this endpoint or use a job queue.',
    });
  } catch (error) {
    console.error('Sync trigger error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Sync endpoint. Use POST with Bearer token to trigger sync.',
    status: 'ready',
  });
}
