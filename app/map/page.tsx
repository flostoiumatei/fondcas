'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Search,
  Locate,
  List,
  MapIcon,
  X,
  Navigation,
  Phone,
  Network,
  Loader2,
  Eye
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { cn, formatPhone, getDirectionsUrl, getGoogleMapsSearchUrl, calculateDistance, formatDistance } from '@/lib/utils';

const LocationsMap = dynamic(() => import('@/components/locations-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[50vh] w-full bg-muted/50 animate-pulse flex items-center justify-center rounded-xl">
      <Loader2 className="h-8 w-8 text-primary animate-spin" />
    </div>
  ),
});

interface Location {
  id: string;
  name: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  is_network: boolean;
  network_brand?: string;
  provider_type: string;
  county?: {
    code: string;
    name: string;
  };
  distance?: number;
}

interface FilterOptions {
  counties: { id: string; code: string; name: string }[];
  providerTypes: { value: string; label: string }[];
  specialties: { id: string; name: string }[];
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

function MapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geolocating, setGeolocating] = useState(false);
  const [showList, setShowList] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [visibleLocationIds, setVisibleLocationIds] = useState<Set<string>>(new Set());

  const [queryInput, setQueryInput] = useState(searchParams.get('query') || '');
  const query = searchParams.get('query') || '';
  // Support multiple values (comma-separated in URL) - memoized to prevent infinite loops
  const countiesParam = searchParams.get('counties') || '';
  const typesParam = searchParams.get('types') || '';
  const specialtiesParam = searchParams.get('specialties') || '';
  const counties = useMemo(() => countiesParam.split(',').filter(Boolean), [countiesParam]);
  const types = useMemo(() => typesParam.split(',').filter(Boolean), [typesParam]);
  const specialtiesList = useMemo(() => specialtiesParam.split(',').filter(Boolean), [specialtiesParam]);
  const network = searchParams.get('network') || '';
  const urlLat = searchParams.get('lat');
  const urlLng = searchParams.get('lng');
  const radius = parseFloat(searchParams.get('radius') || '3');

  // Set user location from URL params on mount
  useEffect(() => {
    if (urlLat && urlLng) {
      setUserLocation({
        lat: parseFloat(urlLat),
        lng: parseFloat(urlLng),
      });
    }
  }, [urlLat, urlLng]);

  // Fetch filter options
  useEffect(() => {
    fetch('/api/filters')
      .then(res => res.json())
      .then(data => setFilters(data))
      .catch(err => console.error('Failed to load filters:', err));
  }, []);

  // Fetch locations
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      // Send first value for backward compatibility with API
      if (counties.length > 0) params.set('county', counties[0]);
      if (types.length > 0) params.set('type', types[0]);
      if (specialtiesList.length > 0) params.set('specialty', specialtiesList[0]);
      if (network === 'true') params.set('network', 'true');
      params.set('limit', '2000'); // Get more for map view

      const response = await fetch(`/api/locations?${params.toString()}`);
      const data = await response.json();

      let locs = data.locations || [];

      // Calculate distances if user location is available
      if (userLocation) {
        locs = locs.map((loc: Location) => ({
          ...loc,
          distance: loc.lat && loc.lng
            ? calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng)
            : undefined,
        }));

        // Filter by radius (only keep locations within radius km)
        locs = locs.filter((loc: Location) => {
          if (loc.distance === undefined) return false;
          return loc.distance <= radius;
        });

        // Sort by distance
        locs.sort((a: Location, b: Location) => {
          if (a.distance === undefined) return 1;
          if (b.distance === undefined) return -1;
          return a.distance - b.distance;
        });
      }

      setAllLocations(locs);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  }, [query, counties, types, specialtiesList, network, userLocation, radius]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (queryInput.trim()) {
      params.set('query', queryInput.trim());
    } else {
      params.delete('query');
    }
    router.push(`/map?${params.toString()}`);
  };

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/map?${params.toString()}`);
  };

  const updateMultiFilter = (key: string, values: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (values.length > 0) {
      params.set(key, values.join(','));
    } else {
      params.delete(key);
    }
    router.push(`/map?${params.toString()}`);
  };

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocația nu este disponibilă în browserul tău');
      return;
    }

    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(newLocation);
        // Update URL with location
        const params = new URLSearchParams(searchParams.toString());
        params.set('lat', newLocation.lat.toString());
        params.set('lng', newLocation.lng.toString());
        if (!params.get('radius')) {
          params.set('radius', '3');
        }
        router.push(`/map?${params.toString()}`);
        setGeolocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Nu am putut obține locația. Verifică permisiunile browserului.');
        setGeolocating(false);
      }
    );
  };

  const handleLocationClick = (id: string) => {
    setSelectedLocation(id);
    setShowList(true);
    setTimeout(() => {
      document.getElementById(`loc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleBoundsChange = useCallback((bounds: MapBounds, visibleIds: string[]) => {
    setVisibleLocationIds(new Set(visibleIds));
  }, []);

  // Locations with coordinates (for map)
  const locationsWithCoords = useMemo(() =>
    allLocations.filter(loc => loc.lat && loc.lng),
    [allLocations]
  );

  // Memoized locations for the map component to prevent unnecessary re-renders
  const mapLocations = useMemo(() =>
    locationsWithCoords.map(loc => ({
      id: loc.id,
      name: loc.name,
      lat: loc.lat!,
      lng: loc.lng!,
      address: loc.address,
      city: loc.city,
      is_network: loc.is_network,
      network_brand: loc.network_brand,
      provider_type: loc.provider_type,
    })),
    [locationsWithCoords]
  );

  // Visible locations (filtered by map bounds)
  const visibleLocations = useMemo(() => {
    if (visibleLocationIds.size === 0) {
      return locationsWithCoords;
    }
    return locationsWithCoords.filter(loc => visibleLocationIds.has(loc.id));
  }, [locationsWithCoords, visibleLocationIds]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Hartă" showBack backHref="/" />

      {/* Search & Filters */}
      <div className="bg-white/80 backdrop-blur-lg border-b border-border/50 shadow-sm">
        <form onSubmit={handleSearch} className="p-3 pb-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Caută clinici..."
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                className="pl-10 h-10 rounded-xl bg-white/60 border-white/50"
              />
            </div>
            <Button
              type="button"
              variant={userLocation ? 'default' : 'outline'}
              size="iconSm"
              onClick={handleGeolocation}
              disabled={geolocating}
              title="Găsește-mă"
            >
              {geolocating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Locate className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>

        {/* Quick Filters */}
        <div className="px-3 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          <MultiSelect
            options={filters?.counties.map(c => ({ value: c.code, label: c.name })) || []}
            values={counties}
            onValuesChange={(v) => updateMultiFilter('counties', v)}
            placeholder="Județ"
            searchPlaceholder="Caută județ..."
            className="flex-shrink-0"
            maxDisplay={1}
          />

          <MultiSelect
            options={filters?.providerTypes.map(t => ({ value: t.value, label: t.label })) || []}
            values={types}
            onValuesChange={(v) => updateMultiFilter('types', v)}
            placeholder="Tip"
            searchPlaceholder="Caută tip..."
            className="flex-shrink-0"
            maxDisplay={1}
          />

          <MultiSelect
            options={filters?.specialties.map(s => ({ value: s.name, label: s.name })) || []}
            values={specialtiesList}
            onValuesChange={(v) => updateMultiFilter('specialties', v)}
            placeholder="Specialitate"
            searchPlaceholder="Caută specialitate..."
            className="flex-shrink-0"
            maxDisplay={1}
          />

          <Button
            variant={network === 'true' ? 'accent' : 'filter'}
            size="sm"
            onClick={() => updateFilter('network', network === 'true' ? '' : 'true')}
            className="flex-shrink-0"
          >
            <Network className="h-3 w-3 mr-1" />
            Rețele
          </Button>

          {/* Nearby mode with radius selector */}
          {userLocation && (
            <div className="flex items-center gap-1 h-8 px-3 text-xs rounded-xl border border-emerald-400/50 bg-emerald-50 text-emerald-700">
              <Locate className="h-3 w-3" />
              <select
                value={radius}
                onChange={(e) => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set('radius', e.target.value);
                  router.push(`/map?${params.toString()}`);
                }}
                className="appearance-none bg-transparent font-medium cursor-pointer pr-1 focus:outline-none"
              >
                <option value="1">1 km</option>
                <option value="2">2 km</option>
                <option value="5">5 km</option>
                <option value="10">10 km</option>
                <option value="20">20 km</option>
              </select>
              <button
                onClick={() => {
                  setUserLocation(null);
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete('lat');
                  params.delete('lng');
                  params.delete('radius');
                  router.push(`/map?${params.toString()}`);
                }}
                className="ml-1 hover:text-emerald-900"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Map & List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : (
          <>
            {/* Map Container */}
            <div
              className="relative transition-all flex-shrink-0"
              style={{ height: showList ? '200px' : 'calc(100vh - 200px)' }}
            >
              <LocationsMap
                locations={mapLocations}
                userLocation={userLocation}
                onLocationClick={handleLocationClick}
                onBoundsChange={handleBoundsChange}
                height="100%"
                centerKey={userLocation ? `${userLocation.lat}-${userLocation.lng}-${radius}` : 'default'}
              />

              {/* Floating counter - always visible on map */}
              <div className="absolute top-4 left-4 z-[400] pointer-events-none">
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg px-4 py-2 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm font-semibold text-primary">{visibleLocations.length}</span>
                    <span className="text-sm text-muted-foreground">/ {locationsWithCoords.length} clinici vizibile</span>
                  </div>
                </div>
              </div>

              {/* Toggle List Button - on map */}
              {!showList && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
                  <Button
                    onClick={() => setShowList(true)}
                    size="lg"
                    className="rounded-full px-8"
                  >
                    <List className="h-5 w-5 mr-2" />
                    Vezi lista ({visibleLocations.length})
                  </Button>
                </div>
              )}
            </div>

            {/* List Panel */}
            {showList && (
              <div className="flex-1 bg-white/90 backdrop-blur-lg border-t border-border/50 shadow-lg flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border/50 bg-muted/30 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      <p className="text-sm text-foreground">
                        <span className="font-semibold text-primary">{visibleLocations.length}</span>
                        <span className="text-muted-foreground"> vizibile din </span>
                        <span className="font-medium">{locationsWithCoords.length}</span>
                        {userLocation && (
                          <span className="text-muted-foreground"> în {radius} km</span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => setShowList(false)}
                    >
                      <MapIcon className="h-4 w-4 mr-1" />
                      Hartă
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-border/50 scrollbar-futuristic">
                  {visibleLocations.length === 0 ? (
                    <div className="p-8 text-center">
                      <MapIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                      <p className="text-muted-foreground">Nu sunt clinici vizibile în această zonă</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">Zoom out sau mută harta pentru a vedea mai multe</p>
                    </div>
                  ) : (
                    visibleLocations.map((loc) => (
                      <LocationListItem
                        key={loc.id}
                        location={loc}
                        isSelected={selectedLocation === loc.id}
                        userLocation={userLocation}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LocationListItem({
  location,
  isSelected,
  userLocation,
}: {
  location: Location;
  isSelected: boolean;
  userLocation: { lat: number; lng: number } | null;
}) {
  const hasCoords = location.lat && location.lng;

  return (
    <div
      id={`loc-${location.id}`}
      className={cn(
        "p-4 transition-all hover:bg-primary/5",
        isSelected && "bg-primary/10 border-l-4 border-l-primary"
      )}
    >
      <Link href={`/clinic/${location.id}`} className="block touch-target">
        <div className="flex items-start gap-3">
          {/* Distance badge - prominent for elderly users */}
          {location.distance !== undefined && (
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary/10 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-primary">
                {location.distance < 1 ? Math.round(location.distance * 1000) : location.distance.toFixed(1)}
              </span>
              <span className="text-xs text-primary/70">
                {location.distance < 1 ? 'm' : 'km'}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Network badge */}
            {location.is_network && location.network_brand && (
              <Badge className="mb-2 bg-accent/10 text-accent border-accent/20 text-sm px-3 py-1">
                <Network className="h-3.5 w-3.5 mr-1.5" />
                {location.network_brand}
              </Badge>
            )}

            {/* Name - larger for readability */}
            <h3 className="font-semibold text-base text-foreground leading-tight mb-1">
              {location.name}
            </h3>

            {/* Address - clear and readable */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {location.address || location.city || location.county?.name}
            </p>

            {/* County if different from address */}
            {location.county?.name && location.address && !location.address.includes(location.county.name) && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {location.county.name}
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Quick Actions - large touch targets for elderly */}
      <div className="flex gap-3 mt-4">
        {location.phone && (
          <a href={`tel:${location.phone.replace(/\D/g, '')}`} className="flex-1">
            <Button
              variant="outline"
              className="w-full h-12 text-sm rounded-xl border-2 border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500/50 font-medium"
            >
              <Phone className="h-5 w-5 mr-2" />
              Sună acum
            </Button>
          </a>
        )}
        <a
          href={hasCoords
            ? getDirectionsUrl(location.lat!, location.lng!, location.name, location.address)
            : getGoogleMapsSearchUrl(location.name, location.address, location.city)
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1"
        >
          <Button
            variant="outline"
            className="w-full h-12 text-sm rounded-xl border-2 border-blue-500/30 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-500/50 font-medium"
          >
            <Navigation className="h-5 w-5 mr-2" />
            Direcții
          </Button>
        </a>
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    }>
      <MapContent />
    </Suspense>
  );
}
