import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, TABLES } from '@/lib/supabase';

export interface VerifiedInfo {
  brandName: string | null;
  legalName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
}

export interface VerificationResult {
  confidence: number;
  verified: VerifiedInfo;
  original: VerifiedInfo;
  corrections: {
    field: string;
    original: string | null;
    corrected: string | null;
    note: string;
  }[];
  warnings: string[];
  summary: string;
  timestamp: string;
  cached?: boolean;
}

const CACHE_DAYS = 10;

function extractDomainFromEmail(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1] : null;
}

function extractPossibleWebsites(provider: {
  website?: string;
  email?: string;
}): string[] {
  const websites: string[] = [];

  if (provider.website) {
    websites.push(provider.website);
  }

  if (provider.email) {
    const emailDomain = extractDomainFromEmail(provider.email);
    if (emailDomain && !emailDomain.includes('gmail') && !emailDomain.includes('yahoo') && !emailDomain.includes('hotmail')) {
      websites.push(`https://${emailDomain}`);
      websites.push(`https://www.${emailDomain}`);
    }
  }

  return [...new Set(websites)];
}

async function fetchWebsiteContent(url: string): Promise<{ content: string; finalUrl: string } | null> {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000);

    return { content: textContent, finalUrl: response.url };
  } catch (error) {
    console.error('Failed to fetch website:', url, error);
    return null;
  }
}

async function tryFetchAnyWebsite(urls: string[]): Promise<{ content: string; url: string } | null> {
  for (const url of urls) {
    const result = await fetchWebsiteContent(url);
    if (result && result.content.length > 500) {
      return { content: result.content, url: result.finalUrl };
    }
  }
  return null;
}

