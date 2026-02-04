'use client';

import Link from 'next/link';
import { MapPin, Phone, ChevronRight, Building2, Calendar, Network, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatPhone, formatDistance } from '@/lib/utils';
import { PROVIDER_TYPE_LABELS } from '@/lib/types';
import { LocationSource, LOCATION_SOURCE_LABELS } from '@/lib/types-v2';

// Location data from the v2 API
export interface LocationData {
  id: string;
  name: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  website?: string;
  source: LocationSource;
  confidence: number;
  is_primary: boolean;
  organization_id: string;
  organization_name: string;
  organization_cui?: string;
  is_network: boolean;
  network_brand?: string;
  network_website?: string;
  provider_type: string;
  data_source_date?: string;
  ai_confidence?: number;
  county?: {
    id: string;
    code: string;
    name: string;
  };
  distance?: number;
}

function formatDataFreshness(dateStr?: string): { text: string; isStale: boolean } | null {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Date viitoare', isStale: false };
  if (diffDays === 0) return { text: 'Azi', isStale: false };
  if (diffDays === 1) return { text: 'Ieri', isStale: false };
  if (diffDays < 7) return { text: `Acum ${diffDays} zile`, isStale: false };
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return { text: `Acum ${weeks} ${weeks === 1 ? 'săptămână' : 'săptămâni'}`, isStale: false };
  }
  if (diffDays < 60) return { text: 'Acum ~1 lună', isStale: false };
  if (diffDays < 90) return { text: 'Acum ~2 luni', isStale: true };
  const months = Math.floor(diffDays / 30);
  return { text: `Acum ${months} luni`, isStale: true };
}

function getConfidenceBadge(confidence: number, source: LocationSource) {
  if (source === 'cnas') {
    return (
      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        CNAS verificat
      </Badge>
    );
  }

  if (confidence >= 80) {
    return (
      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        {confidence}% sigur
      </Badge>
    );
  }

  if (confidence >= 60) {
    return (
      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        {confidence}% probabil
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
      <AlertCircle className="h-3 w-3 mr-1" />
      De verificat
    </Badge>
  );
}

interface LocationCardProps {
  location: LocationData;
  className?: string;
}

export function LocationCard({ location, className }: LocationCardProps) {
  const typeLabel = PROVIDER_TYPE_LABELS[location.provider_type as keyof typeof PROVIDER_TYPE_LABELS] || location.provider_type;
  const displayName = location.name || location.network_brand || location.organization_name;
  const freshness = formatDataFreshness(location.data_source_date);

  return (
    <Link href={`/location/${location.id}`}>
      <Card
        className={cn(
          'card-tap cursor-pointer hover:shadow-md transition-shadow',
          className
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Network badge if part of a network */}
              {location.is_network && location.network_brand && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge className="text-xs bg-purple-100 text-purple-800 hover:bg-purple-100">
                    <Network className="h-3 w-3 mr-1" />
                    {location.network_brand}
                  </Badge>
                </div>
              )}

              {/* Location name */}
              <h3 className="font-semibold text-base leading-tight mb-1 line-clamp-2">
                {displayName}
              </h3>

              {/* Show organization name if different from location name */}
              {location.is_network && displayName !== location.organization_name && (
                <p className="text-xs text-muted-foreground mb-1 line-clamp-1">
                  {location.organization_name}
                </p>
              )}

              {/* Type and confidence badges */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  <Building2 className="h-3 w-3 mr-1" />
                  {typeLabel}
                </Badge>
                {getConfidenceBadge(location.confidence, location.source)}
                {location.distance !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistance(location.distance)}
                  </span>
                )}
              </div>

              {/* Address */}
              {(location.address || location.city) && (
                <div className="flex items-start gap-1.5 text-sm text-muted-foreground mb-1">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">
                    {location.address}
                    {location.city && location.address && ', '}
                    {location.city}
                    {location.county && ` (${location.county.name})`}
                  </span>
                </div>
              )}

              {/* Phone */}
              {location.phone && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <span>{formatPhone(location.phone)}</span>
                </div>
              )}

              {/* Data freshness */}
              {freshness && (
                <div className={cn(
                  "flex items-center gap-1.5 text-xs mt-1",
                  freshness.isStale ? "text-orange-600" : "text-muted-foreground"
                )}>
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  <span>Date CNAS: {freshness.text}</span>
                </div>
              )}
            </div>

            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Skeleton for loading state
export function LocationCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="h-5 bg-muted rounded animate-pulse w-20" />
          <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
          <div className="flex gap-2">
            <div className="h-5 bg-muted rounded animate-pulse w-20" />
            <div className="h-5 bg-muted rounded animate-pulse w-24" />
          </div>
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}
