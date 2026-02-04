'use client';

import Link from 'next/link';
import { MapPin, Phone, Clock, ChevronRight, Building2, Calendar, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FundIndicator } from '@/components/fund-indicator';
import { cn, formatPhone, formatDistance } from '@/lib/utils';
import { Provider, PROVIDER_TYPE_LABELS, FundAvailabilityStatus } from '@/lib/types';

// Format data freshness in Romanian
function formatDataFreshness(dateStr?: string): { text: string; isStale: boolean } | null {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: 'Date viitoare', isStale: false };
  } else if (diffDays === 0) {
    return { text: 'Azi', isStale: false };
  } else if (diffDays === 1) {
    return { text: 'Ieri', isStale: false };
  } else if (diffDays < 7) {
    return { text: `Acum ${diffDays} zile`, isStale: false };
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return { text: `Acum ${weeks} ${weeks === 1 ? 'săptămână' : 'săptămâni'}`, isStale: false };
  } else if (diffDays < 60) {
    return { text: 'Acum ~1 lună', isStale: false };
  } else if (diffDays < 90) {
    return { text: 'Acum ~2 luni', isStale: true };
  } else {
    const months = Math.floor(diffDays / 30);
    return { text: `Acum ${months} luni`, isStale: true };
  }
}

interface ProviderCardProps {
  provider: Provider;
  fundStatus?: FundAvailabilityStatus | null;
  distance?: number; // km
  className?: string;
}

export function ProviderCard({
  provider,
  fundStatus,
  distance,
  className,
}: ProviderCardProps) {
  const typeLabel = PROVIDER_TYPE_LABELS[provider.provider_type] || provider.provider_type;

  return (
    <Link href={`/provider/${provider.id}`}>
      <Card
        className={cn(
          'card-tap cursor-pointer hover:shadow-md transition-shadow',
          className
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Provider name - show brand name if verified */}
              {provider.brand_name && provider.brand_name !== provider.name ? (
                <>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <h3 className="font-semibold text-base leading-tight line-clamp-2">
                      {provider.brand_name}
                    </h3>
                    {provider.verification_confidence && provider.verification_confidence >= 70 && (
                      <ShieldCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-1 line-clamp-1">
                    {provider.name}
                  </p>
                </>
              ) : (
                <h3 className="font-semibold text-base leading-tight mb-1 line-clamp-2">
                  {provider.name}
                </h3>
              )}

              {/* Type badge */}
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">
                  <Building2 className="h-3 w-3 mr-1" />
                  {typeLabel}
                </Badge>
                {distance !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistance(distance)}
                  </span>
                )}
              </div>

              {/* Address */}
              {provider.address && (
                <div className="flex items-start gap-1.5 text-sm text-muted-foreground mb-1">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">
                    {provider.address}
                    {provider.city && `, ${provider.city}`}
                  </span>
                </div>
              )}

              {/* Phone */}
              {provider.phone && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <span>{formatPhone(provider.phone)}</span>
                </div>
              )}

              {/* Data freshness indicator */}
              {(() => {
                const freshness = formatDataFreshness(provider.data_source_date);
                if (!freshness) return null;
                return (
                  <div className={cn(
                    "flex items-center gap-1.5 text-xs mt-1",
                    freshness.isStale ? "text-orange-600" : "text-muted-foreground"
                  )}>
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span>Date CNAS: {freshness.text}</span>
                  </div>
                );
              })()}
            </div>

            {/* Arrow indicator */}
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
          </div>

          {/* Fund status */}
          {fundStatus && (
            <div className="mt-3 pt-3 border-t">
              <FundIndicator status={fundStatus} compact />
            </div>
          )}

          {/* Specialties preview */}
          {provider.specialties && provider.specialties.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {provider.specialties.slice(0, 3).map((spec) => (
                <span
                  key={spec.id}
                  className="text-xs bg-muted px-2 py-0.5 rounded-full"
                >
                  {spec.name}
                </span>
              ))}
              {provider.specialties.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{provider.specialties.length - 3}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// Skeleton for loading state
export function ProviderCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="h-5 bg-muted rounded animate-pulse w-3/4" />
          <div className="flex gap-2">
            <div className="h-5 bg-muted rounded animate-pulse w-20" />
            <div className="h-5 bg-muted rounded animate-pulse w-16" />
          </div>
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
          <div className="h-8 bg-muted rounded animate-pulse w-full mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}