// Check for cached verification
async function getCachedVerification(providerId: string): Promise<VerificationResult | null> {
  const cacheDate = new Date();
  cacheDate.setDate(cacheDate.getDate() - CACHE_DAYS);

  const { data: cached, error } = await supabase
    .from('provider_verifications')
    .select('*')
    .eq('provider_id', providerId)
    .gte('verified_at', cacheDate.toISOString())
    .order('verified_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !cached) return null;

  // Also fetch the provider for original data
  const { data: provider } = await supabase
    .from(TABLES.PROVIDERS)
    .select('name, address, phone, website')
    .eq('id', providerId)
    .single();

  if (!provider) return null;

  return {
    confidence: cached.confidence,
    verified: {
      brandName: cached.brand_name,
      legalName: provider.name,
      address: cached.verified_address || provider.address,
      phone: cached.verified_phone || provider.phone,
      website: cached.verified_website || provider.website,
      openingHours: cached.opening_hours,
    },
    original: {
      brandName: null,
      legalName: provider.name,
      address: provider.address,
      phone: provider.phone,
      website: provider.website,
      openingHours: null,
    },
    corrections: cached.corrections || [],
    warnings: cached.warnings || [],
    summary: cached.summary,
    timestamp: cached.verified_at,
    cached: true,
  };
}

// Save verification to database
async function saveVerification(
  providerId: string,
  result: VerificationResult
): Promise<void> {
  try {
    // Save to verifications table
    await supabase.from('provider_verifications').insert({
      provider_id: providerId,
      brand_name: result.verified.brandName,
      verified_address: result.verified.address,
      verified_phone: result.verified.phone,
      verified_website: result.verified.website,
      opening_hours: result.verified.openingHours,
      confidence: result.confidence,
      summary: result.summary,
      warnings: result.warnings,
      corrections: result.corrections,
    });

    // If confidence is high enough, update the provider record
    if (result.confidence >= 70 && result.verified.brandName) {
      await supabase
        .from(TABLES.PROVIDERS)
        .update({
          brand_name: result.verified.brandName,
          verified_address: result.verified.address,
          verified_phone: result.verified.phone,
          verification_confidence: result.confidence,
          verified_at: new Date().toISOString(),
        })
        .eq('id', providerId);
    }
  } catch (error) {
    console.error('Failed to save verification:', error);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI verification not configured' },
      { status: 503 }
    );
  }

  try {
    // Check for cached verification first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCachedVerification(id);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    // Fetch provider data
    const { data: provider, error } = await supabase
      .from(TABLES.PROVIDERS)
      .select(`
        *,
        specialties:provider_specialties(
          specialty:specialties(id, name)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }

    // Try to fetch website content from multiple sources
    const possibleWebsites = extractPossibleWebsites(provider);
    const websiteResult = await tryFetchAnyWebsite(possibleWebsites);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const providerData = {
      name: provider.name,
      type: provider.provider_type,
      address: provider.address,
      city: provider.city,
      county: provider.county,
      phone: provider.phone,
      email: provider.email,
      website: provider.website,
      cui: provider.cui,
      specialties: provider.specialties?.map((s: { specialty: { name: string } }) => s.specialty?.name).filter(Boolean),
    };

    const emailDomain = provider.email ? extractDomainFromEmail(provider.email) : null;

    const prompt = `Ești un expert în identificarea clinicilor medicale din România. Trebuie să găsești NUMELE REAL (brand-ul) al clinicii bazându-te pe TOATE indiciile disponibile.

DATE DIN BAZA DE DATE CNAS:
- Denumire juridică: ${provider.name}
- Tip: ${provider.provider_type}
- Adresă: ${provider.address || 'necunoscută'}
- Oraș: ${provider.city || 'necunoscut'}
- Județ: ${provider.county || 'necunoscut'}
- Telefon: ${provider.phone || 'necunoscut'}
- Email: ${provider.email || 'necunoscut'}
- Website declarat: ${provider.website || 'nedeclarat'}
- CUI: ${provider.cui || 'necunoscut'}

INDICII IMPORTANTE PENTRU ANALIZĂ:
${emailDomain ? `- Domeniul din email: ${emailDomain} (INDICIU PUTERNIC pentru brand!)` : '- Nu există email cu domeniu propriu'}
${provider.address ? `- Adresa conține: "${provider.address}" (caută cuvinte cheie care se potrivesc cu domeniul)` : ''}
${websiteResult ? `- Am accesat website-ul: ${websiteResult.url}` : '- Nu am putut accesa niciun website'}

${websiteResult ? `CONȚINUT DE PE WEBSITE (${websiteResult.url}):
${websiteResult.content.slice(0, 10000)}` : ''}

SARCINA TA - FII FOARTE ATENT:
1. ANALIZEAZĂ domeniul din email (dacă există). De exemplu:
   - Email "office@ghenceamedicalcenter.ro" → Brand probabil "Ghencea Medical Center"
   - Email "contact@clinicaalfa.ro" → Brand probabil "Clinica Alfa"

2. CORELEAZĂ cu adresa. De exemplu:
   - Dacă adresa e pe "Bulevardul Ghencea" și emailul e de la "ghenceamedicalcenter.ro" → CONFIRMARE că brand-ul e "Ghencea Medical Center"

3. EXTRAGE din website (dacă disponibil):
   - Numele brand-ului afișat
   - Adresa completă
   - Telefoane de contact
   - Program de lucru

4. Dacă NU ai website dar AI indicii (email + adresă corelate), deduci brand-ul cu încredere medie.

REGULI:
- Denumirile SRL/SA/PFA sunt JURIDICE, nu sunt brand-uri
- Brand-ul e numele pe care îl vede pacientul (pe firmă, pe website, etc.)
- Dacă domeniul email corelează cu strada din adresă = brand CONFIRMAT
- Fără website dar cu indicii bune = încredere 60-75%
- Cu website și date clare = încredere 80-95%

Răspunde DOAR în JSON valid:
{
  "brandName": "<numele de brand dedus sau null dacă e identic cu cel juridic>",
  "brandDeductionReason": "<explică cum ai dedus brand-ul>",
  "verifiedAddress": "<adresa completă corectată sau null>",
  "verifiedPhone": "<telefonul verificat sau null>",
  "openingHours": "<program sau null>",
  "confidence": <0-100>,
  "warnings": ["<avertismente pentru pacient>"],
  "summary": "<1-2 propoziții UTILE pentru pacient, menționând brand-ul real dacă diferă>"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    let aiResult = {
      brandName: null as string | null,
      brandDeductionReason: null as string | null,
      verifiedAddress: null as string | null,
      verifiedPhone: null as string | null,
      openingHours: null as string | null,
      confidence: 50,
      warnings: [] as string[],
      summary: 'Nu am putut verifica datele.',
    };

    try {
      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = { ...aiResult, ...JSON.parse(jsonMatch[0]) };
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
    }

    const corrections: VerificationResult['corrections'] = [];

    if (aiResult.brandName && aiResult.brandName !== provider.name) {
      corrections.push({
        field: 'brand',
        original: provider.name,
        corrected: aiResult.brandName,
        note: aiResult.brandDeductionReason || 'Brand identificat din indiciile disponibile',
      });
    }

    if (aiResult.verifiedAddress && aiResult.verifiedAddress !== provider.address) {
      corrections.push({
        field: 'adresă',
        original: provider.address,
        corrected: aiResult.verifiedAddress,
        note: 'Adresă actualizată conform website-ului',
      });
    }

    if (aiResult.verifiedPhone && aiResult.verifiedPhone !== provider.phone) {
      corrections.push({
        field: 'telefon',
        original: provider.phone,
        corrected: aiResult.verifiedPhone,
        note: 'Telefon actualizat conform website-ului',
      });
    }

    let verifiedWebsite = provider.website;
    if (!verifiedWebsite && websiteResult) {
      verifiedWebsite = websiteResult.url;
    } else if (!verifiedWebsite && emailDomain && !emailDomain.includes('gmail') && !emailDomain.includes('yahoo')) {
      verifiedWebsite = `https://${emailDomain}`;
    }

    const result: VerificationResult = {
      confidence: aiResult.confidence,
      verified: {
        brandName: aiResult.brandName,
        legalName: provider.name,
        address: aiResult.verifiedAddress || provider.address,
        phone: aiResult.verifiedPhone || provider.phone,
        website: verifiedWebsite,
        openingHours: aiResult.openingHours,
      },
      original: {
        brandName: null,
        legalName: provider.name,
        address: provider.address,
        phone: provider.phone,
        website: provider.website,
        openingHours: null,
      },
      corrections,
      warnings: aiResult.warnings,
      summary: aiResult.summary,
      timestamp: new Date().toISOString(),
      cached: false,
    };

    // Save to database
    await saveVerification(id, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}
