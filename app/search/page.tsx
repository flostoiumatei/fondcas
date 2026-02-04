'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  MapPin,
  Phone,
  ChevronRight,
  Building2,
  Network,
  CheckCircle2,
  AlertCircle,
  X,
  Locate,
  Loader2
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn, formatPhone, formatDistance } from '@/lib/utils';
import { PROVIDER_TYPE_LABELS } from '@/lib/types';

interface Location {
  id: string;
  name: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  source: string;
  confidence: number;
  is_primary: boolean;
  organization_id: string;
  organization_name: string;
  is_network: boolean;
  network_brand?: string;
  provider_type: string;
  county?: {
    id: string;
    code: string;
    name: string;
  };
  distance?: number;
}

interface FilterOptions {
  counties: { id: string; code: string; name: string }[];
  cities: string[];
  specialties: { id: string; name: string }[];
  providerTypes: { value: string; label: string }[];
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [geolocating, setGeolocating] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [queryInput, setQueryInput] = useState(searchParams.get('query') || '');

  const query = searchParams.get('query') || '';
  const county = searchParams.get('county') || '';
  const type = searchParams.get('type') || '';
  const specialty = searchParams.get('specialty') || '';
  const network = searchParams.get('network') || '';
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  // Fetch filter options
  useEffect(() => {
    fetch('/api/filters')
      .then(res => res.json())
      .then(data => setFilters(data))
      .catch(err => console.error('Failed to load filters:', err));
  }, []);

