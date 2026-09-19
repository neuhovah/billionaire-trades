"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';

// Fix Leaflet's default icon path issues in Next.js SSR
const customIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AssetMap({ ticker }: { ticker: string }) {
  // Default to a broad US view if no specific coordinate is found
  const [position, setPosition] = useState<[number, number]>([39.8283, -98.5795]); 
  const [zoom, setZoom] = useState(4);
  const [assetData, setAssetData] = useState<any>(null);

  useEffect(() => {
    async function fetchSpatialMetadata() {
      try {
        const { data, error } = await supabase
          .from('corporate_assets')
          .select('company_name, headquarters_location')
          .eq('ticker', ticker)
          .single();

        if (!error && data) {
          setAssetData(data);
        }
      } catch (err) {
        console.error("Spatial fetch error:", err);
      }
    }

    // City-Level Fallback Coordinate Dictionary
    const fallbackLocations: Record<string, [number, number]> = {
      'DANGCEM.LG': [7.9214, 7.8821],     // Obajana, Kogi State
      'TRANSCORP.LG': [6.4531, 3.3958],   // Lagos, Nigeria
      'UBA.LG': [6.4281, 3.4219],         // Lagos, Nigeria
      'GEREGU.LG': [6.5244, 3.3792],      // Lagos, Nigeria
      'FBNH.LG': [6.4474, 3.4223],        // Lagos, Nigeria
      'AAPL': [37.3346, -122.0090],       // Cupertino, CA
      'BAC': [35.2271, -80.8431],         // Charlotte, NC
      'KO': [33.7710, -84.3963],          // Atlanta, GA
      'AXP': [40.7130, -74.0146],         // New York, NY
      'GOOGL': [37.4221, -122.0841]       // Mountain View, CA
    };

    if (fallbackLocations[ticker]) {
      setPosition(fallbackLocations[ticker]);
      // Standardized to a city-level overview zoom, explicitly avoiding surveyed parcel zooms
      setZoom(ticker.includes('.LG') ? 12 : 11); 
    }

    fetchSpatialMetadata();
  }, [ticker]);

  return (
    <div className="flex flex-col h-72 w-full rounded-xl overflow-hidden border border-gray-800 shadow-2xl relative z-0 bg-gray-950">
      
      {/* Map Canvas */}
      <div className="flex-1 w-full relative z-0">
        <MapContainer center={position} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <LayersControl position="topright">
            
            {/* CARTO Dark Matter Basemap */}
            <LayersControl.BaseLayer checked name="Dark Matter (Terminal)">
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a> &mdash; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              />
            </LayersControl.BaseLayer>
            
            {/* Esri High-Resolution Satellite Basemap */}
            <LayersControl.BaseLayer name="Satellite (City Overview)">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='Tiles &copy; Esri'
              />
            </LayersControl.BaseLayer>

          </LayersControl>

          <Marker position={position} icon={customIcon}>
            <Popup className="text-gray-900 font-sans font-bold">
              <div className="p-1">
                <span className="text-blue-600">${ticker}</span><br />
                <span className="text-xs font-semibold text-gray-800">{assetData?.company_name || 'Corporate Entity'}</span><br />
                <span className="text-[10px] text-gray-500 font-normal">{assetData?.headquarters_location || 'Approximate Location'}</span>
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Honest Location Indicator Bar */}
      <div className="flex justify-between items-center text-[10px] font-mono text-gray-400 bg-gray-950 px-3.5 py-2 border-t border-gray-800 shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          City-Level Pin
        </span>
        <span className="text-gray-500 font-semibold">
          {assetData?.headquarters_location || 'Approximate Coordinates'}
        </span>
      </div>

    </div>
  );
}