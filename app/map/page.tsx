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
  ChevronDown,
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
  const county = searchParams.get('county') || '';
  const type = searchParams.get('type') || '';
  const network = searchParams.get('network') || '';
  const urlLat = searchParams.get('lat');
  const urlLng = searchParams.get('lng');
  const radius = parseFloat(searchParams.get('radius') || '10');

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
      if (county) params.set('county', county);
      if (type) params.set('type', type);
      if (network === 'true') params.set('network', 'true');
      params.set('limit', '500'); // Get more for map view

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
  }, [query, county, type, network, userLocation, radius]);

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
          params.set('radius', '10');
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
              size="icon"
              onClick={handleGeolocation}
              disabled={geolocating}
              className={cn(
                "h-10 w-10 rounded-xl",
                userLocation && "bg-primary hover:bg-primary/90"
              )}
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
          <div className="relative flex-shrink-0">
            <select
              value={county}
              onChange={(e) => updateFilter('county', e.target.value)}
              className={cn(
                "appearance-none h-8 pl-3 pr-8 text-xs rounded-xl border bg-white/60 cursor-pointer transition-colors min-w-[120px]",
                county ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50"
              )}
            >
              <option value="">Toate județele</option>
              {filters?.counties.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          <div className="relative flex-shrink-0">
            <select
              value={type}
              onChange={(e) => updateFilter('type', e.target.value)}
              className={cn(
                "appearance-none h-8 pl-3 pr-8 text-xs rounded-xl border bg-white/60 cursor-pointer transition-colors min-w-[140px]",
                type ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50"
              )}
            >
              <option value="">Toate tipurile</option>
              {filters?.providerTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>

          <Button
            variant={network === 'true' ? 'default' : 'outline'}
            size="sm"
            onClick={() => updateFilter('network', network === 'true' ? '' : 'true')}
            className={cn(
              "h-8 text-xs rounded-xl",
              network === 'true' && "bg-accent hover:bg-accent/90"
            )}
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
                    className="shadow-xl rounded-full px-6 py-2 btn-gradient"
                    size="lg"
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
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowList(false)}
                      className="h-8 px-3 rounded-xl"
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
        "p-3 transition-colors",
        isSelected && "bg-primary/5"
      )}
    >
      <Link href={`/clinic/${location.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {location.is_network && location.network_brand && (
              <Badge className="mb-1 bg-accent/10 text-accent border-accent/20 text-xs">
                <Network className="h-3 w-3 mr-1" />
                {location.network_brand}
              </Badge>
            )}
            <h3 className="font-medium text-sm text-foreground truncate">{location.name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {location.city || location.address || location.county?.name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {location.distance !== undefined && (
              <span className="text-xs font-semibold text-primary">
                {formatDistance(location.distance)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Quick Actions */}
      <div className="flex gap-2 mt-2">
        {location.phone && (
          <a href={`tel:${location.phone.replace(/\D/g, '')}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full h-8 text-xs rounded-xl">
              <Phone className="h-3 w-3 mr-1" />
              Sună
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
          <Button variant="outline" size="sm" className="w-full h-8 text-xs rounded-xl">
            <Navigation className="h-3 w-3 mr-1" />
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