  const fetchLocations = useCallback(async (pageNum: number, reset: boolean = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (county) params.set('county', county);
      if (type) params.set('type', type);
      if (specialty) params.set('specialty', specialty);
      if (network === 'true') params.set('network', 'true');
      if (lat && lng) {
        params.set('lat', lat);
        params.set('lng', lng);
        params.set('radius', '15');
      }
      params.set('page', pageNum.toString());
      params.set('limit', '30');

      const response = await fetch(`/api/locations?${params.toString()}`);
      const data = await response.json();

      if (data.locations) {
        if (reset) {
          setLocations(data.locations);
        } else {
          setLocations(prev => [...prev, ...data.locations]);
        }
        setTotal(data.total || 0);
        setHasMore(data.hasMore || false);
        setPage(pageNum);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [query, county, type, specialty, network, lat, lng]);

  useEffect(() => {
    setPage(1);
    setLocations([]);
    fetchLocations(1, true);
  }, [fetchLocations]);

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchLocations(page + 1, false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (queryInput.trim()) {
      params.set('query', queryInput.trim());
    } else {
      params.delete('query');
    }
    router.push(`/search?${params.toString()}`);
    setShowFilters(false);
  };

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/search?${params.toString()}`);
  };

  const clearFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    if (key === 'lat') params.delete('lng');
    router.push(`/search?${params.toString()}`);
  };

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocația nu este disponibilă în browserul tău');
      return;
    }

    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('lat', position.coords.latitude.toString());
        params.set('lng', position.coords.longitude.toString());
        router.push(`/search?${params.toString()}`);
        setGeolocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Nu am putut obține locația. Verifică permisiunile browserului.');
        setGeolocating(false);
      }
    );
  };

  const activeFilters = [
    network === 'true' && { key: 'network', label: 'Rețele' },
    type && { key: 'type', label: PROVIDER_TYPE_LABELS[type as keyof typeof PROVIDER_TYPE_LABELS] || type },
    specialty && { key: 'specialty', label: specialty },
    county && { key: 'county', label: filters?.counties.find(c => c.code === county)?.name || county },
    lat && lng && { key: 'lat', label: 'Lângă mine' },
  ].filter(Boolean) as { key: string; label: string }[];

  // Prepare options for SearchableSelect
  const countyOptions = filters?.counties.map(c => ({ value: c.code, label: c.name })) || [];
  const typeOptions = filters?.providerTypes || [];
  const specialtyOptions = filters?.specialties.map(s => ({ value: s.name, label: s.name })) || [];

  return (
    <div className="min-h-screen">
      <Header title="Caută" showBack backHref="/" />

      {/* Search & Filters - Compact */}
      <div className="sticky top-14 z-40 bg-white/95 backdrop-blur-xl border-b border-primary/10">
        {/* Search Row */}
        <form onSubmit={handleSearch} className="px-3 pt-3 pb-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60" />
              <Input
                type="text"
                placeholder="Clinică, specialitate, adresă..."
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                className="pl-10 h-10 rounded-xl bg-white border-primary/20 focus:border-primary/40 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleGeolocation}
              disabled={geolocating}
              className={cn(
                "h-10 w-10 rounded-xl transition-all flex-shrink-0",
                (lat && lng)
                  ? "bg-primary text-white border-primary hover:bg-primary/90"
                  : "bg-white border-primary/20 hover:border-primary/40"
              )}
              title="Lângă mine"
            >
              {geolocating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Locate className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>

        {/* Horizontal Filter Pills */}
        <div className="px-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          <SearchableSelect
            options={countyOptions}
            value={county}
            onValueChange={(v) => updateFilter('county', v)}
            placeholder="Județ"
            searchPlaceholder="Caută județ..."
            className="flex-shrink-0 w-[120px]"
          />
          <SearchableSelect
            options={typeOptions}
            value={type}
            onValueChange={(v) => updateFilter('type', v)}
            placeholder="Tip"
            searchPlaceholder="Caută tip..."
            className="flex-shrink-0 w-[100px]"
          />
          <SearchableSelect
            options={specialtyOptions}
            value={specialty}
            onValueChange={(v) => updateFilter('specialty', v)}
            placeholder="Specialitate"
            searchPlaceholder="Caută specialitate..."
            className="flex-shrink-0 w-[140px]"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => updateFilter('network', network === 'true' ? '' : 'true')}
            className={cn(
              "h-9 px-3 flex-shrink-0 rounded-lg text-sm font-medium transition-all",
              network === 'true'
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-white border border-accent/30 text-accent hover:bg-accent/10"
            )}
          >
            <Network className="h-3.5 w-3.5 mr-1.5" />
            Rețele
          </Button>
        </div>

        {/* Active Filters - Inline */}
        {activeFilters.length > 0 && (
          <div className="px-3 pb-2 flex gap-1.5 items-center overflow-x-auto no-scrollbar">
            {activeFilters.map((filter) => (
              <Badge
                key={filter.key}
                className="pl-2 pr-1 py-0.5 gap-1 cursor-pointer bg-primary/10 text-primary text-xs border-0 hover:bg-primary/20 transition-all flex-shrink-0"
                onClick={() => clearFilter(filter.key)}
              >
                {filter.label}
                <X className="h-3 w-3" />
              </Badge>
            ))}
            <button
              onClick={() => router.push('/search')}
              className="text-xs text-muted-foreground hover:text-primary flex-shrink-0 ml-1"
            >
              Resetează
            </button>
          </div>
        )}
      </div>

      {/* Results Count - Compact */}
      <div className="px-3 py-2 flex items-center gap-2 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        <p className="text-sm">
          {loading ? (
            <span className="text-primary font-medium">Se caută...</span>
          ) : (
            <>
              <span className="font-bold text-primary">{total.toLocaleString('ro-RO')}</span>
              <span className="text-muted-foreground ml-1">rezultate</span>
            </>
          )}
        </p>
      </div>

      {/* Results */}
      <div className="px-3 py-2 space-y-2 pb-24">
        {loading ? (
          <>
            <LocationCardSkeleton />
            <LocationCardSkeleton />
            <LocationCardSkeleton />
          </>
        ) : locations.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gradient-to-br from-primary/10 to-accent/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
              <Search className="h-10 w-10 text-primary/50" />
            </div>
            <h3 className="font-semibold text-foreground text-lg mb-2">Niciun rezultat</h3>
            <p className="text-muted-foreground mb-6 max-w-xs mx-auto">
              Încearcă să modifici filtrele sau să cauți altceva
            </p>
            <Button onClick={() => router.push('/search')} className="btn-gradient rounded-xl px-6">
              Resetează filtrele
            </Button>
          </div>
        ) : (
          <>
            {locations.map((location) => (
              <LocationCard key={location.id} location={location} />
            ))}

            {hasMore && (
              <div className="pt-6 text-center">
                <Button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full max-w-sm rounded-2xl h-12 bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 text-primary font-semibold hover:from-primary/20 hover:to-accent/20 transition-all"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Se încarcă...
                    </>
                  ) : (
                    'Încarcă mai multe rezultate'
                  )}
                </Button>
              </div>
            )}

            {!hasMore && locations.length > 0 && (
              <div className="text-center py-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/10">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Toate cele <span className="font-semibold text-foreground">{total.toLocaleString('ro-RO')}</span> rezultate afișate
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LocationCard({ location }: { location: Location }) {
  const typeLabel = PROVIDER_TYPE_LABELS[location.provider_type as keyof typeof PROVIDER_TYPE_LABELS] || 'Furnizor';
  const displayName = location.name || location.network_brand || location.organization_name;
  const isNetwork = location.is_network && location.network_brand;

  return (
    <Link href={`/clinic/${location.id}`}>
      <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer active:scale-[0.99] bg-white/90 backdrop-blur-sm border-white/50 hover:border-primary/40 overflow-hidden">
        {/* Top accent bar */}
        <div className={cn(
          "h-1 w-full",
          isNetwork
            ? "bg-gradient-to-r from-accent via-purple-500 to-accent"
            : location.source === 'cnas'
              ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500"
              : "bg-gradient-to-r from-primary via-cyan-500 to-primary"
        )} />
        <CardContent className="p-3">
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div className={cn(
              "p-2 rounded-lg flex-shrink-0",
              isNetwork
                ? "bg-accent/10"
                : "bg-primary/10"
            )}>
              {isNetwork ? (
                <Network className="h-4 w-4 text-accent" />
              ) : (
                <Building2 className="h-4 w-4 text-primary" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {/* Network Badge */}
              {isNetwork && (
                <span className="text-[10px] font-semibold text-accent uppercase tracking-wide">
                  {location.network_brand}
                </span>
              )}

              {/* Name */}
              <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                {displayName}
              </h3>

              {/* Type & Confidence - Inline */}
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {typeLabel}
                </span>
                <span className="text-muted-foreground/30">•</span>
                {location.source === 'cnas' ? (
                  <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    CNAS
                  </span>
                ) : location.confidence >= 80 ? (
                  <span className="text-[10px] text-primary font-medium">Verificat</span>
                ) : (
                  <span className="text-[10px] text-amber-600 font-medium">De verificat</span>
                )}
                {location.distance !== undefined && (
                  <>
                    <span className="text-muted-foreground/30">•</span>
                    <span className="text-[10px] font-semibold text-primary">
                      {formatDistance(location.distance)}
                    </span>
                  </>
                )}
              </div>

              {/* Address */}
              {(location.city || location.county) && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="line-clamp-1">
                    {location.city || location.county?.name}
                  </span>
                </div>
              )}
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 self-center group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function LocationCardSkeleton() {
  return (
    <Card className="bg-white/60 backdrop-blur-sm border-white/50">
      <CardContent className="p-3">
        <div className="flex gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen">
        <Header title="Caută" showBack backHref="/" />
        <div className="p-3 space-y-2">
          <LocationCardSkeleton />
          <LocationCardSkeleton />
          <LocationCardSkeleton />
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
