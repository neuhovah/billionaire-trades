"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

// Dynamically import the map to prevent Server-Side Rendering (SSR) window errors
const AssetMap = dynamic(() => import('../components/AssetMap'), { 
  ssr: false,
  loading: () => (
    <div className="h-64 w-full bg-gray-900 animate-pulse rounded-lg border border-gray-800 flex items-center justify-center text-gray-500 text-xs font-mono">
      Initializing Spatial Engine...
    </div>
  )
});

// Relational TypeScript interfaces
interface Investor {
  name: string;
  region: string;
  market?: string;
  investment_style: string;
}

interface Metric {
  volatility_90d: number | null;
}

interface Filing {
  id: string;
  filing_accession: string;
  ticker: string;
  shares_held: number;
  report_date: string;
  investors?: Investor;
  metrics?: Metric[];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Dashboard() {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFiling, setSelectedFiling] = useState<Filing | null>(null);

  useEffect(() => {
    async function fetchFilings() {
      try {
        // Relational query joining filings with investors and volatility metrics
        const { data, error } = await supabase
          .from('filings')
          .select('*, investors(name, region, market, investment_style), metrics(volatility_90d)')
          .order('shares_held', { ascending: false });

        if (error) {
          console.error("Supabase Query Error:", error.message);
        } else if (data) {
          setFilings(data as Filing[]);
        }
      } catch (err) {
        console.error("Unexpected error fetching filings:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchFilings();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-10 border-b border-gray-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight">BillionaireTrades</h1>
            <p className="text-gray-400 mt-2 text-lg">Institutional Alpha, SEC Disclosures & Multi-Region Tracking</p>
          </div>
          <div className="text-right font-mono text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-3 py-1.5 rounded-lg">
            ● Live Data Engine Active
          </div>
        </div>

        {/* Data Terminal Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-200">Recent Whale Activity (13F-HR & Multi-Region Filings)</h2>
            <span className="text-xs font-mono text-gray-500">{filings.length} Positions Tracked</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="bg-gray-800/50 text-xs uppercase text-gray-400 font-semibold">
                <tr>
                  <th className="px-6 py-4">Manager / Portfolio</th>
                  <th className="px-6 py-4">Ticker</th>
                  <th className="px-6 py-4">Shares Acquired</th>
                  <th className="px-6 py-4">Report Date</th>
                  <th className="px-6 py-4">Accession No.</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading quantitative multi-investor data...</td>
                  </tr>
                ) : filings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No filings found in database.</td>
                  </tr>
                ) : (
                  filings.map((filing) => (
                    <tr key={filing.id} className="border-b border-gray-800 hover:bg-gray-800/25 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{filing.investors?.name || 'Institutional Titan'}</div>
                        <div className="text-xs text-gray-500">{filing.investors?.investment_style || 'Global Value'}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-400">${filing.ticker}</td>
                      <td className="px-6 py-4 text-emerald-400 font-medium font-mono">
                        {filing.shares_held ? filing.shares_held.toLocaleString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{filing.report_date}</td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-500">{filing.filing_accession}</td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => setSelectedFiling(filing)}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition-colors shadow-lg active:scale-95"
                        >
                          Analyze Setup
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quantitative Analysis Modal */}
        {selectedFiling && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative my-8">
              
              {/* Modal Header */}
              <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-white">${selectedFiling.ticker} Quantitative Breakdown</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Portfolio: <span className="text-blue-400 font-semibold">{selectedFiling.investors?.name || 'Institutional Titan'}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedFiling(null)}
                  className="text-gray-400 hover:text-white font-bold text-xl transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 text-sm text-gray-300">
                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 flex justify-between items-center">
                  <span className="text-gray-400">Institutional Position:</span>
                  <span className="font-mono text-emerald-400 font-bold text-base">
                    {selectedFiling.shares_held ? selectedFiling.shares_held.toLocaleString() : 'N/A'} Shares
                  </span>
                </div>

                {/* Real Volatility Display */}
                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 flex justify-between items-center">
                  <span className="text-gray-400">90-Day Volatility (σ):</span>
                  <span className="font-mono text-blue-400 font-bold text-base">
                    {selectedFiling.metrics?.[0]?.volatility_90d 
                      ? `${selectedFiling.metrics[0].volatility_90d}%` 
                      : 'Calculating...'}
                  </span>
                </div>

                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 flex justify-between items-center">
                  <span className="text-gray-400">Volatility Profile:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    (selectedFiling.metrics?.[0]?.volatility_90d || 0) > 30 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {(selectedFiling.metrics?.[0]?.volatility_90d || 0) > 30 
                      ? 'High Volatility / Expansion Alert' 
                      : 'Moderate Volatility / Consolidation'}
                  </span>
                </div>

                {/* Interactive Leaflet Spatial Mapping */}
                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
                  <span className="text-gray-400 block mb-3 font-semibold">Geospatial Asset Tracking:</span>
                  <AssetMap ticker={selectedFiling.ticker} />
                </div>

                {/* Verified Broker Execution Panel */}
                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-400 font-semibold">Verified Execution Brokers:</span>
                    <span className="text-[10px] uppercase font-mono bg-blue-900/40 text-blue-400 border border-blue-800/40 px-2 py-0.5 rounded">
                      Direct Market Access
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* International Brokers */}
                    <a 
                      href="https://www.interactivebrokers.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-blue-500/50 p-3 rounded-lg flex flex-col transition-all group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-blue-400 transition-colors">Interactive Brokers</span>
                        <span className="text-[10px] text-gray-500 font-mono">GLOBAL</span>
                      </div>
                      <span className="text-gray-400 text-[11px] mt-1">US & Global Equities / Fractional Shares</span>
                    </a>

                    <a 
                      href="https://www.xtb.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-emerald-500/50 p-3 rounded-lg flex flex-col transition-all group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-emerald-400 transition-colors">XTB Global</span>
                        <span className="text-[10px] text-gray-500 font-mono">GLOBAL</span>
                      </div>
                      <span className="text-gray-400 text-[11px] mt-1">Low-Commission Equity Execution</span>
                    </a>

                    {/* Regional / Local Brokers */}
                    <a 
                      href="https://www.stanbicibtcstockbrokers.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-purple-500/50 p-3 rounded-lg flex flex-col transition-all group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-purple-400 transition-colors">Stanbic IBTC Securities</span>
                        <span className="text-[10px] text-gray-500 font-mono">REGIONAL</span>
                      </div>
                      <span className="text-gray-400 text-[11px] mt-1">NGX & African Market Execution</span>
                    </a>

                    <a 
                      href="https://www.cardinalstone.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-amber-500/50 p-3 rounded-lg flex flex-col transition-all group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-amber-400 transition-colors">CardinalStone</span>
                        <span className="text-[10px] text-gray-500 font-mono">REGIONAL</span>
                      </div>
                      <span className="text-gray-400 text-[11px] mt-1">Institutional Brokerage Services</span>
                    </a>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => setSelectedFiling(null)}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Close Analysis
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}