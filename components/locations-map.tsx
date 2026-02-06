'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Next.js - use CDN URLs
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  is_network?: boolean;
  network_brand?: string;
  provider_type?: string;
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface LocationsMapProps {
  locations: MapLocation[];
  center?: { lat: number; lng: number };
  zoom?: number;
  userLocation?: { lat: number; lng: number } | null;
  radius?: number; // Radius in km for nearby search - affects zoom level
  onLocationClick?: (id: string) => void;
  onBoundsChange?: (bounds: MapBounds, visibleLocationIds: string[]) => void;
  height?: string;
  centerKey?: string; // Change this to force re-center (e.g., when user clicks "near me")
}

// Calculate appropriate zoom level based on radius in km
function getZoomForRadius(radiusKm: number): number {
  // Approximate zoom levels for different radii
  if (radiusKm <= 1) return 16;
  if (radiusKm <= 2) return 15;
  if (radiusKm <= 3) return 14;
  if (radiusKm <= 5) return 13;
  if (radiusKm <= 10) return 12;
  if (radiusKm <= 20) return 11;
  return 10;
}

export default function LocationsMap({
  locations,
  center,
  zoom = 12,
  userLocation,
  radius,
  onLocationClick,
  onBoundsChange,
  height = '400px',
  centerKey,
}: LocationsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const locationsRef = useRef<MapLocation[]>(locations);
  const mountedRef = useRef(true);
  // Restore lastCenterKey from sessionStorage to prevent re-centering on back navigation
  const lastCenterKeyRef = useRef<string | undefined>(
    typeof window !== 'undefined' ? sessionStorage.getItem('map-last-center-key') || undefined : undefined
  );
  const [isReady, setIsReady] = useState(false);

  // Keep locations ref updated
  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  // Function to calculate visible locations
  const reportVisibleLocations = useCallback(() => {
    if (!mapInstanceRef.current || !onBoundsChange || !mountedRef.current) return;

    try {
      const bounds = mapInstanceRef.current.getBounds();

      // Add small padding to bounds to include markers at edges
      const padding = 0.001; // ~100m padding
      const mapBounds: MapBounds = {
        north: bounds.getNorth() + padding,
        south: bounds.getSouth() - padding,
        east: bounds.getEast() + padding,
        west: bounds.getWest() - padding,
      };

      // Find locations within bounds (use current locations from ref)
      const currentLocations = locationsRef.current;
      const visibleIds = currentLocations
        .filter(loc => {
          if (!loc.lat || !loc.lng) return false;
          return (
            loc.lat >= mapBounds.south &&
            loc.lat <= mapBounds.north &&
            loc.lng >= mapBounds.west &&
            loc.lng <= mapBounds.east
          );
        })
        .map(loc => loc.id);

      onBoundsChange(mapBounds, visibleIds);
    } catch (e) {
      console.warn('Could not report bounds:', e);
    }
  }, [onBoundsChange]);

  // Initialize map
  useEffect(() => {
    mountedRef.current = true;

    if (!mapContainerRef.current) return;

    // Clean up any existing map instance first
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        // Ignore cleanup errors
      }
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    }

    // Try to restore saved map position
    let initialCenter = center || { lat: 44.4268, lng: 26.1025 };
    let initialZoom = zoom;

    try {
      const savedState = sessionStorage.getItem('map-view-state');
      if (savedState) {
        const { center: savedCenter, zoom: savedZoom } = JSON.parse(savedState);
        if (savedCenter && savedZoom) {
          initialCenter = savedCenter;
          initialZoom = savedZoom;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: initialZoom,
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        boxZoom: true,
        keyboard: true,
        dragging: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
      markersLayerRef.current = markersLayer;

      // Save map state to sessionStorage when it changes
      const saveMapState = () => {
        if (!mapInstanceRef.current) return;
        try {
          const center = mapInstanceRef.current.getCenter();
          const zoom = mapInstanceRef.current.getZoom();
          sessionStorage.setItem('map-view-state', JSON.stringify({
            center: { lat: center.lat, lng: center.lng },
            zoom: zoom
          }));
        } catch (e) {
          // Ignore errors
        }
      };

      // Listen for map movement/zoom
      map.on('moveend', () => {
        reportVisibleLocations();
        saveMapState();
      });
      map.on('zoomend', () => {
        reportVisibleLocations();
        saveMapState();
      });

      // Wait for map to be ready
      map.whenReady(() => {
        if (!mountedRef.current) return;

        setTimeout(() => {
          if (mountedRef.current && mapInstanceRef.current) {
            try {
              mapInstanceRef.current.invalidateSize();
            } catch (e) {
              // Ignore errors
            }
          }
        }, 100);

        setTimeout(() => {
          if (mountedRef.current) {
            setIsReady(true);
            // Initial bounds report
            reportVisibleLocations();
          }
        }, 200);
      });

      // Handle window resize
      const handleResize = () => {
        if (mapInstanceRef.current && mountedRef.current) {
          try {
            mapInstanceRef.current.invalidateSize();
          } catch (e) {
            // Ignore errors
          }
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        mountedRef.current = false;
        window.removeEventListener('resize', handleResize);
        // Remove all listeners
        map.off('moveend');
        map.off('zoomend');

        if (mapInstanceRef.current) {
          try {
            mapInstanceRef.current.remove();
          } catch (e) {
            // Ignore cleanup errors
          }
          mapInstanceRef.current = null;
          markersLayerRef.current = null;
        }
      };
    } catch (e) {
      console.error('Error initializing map:', e);
    }
  }, []);

  // Update markers when locations change
  useEffect(() => {
    if (!isReady || !mapInstanceRef.current || !markersLayerRef.current || !mountedRef.current) {
      return;
    }

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;

    try {
      // Clear existing markers
      markersLayer.clearLayers();

      // Add user location marker (Google Maps style blue dot)
      if (userLocation) {
        // Pulsing circle for accuracy indicator
        const pulseIcon = L.divIcon({
          className: 'user-location-pulse',
          html: `
            <div style="position: relative; width: 40px; height: 40px;">
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 40px;
                height: 40px;
                background: rgba(66, 133, 244, 0.2);
                border-radius: 50%;
                animation: pulse 2s ease-out infinite;
              "></div>
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 18px;
                height: 18px;
                background: #4285F4;
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              "></div>
            </div>
            <style>
              @keyframes pulse {
                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
              }
            </style>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: pulseIcon, zIndexOffset: 1000 });
        userMarker.bindPopup('<div style="text-align: center; font-weight: 600; color: #4285F4;">📍 Locația ta</div>');
        markersLayer.addLayer(userMarker);
      }

      // Add location markers
      const validLocations = locations.filter(loc => loc.lat && loc.lng);

      validLocations.forEach((loc) => {
        // Use default Leaflet marker
        const marker = L.marker([loc.lat, loc.lng]);

        const popupContent = `
          <div style="min-width: 200px; max-width: 280px; padding: 4px;">
            ${loc.is_network && loc.network_brand ? `<p style="font-size: 12px; color: #7C3AED; font-weight: 600; margin-bottom: 4px;">🏥 ${loc.network_brand}</p>` : ''}
            <h3 style="font-weight: bold; font-size: 14px; color: #111; margin-bottom: 4px;">${loc.name}</h3>
            ${loc.address ? `<p style="font-size: 12px; color: #666; margin-bottom: 6px;">${loc.address}</p>` : ''}
            <p style="font-size: 10px; color: #b45309; margin-bottom: 8px;">Locația este informativă. Verificați adresa.</p>
            <a
              href="/clinic/${loc.id}"
              style="display: block; width: 100%; text-align: center; padding: 8px 12px; background: #0891B2; color: white; font-size: 12px; font-weight: 600; border-radius: 8px; text-decoration: none;"
            >
              Vezi detalii →
            </a>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 300,
        });

        markersLayer.addLayer(marker);
      });

      // Only fit bounds on initial load OR when centerKey changes (e.g., user clicks "near me")
      // This allows users to freely pan/zoom after the initial view is set
      const shouldRecenter = lastCenterKeyRef.current !== centerKey;

      if (shouldRecenter && (validLocations.length > 0 || userLocation)) {
        lastCenterKeyRef.current = centerKey;
        // Save to sessionStorage to prevent re-centering on back navigation
        if (centerKey) {
          sessionStorage.setItem('map-last-center-key', centerKey);
        }

        setTimeout(() => {
          if (!mountedRef.current || !mapInstanceRef.current) return;

          try {
            if (userLocation && radius) {
              // In nearby mode: center on user with zoom based on radius
              const zoomLevel = getZoomForRadius(radius);
              mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], zoomLevel);
            } else if (userLocation) {
              // User location but no radius - center on user with default zoom
              mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 14);
            } else if (validLocations.length > 0) {
              // No user location - fit to all locations
              const bounds = L.latLngBounds(validLocations.map(loc => [loc.lat, loc.lng]));
              mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
            }
          } catch (e) {
            console.warn('Could not fit bounds:', e);
          }
        }, 100);
      }

      // Report visible locations after updating markers
      setTimeout(reportVisibleLocations, 200);
    } catch (e) {
      console.error('Error updating markers:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, userLocation, isReady]);

  // Handle location click events from popups
  useEffect(() => {
    const handleClick = (e: CustomEvent) => {
      if (onLocationClick) {
        onLocationClick(e.detail);
      }
    };

    window.addEventListener('map-location-click', handleClick as EventListener);
    return () => {
      window.removeEventListener('map-location-click', handleClick as EventListener);
    };
  }, [onLocationClick]);

  return (
    <div className="relative rounded-xl border border-border/50" style={{ height, width: '100%' }}>
      <div
        ref={mapContainerRef}
        className="rounded-xl"
        style={{ height: '100%', width: '100%' }}
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 pointer-events-none z-10">
          <p className="text-muted-foreground text-sm">Se încarcă harta...</p>
        </div>
      )}
      {isReady && locations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 pointer-events-none z-10">
          <p className="text-muted-foreground text-sm">Nu sunt locații cu coordonate disponibile</p>
        </div>
      )}
    </div>
  );
}
