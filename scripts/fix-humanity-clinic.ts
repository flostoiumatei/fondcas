import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fix() {
  // First, let's try to find better coordinates using a more specific search
  // The address is: Bd Uverturii 163E - this is near the end of Bd Uverturii in Militari

  // Based on the street pattern, 163E should be around here:
  // Let me estimate based on the street layout
  const estimatedLat = 44.4385;  // Slightly adjusted from current
  const estimatedLng = 26.0295;  // Slightly more west

  const { data, error } = await supabase
    .from('locations')
    .update({
      city: 'București',
      address: 'Bulevardul Uverturii 163E, Sector 6, București',
      // Keep existing coordinates for now - user can verify
    })
    .eq('id', '723a4f58-25f7-4139-a27c-0340ea3a155a')
    .select();

  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Updated:', JSON.stringify(data, null, 2));
  }
}

fix();
