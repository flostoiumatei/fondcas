'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface ProviderMapProps {
  lat: number;
  lng: number;
  name: string;
  address?: string;
}

const markerIcon = L.divIcon({
  className: 'custom-marker',
  html: `
    <div style="
      width: 40px;
      height: 40px;
      background: #0891B2;
      border-radius: 50% 50% 50% 0;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transform: rotate(-45deg);
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        width: 14px;
        height: 14px;
        background: white;
        border-radius: 50%;
        transform: translate(-50%, -50%);
      "></div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

export default function ProviderMap({ lat, lng, name, address }: ProviderMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // If map already exists, just update view
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 16);
      return;
    }

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false,
    });

    // Add zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Add marker
    const marker = L.marker([lat, lng], { icon: markerIcon }).addTo(map);

    // Add popup
    const popupContent = `
      <div style="min-width: 180px; padding: 4px;">
        <h3 style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${name}</h3>
        ${address ? `<p style="font-size: 12px; color: #666;">${address}</p>` : ''}
      </div>
    `;
    marker.bindPopup(popupContent).openPopup();

    mapRef.current = map;

    // Force map to recalculate size after render (multiple attempts for reliability)
    const timers = [
      setTimeout(() => map.invalidateSize(), 100),
      setTimeout(() => map.invalidateSize(), 300),
      setTimeout(() => map.invalidateSize(), 500),
    ];

    // Handle window resize
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, name, address]);

  return (
    <div className="relative">
      <div
        ref={mapContainerRef}
        className="rounded-lg"
        style={{ height: '200px', width: '100%', minHeight: '200px' }}
      />
      <style jsx global>{`
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
