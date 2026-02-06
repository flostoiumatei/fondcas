import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Simple fuzzy matching score (Levenshtein-inspired but faster)
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (t === q) return 100;

  // Starts with query
  if (t.startsWith(q)) return 90;

  // Contains query as whole word
  if (t.includes(` ${q}`) || t.includes(`${q} `)) return 80;

  // Contains query anywhere
  if (t.includes(q)) return 70;

  // Check if all characters of query appear in order in target
  let qIdx = 0;
  let consecutive = 0;
  let maxConsecutive = 0;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      qIdx++;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }

  if (qIdx === q.length) {
    // All characters found in order
    return 50 + (maxConsecutive / q.length) * 20;
  }

  // Check for typo tolerance (allow 1-2 char differences for short queries)
  if (q.length >= 3) {
    // Check if removing one char from query matches
    for (let i = 0; i < q.length; i++) {
      const reduced = q.slice(0, i) + q.slice(i + 1);
      if (t.includes(reduced)) return 40;
    }

    // Check word beginnings match (e.g., "card" matches "cardiologie")
    const words = t.split(/\s+/);
    for (const word of words) {
      if (word.startsWith(q.slice(0, Math.min(3, q.length)))) {
        return 35;
      }
    }
  }

  return 0;
}

interface Suggestion {
  type: 'location' | 'specialty' | 'network';
  id: string;
  name: string;
  subtitle?: string;
  score: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions: Suggestion[] = [];

    // Search locations/clinics
    const { data: locations } = await supabase
      .from('locations')
      .select(`
        id,
        name,
        city,
        organization:organizations!inner (
          legal_name,
          is_network,
          network_brand
        )
      `)
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .gte('confidence', 50)
      .limit(20);

    if (locations) {
      for (const loc of locations) {
        const org = loc.organization as any;
        const displayName = org?.network_brand || loc.name;
        const score = Math.max(
          fuzzyScore(query, displayName),
          fuzzyScore(query, loc.name),
          loc.city ? fuzzyScore(query, loc.city) : 0
        );

        if (score > 0) {
          suggestions.push({
            type: org?.is_network ? 'network' : 'location',
            id: loc.id,
            name: displayName,
            subtitle: loc.city || undefined,
            score,
          });
        }
      }
    }

    // Search specialties
    const { data: specialties } = await supabase
      .from('specialties')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .limit(10);

    if (specialties) {
      for (const spec of specialties) {
        const score = fuzzyScore(query, spec.name);
        if (score > 0) {
          suggestions.push({
            type: 'specialty',
            id: spec.id,
            name: spec.name,
            score,
          });
        }
      }
    }

    // Search by organization name/brand
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, legal_name, network_brand, is_network')
      .or(`legal_name.ilike.%${query}%,network_brand.ilike.%${query}%`)
      .limit(10);

    if (orgs) {
      for (const org of orgs) {
        const displayName = org.network_brand || org.legal_name;
        const score = Math.max(
          fuzzyScore(query, displayName),
          org.network_brand ? fuzzyScore(query, org.network_brand) : 0
        );

        if (score > 0 && !suggestions.some(s => s.name === displayName)) {
          suggestions.push({
            type: org.is_network ? 'network' : 'location',
            id: org.id,
            name: displayName,
            score,
          });
        }
      }
    }

    // Also do a broader fuzzy search if we have few results
    if (suggestions.length < 5 && query.length >= 3) {
      // Search with partial matching (first 3 chars)
      const prefix = query.slice(0, 3);

      const { data: fuzzyLocs } = await supabase
        .from('locations')
        .select('id, name, city')
        .ilike('name', `%${prefix}%`)
        .gte('confidence', 50)
        .limit(10);

      if (fuzzyLocs) {
        for (const loc of fuzzyLocs) {
          const score = fuzzyScore(query, loc.name);
          if (score > 25 && !suggestions.some(s => s.id === loc.id)) {
            suggestions.push({
              type: 'location',
              id: loc.id,
              name: loc.name,
              subtitle: loc.city || undefined,
              score,
            });
          }
        }
      }
    }

    // Sort by score and deduplicate
    const seen = new Set<string>();
    const uniqueSuggestions = suggestions
      .sort((a, b) => b.score - a.score)
      .filter(s => {
        const key = `${s.type}-${s.name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

    return NextResponse.json({ suggestions: uniqueSuggestions });
  } catch (error) {
    console.error('Search suggestions error:', error);
    return NextResponse.json({ suggestions: [] });
  }
}
