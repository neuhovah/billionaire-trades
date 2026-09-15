"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon path issues in Next.js
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

export default function AssetMap({ ticker }: { ticker: string }) {
  const [position, setPosition] = useState<[number, number]>([39.8283, -98.5795]); 
  const [zoom, setZoom] = useState(4);

  // MVP Spatial Mock: Maps ticker symbols to primary corporate facility coordinates
  useEffect(() => {
    const locations: Record<string, [number, number]> = {
      'AAPL': [37.3346, -122.0090], // Apple Park, Cupertino
      'BAC': [35.2271, -80.8431],   // Bank of America Corporate Center, Charlotte
      'KO': [33.7710, -84.3963],    // Coca-Cola Headquarters, Atlanta
      'AXP': [40.7130, -74.0146],   // American Express Tower, NYC
      'GOOGL': [37.4221, -122.0841] // Googleplex, Mountain View
    };
    
    if (locations[ticker]) {
      setPosition(locations[ticker]);
      setZoom(13);
    }
  }, [ticker]);

  return (
    <div className="h-64 w-full rounded-lg overflow-hidden border border-gray-800 relative z-0">
      <MapContainer center={position} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        {/* CARTO Dark Matter Basemap with dedicated BillionairesTrade project API key */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_25zt_2_57452e5f8a955dc884556706"
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &mdash; &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={position} icon={icon}>
          <Popup className="text-gray-900 font-bold">
            ${ticker} Primary Asset Facility
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}