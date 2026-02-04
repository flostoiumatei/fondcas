'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Loader2 } from 'lucide-react';
import { Provider, FundAvailabilityStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface MapViewProps {
  providers: Provider[];
  fundStatuses: Record<string, FundAvailabilityStatus>;
  userLocation?: { lat: number; lng: number };
  onProviderClick?: (providerId: string) => void;
}

// Fix for default marker icons in Leaflet with Next.js
const defaultIcon = L.divIcon({
  className: 'custom-marker',
  html: `<div class="w-8 h-8 bg-primary rounded-full border-2 border-white shadow-lg flex items-center justify-center">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const userIcon = L.divIcon({
  className: 'user-marker',
  html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const getMarkerIcon = (status?: FundAvailabilityStatus) => {
  const color = !status
    ? '#2563eb' // blue - default
    : status.status === 'likely_available'
    ? '#22c55e' // green
    : status.status === 'uncertain'
    ? '#eab308' // yellow
    : '#ef4444'; // red

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}" class="w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

export default function MapView({
  providers,
  fundStatuses,
  userLocation,
  onProviderClick,
}: MapViewProps) {
  const router = useRouter();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [isLocating, setIsLocating] = useState(false);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocalizarea nu este suportată de browserul tău.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams(window.location.search);
        params.set('lat', position.coords.latitude.toString());
        params.set('lng', position.coords.longitude.toString());
        params.set('radius', '10');
        params.set('view', 'map');
        router.push(`/search?${params.toString()}`);
        setIsLocating(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Nu am putut obține locația. Verifică setările browserului.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Default center (Bucharest)
    const defaultCenter: [number, number] = [44.4268, 26.1025];
    const defaultZoom = 12;

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      center: userLocation
        ? [userLocation.lat, userLocation.lng]
        : defaultCenter,
      zoom: defaultZoom,
      zoomControl: false,
    });

    // Add zoom control to bottom right (better for mobile)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when providers change
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    // Add user location marker
    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('Locația ta');
    }

    // Add provider markers
    const bounds: L.LatLngBounds | null = providers.length > 0 ? L.latLngBounds([]) : null;

    providers.forEach((provider) => {
      if (!provider.lat || !provider.lng) return;

      const status = fundStatuses[provider.id];
      const marker = L.marker([provider.lat, provider.lng], {
        icon: getMarkerIcon(status),
      }).addTo(map);

      // Create popup content
      const statusText = !status
        ? ''
        : status.status === 'likely_available'
        ? '<span class="text-green-600">● Probabil disponibile</span>'
        : status.status === 'uncertain'
        ? '<span class="text-yellow-600">● Verifică telefonic</span>'
        : '<span class="text-red-600">● Probabil epuizate</span>';

      // Use brand name if available, show legal name smaller
      const displayName = provider.brand_name && provider.brand_name !== provider.name
        ? provider.brand_name
        : provider.name;
      const showLegalName = provider.brand_name && provider.brand_name !== provider.name;
      const verifiedBadge = provider.verification_confidence && provider.verification_confidence >= 70
        ? '<span class="inline-flex items-center text-green-600 text-xs ml-1">✓</span>'
        : '';

      const popupContent = `
        <div class="min-w-[200px]">
          <h3 class="font-semibold text-sm mb-1">${displayName}${verifiedBadge}</h3>
          ${showLegalName ? `<p class="text-xs text-gray-500 mb-1">${provider.name}</p>` : ''}
          ${provider.address ? `<p class="text-xs text-gray-600 mb-1">${provider.address}</p>` : ''}
          ${statusText ? `<p class="text-xs mb-2">${statusText}</p>` : ''}
          <a href="/provider/${provider.id}" class="text-xs text-blue-600 hover:underline">
            Vezi detalii →
          </a>
        </div>
      `;

      marker.bindPopup(popupContent);

      if (bounds) {
        bounds.extend([provider.lat, provider.lng]);
      }

      marker.on('click', () => {
        if (onProviderClick) {
          onProviderClick(provider.id);
        }
      });
    });

    // Fit bounds if we have providers
    if (bounds && bounds.isValid()) {
      // Add user location to bounds if available
      if (userLocation) {
        bounds.extend([userLocation.lat, userLocation.lng]);
      }
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 13);
    }
  }, [providers, fundStatuses, userLocation, onProviderClick]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Locate Me Button */}
      <Button
        onClick={handleLocateMe}
        disabled={isLocating}
        className="absolute top-4 left-4 z-[1000] shadow-lg"
        size="sm"
        variant="secondary"
      >
        {isLocating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Crosshair className="h-4 w-4 mr-2" />
        )}
        {isLocating ? 'Se caută...' : 'Caută lângă mine'}
      </Button>

      <style jsx global>{`
        .custom-marker,
        .user-marker {
          background: transparent;
          border: none;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px;
        }
        .leaflet-popup-content {
          margin: 12px;
        }
      `}</style>
    </div>
  );
}
