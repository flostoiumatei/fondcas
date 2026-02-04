'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Sparkles,
  RefreshCw,
  Phone,
  MapPin,
  Clock,
  Building2,
  ArrowRight,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Database,
} from 'lucide-react';
import { cn, formatPhone, getTelLink } from '@/lib/utils';

interface VerifiedInfo {
  brandName: string | null;
  legalName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
}

interface VerificationResult {
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

interface ProviderVerificationProps {
  providerId: string;
}

export function ProviderVerification({ providerId }: ProviderVerificationProps) {
  const [loading, setLoading] = useState(true); // Start loading to check cache
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-load cached verification on mount
  useEffect(() => {
    checkCachedVerification();
  }, [providerId]);

  const checkCachedVerification = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/verify/${providerId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.cached) {
          setResult(data);
        }
      }
    } catch (err) {
      // Silently fail - just show the verify button
      console.error('Failed to check cache:', err);
    } finally {
      setLoading(false);
    }
  };

  const runVerification = async (forceRefresh: boolean = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const url = forceRefresh
        ? `/api/verify/${providerId}?refresh=true`
        : `/api/verify/${providerId}`;
      const response = await fetch(url);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Verification failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) {
      return <Badge className="bg-green-100 text-green-800 border-green-200">Încredere ridicată</Badge>;
    }
    if (confidence >= 60) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Încredere medie</Badge>;
    }
    return <Badge className="bg-red-100 text-red-800 border-red-200">Încredere scăzută</Badge>;
  };

  // Initial loading state (checking cache)
  if (loading && !result) {
    return (
      <Card className="border-dashed border-muted">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Se verifică datele...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No cached result - show verify button
  if (!result && !loading && !error) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Verificare inteligentă</p>
                <p className="text-xs text-muted-foreground">
                  Găsește numele real, adresa și telefonul corect
                </p>
              </div>
            </div>
            <Button onClick={() => runVerification(false)} size="sm">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Verifică cu AI
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error && !result) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-sm text-red-900">Verificare eșuată</p>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            </div>
            <Button onClick={() => runVerification(false)} size="sm" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reîncearcă
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const hasCorrections = result.corrections.length > 0;
  const hasBrandName = result.verified.brandName && result.verified.brandName !== result.verified.legalName;

  return (
    <Card className={cn(
      "border-2",
      result.confidence >= 70 ? "border-green-200 bg-green-50/50" : "border-yellow-200 bg-yellow-50/50"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            {result.confidence >= 70 ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-yellow-600" />
            )}
            <span>Informații verificate</span>
            {result.cached && (
              <Badge variant="outline" className="text-xs font-normal ml-1">
                <Database className="h-3 w-3 mr-1" />
                din cache
              </Badge>
            )}
          </div>
          {getConfidenceBadge(result.confidence)}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-sm text-muted-foreground bg-white/60 p-3 rounded-lg">
          {result.summary}
        </p>

        {/* Verified Information */}
        <div className="space-y-3">
          {/* Brand Name vs Legal Name */}
          {hasBrandName && (
            <div className="p-3 bg-white rounded-lg border">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">Numele clinicii</p>
                  <p className="font-semibold text-lg">{result.verified.brandName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Denumire juridică: {result.verified.legalName}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Phone */}
          {result.verified.phone && (
            <div className="p-3 bg-white rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefon</p>
                    <a
                      href={getTelLink(result.verified.phone)}
                      className="font-medium text-primary hover:underline"
                    >
                      {formatPhone(result.verified.phone)}
                    </a>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(result.verified.phone!, 'phone')}
                    className="h-8 w-8 p-0"
                  >
                    {copiedField === 'phone' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <a href={getTelLink(result.verified.phone)}>
                    <Button size="sm" variant="default" className="h-8">
                      Sună
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Address */}
          {result.verified.address && (
            <div className="p-3 bg-white rounded-lg border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">Adresă</p>
                    <p className="font-medium">{result.verified.address}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(result.verified.address!, 'address')}
                  className="h-8 w-8 p-0 flex-shrink-0"
                >
                  {copiedField === 'address' ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Opening Hours */}
          {result.verified.openingHours && (
            <div className="p-3 bg-white rounded-lg border">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Program</p>
                  <p className="font-medium">{result.verified.openingHours}</p>
                </div>
              </div>
            </div>
          )}

          {/* Website */}
          {result.verified.website && (
            <div className="p-3 bg-white rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ExternalLink className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Website</p>
                    <a
                      href={result.verified.website.startsWith('http') ? result.verified.website : `https://${result.verified.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline text-sm"
                    >
                      {result.verified.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Warnings */}
        {result.warnings && result.warnings.length > 0 && (
          <div className="space-y-2">
            {result.warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-yellow-100 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800">{warning}</p>
              </div>
            ))}
          </div>
        )}

        {/* Corrections details */}
        {hasCorrections && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Vezi {result.corrections.length} {result.corrections.length === 1 ? 'corecție' : 'corecții'} făcute
            </summary>
            <div className="mt-2 space-y-2">
              {result.corrections.map((correction, i) => (
                <div key={i} className="p-2 bg-white/60 rounded border text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium capitalize">{correction.field}</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                  <p className="text-muted-foreground">{correction.note}</p>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/50">
          <p className="text-xs text-muted-foreground">
            Verificat: {new Date(result.timestamp).toLocaleString('ro-RO')}
          </p>
          <Button
            onClick={() => runVerification(true)}
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Reverificare
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
