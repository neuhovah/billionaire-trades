"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// React-Leaflet helper component to dynamically update map center on ticker change
function ChangeMapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function AssetMap({ ticker }: { ticker: string }) {
  // Default to US continental view if no asset coordinate match
  const [position, setPosition] = useState<[number, number]>([39.8283, -98.5795]); 
  const [zoom, setZoom] = useState(4);
  const [assetData, setAssetData] = useState<any>(null);
  const [markerIcon, setMarkerIcon] = useState<L.Icon | null>(null);

  // Initialize Leaflet custom marker icon safely on client mount (SSR protection)
  useEffect(() => {
    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    });
    setMarkerIcon(icon);
  }, []);

  useEffect(() => {
    async function fetchSpatialMetadata() {
      try {
        const { data, error } = await supabase
          .from('corporate_assets')
          .select('company_name, headquarters_location, latitude, longitude')
          .eq('ticker', ticker)
          .single();

        if (!error && data) {
          setAssetData(data);
          if (data.latitude && data.longitude) {
            setPosition([data.latitude, data.longitude]);
            setZoom(12);
            return;
          }
        }
      } catch (err) {
        console.error("Spatial fetch error:", err);
      }
    }

    // Enterprise City-Level HQ Coordinates Dictionary (EPSG:4326)
    const fallbackLocations: Record<string, { coords: [number, number]; location: string; name: string }> = {
      // US Equities
      'BAC': { coords: [35.2271, -80.8431], location: 'Charlotte, NC', name: 'Bank of America Corp' },
      'KO': { coords: [33.7710, -84.3963], location: 'Atlanta, GA', name: 'The Coca-Cola Company' },
      'KHC': { coords: [41.8843, -87.6200], location: 'Chicago, IL', name: 'The Kraft Heinz Company' },
      'DHI': { coords: [32.7357, -97.1081], location: 'Arlington, TX', name: 'D.R. Horton, Inc.' },
      'CVI': { coords: [29.6197, -95.6349], location: 'Sugar Land, TX', name: 'CVR Energy, Inc.' },
      'PFE': { coords: [40.7512, -73.9740], location: 'New York, NY', name: 'Pfizer Inc.' },
      'PLTR': { coords: [39.7392, -104.9903], location: 'Denver, CO', name: 'Palantir Technologies' },
      'NVDA': { coords: [37.3541, -121.9552], location: 'Santa Clara, CA', name: 'NVIDIA Corporation' },
      'AAPL': { coords: [37.3346, -122.0090], location: 'Cupertino, CA', name: 'Apple Inc.' },
      'AXP': { coords: [40.7130, -74.0146], location: 'New York, NY', name: 'American Express' },
      'GOOGL': { coords: [37.4221, -122.0841], location: 'Mountain View, CA', name: 'Alphabet Inc.' },
      'GOOG': { coords: [37.4221, -122.0841], location: 'Mountain View, CA', name: 'Alphabet Inc.' },
      'DAL': { coords: [33.6407, -84.4277], location: 'Atlanta, GA', name: 'Delta Air Lines' },
      'M': { coords: [40.7508, -73.9882], location: 'New York, NY', name: "Macy's, Inc." },
      'NUE': { coords: [35.2271, -80.8431], location: 'Charlotte, NC', name: 'Nucor Corporation' },
      'HAL': { coords: [29.7604, -95.3698], location: 'Houston, TX', name: 'Halliburton Co.' },
      'OXY': { coords: [29.7604, -95.3698], location: 'Houston, TX', name: 'Occidental Petroleum' },
      'AMZN': { coords: [47.6225, -122.3362], location: 'Seattle, WA', name: 'Amazon.com, Inc.' },
      'MSFT': { coords: [47.6423, -122.1371], location: 'Redmond, WA', name: 'Microsoft Corporation' },
      'TSLA': { coords: [30.2223, -97.6171], location: 'Austin, TX', name: 'Tesla, Inc.' },
      'BRK.A': { coords: [41.2565, -95.9345], location: 'Omaha, NE', name: 'Berkshire Hathaway' },
      'BRK.B': { coords: [41.2565, -95.9345], location: 'Omaha, NE', name: 'Berkshire Hathaway' },

      // African / Regional Equities
      'DANGCEM.LG': { coords: [7.9214, 7.8821], location: 'Obajana, Kogi State', name: 'Dangote Cement Plc' },
      'TRANSCORP.LG': { coords: [6.4531, 3.3958], location: 'Lagos, Nigeria', name: 'Transnational Corporation' },
      'UBA.LG': { coords: [6.4281, 3.4219], location: 'Lagos, Nigeria', name: 'United Bank for Africa' },
      'GEREGU.LG': { coords: [6.5244, 3.3792], location: 'Lagos, Nigeria', name: 'Geregu Power Plc' },
      'FBNH.LG': { coords: [6.4474, 3.4223], location: 'Lagos, Nigeria', name: 'First Bank HQ — Lagos' }
    };

    if (fallbackLocations[ticker]) {
      const match = fallbackLocations[ticker];
      setPosition(match.coords);
      setZoom(ticker.includes('.LG') ? 12 : 11);
      setAssetData((prev: any) => prev || { company_name: match.name, headquarters_location: match.location });
    } else {
      setPosition([39.8283, -98.5795]);
      setZoom(4);
    }

    fetchSpatialMetadata();
  }, [ticker]);

  return (
    <div className="flex flex-col h-72 w-full rounded-xl overflow-hidden border border-gray-800 shadow-2xl relative z-0 bg-gray-950">
      
      {/* Map Canvas */}
      <div className="flex-1 w-full relative z-0">
        <MapContainer center={position} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          {/* Re-center view on position/zoom change */}
          <ChangeMapView center={position} zoom={zoom} />

          {/* Standard OpenStreetMap Tiles — 100% Free, Keyless & Watermark-Free */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {markerIcon && (
            <Marker position={position} icon={markerIcon}>
              <Popup className="text-gray-900 font-sans font-bold">
                <div className="p-1">
                  <span className="text-blue-600 font-bold">${ticker}</span><br />
                  <span className="text-xs font-semibold text-gray-800">{assetData?.company_name || 'Corporate Entity'}</span><br />
                  <span className="text-[10px] text-gray-500 font-normal">{assetData?.headquarters_location || 'Approximate Location'}</span>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Corporate Location Indicator Bar */}
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