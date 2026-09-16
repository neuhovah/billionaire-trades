"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const AssetMap = dynamic(() => import('../../../components/AssetMap'), { 
  ssr: false,
  loading: () => <div className="h-48 w-full bg-gray-900 animate-pulse rounded-lg border border-gray-800"></div>
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function InvestorDeepDive({ params }: { params: { slug: string } }) {
  const [investor, setInvestor] = useState<any>(null);
  const [filings, setFilings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiling, setSelectedFiling] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Fetch the specific investor using the URL slug
        const { data: investorData, error: invError } = await supabase
          .from('investors')
          .select('*')
          .eq('slug', params.slug)
          .single();

        if (invError) throw invError;
        setInvestor(investorData);

        // 2. Fetch only their specific portfolio holdings
        if (investorData) {
          const { data: filingsData, error: filError } = await supabase
            .from('filings')
            .select('*, metrics(volatility_90d)')
            .eq('investor_id', investorData.id)
            .order('shares_held', { ascending: false });
          
          if (!filError && filingsData) {
            setFilings(filingsData);
          }
        }
      } catch (err) {
        console.error("Data Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [params.slug]);

  if (loading) {
    return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-mono">Loading Institutional Data...</div>;
  }

  if (!investor) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center font-mono text-red-400">Investor profile not found.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Navigation Breadcrumb */}
        <Link href="/" className="text-gray-500 hover:text-white font-mono text-sm flex items-center gap-2 mb-8 transition-colors w-fit">
          <span>←</span> Back to Global Hub
        </Link>

        {/* Manager Header */}
        <div className="mb-10 border-b border-gray-800 pb-6">
          <h1 className="text-4xl font-bold text-white tracking-tight">{investor.name}</h1>
          <div className="flex gap-4 mt-3">
            <p className="text-gray-400 text-lg">{investor.investment_style}</p>
            <span className="text-xs font-mono text-blue-400 bg-blue-950/30 border border-blue-900/50 px-2.5 py-1 rounded">
              {investor.region} | {investor.market}
            </span>
          </div>
        </div>

        {/* Portfolio Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-200">Current Portfolio Holdings</h2>
            <span className="text-xs font-mono text-gray-500">{filings.length} Assets Found</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="bg-gray-800/50 text-xs uppercase text-gray-400 font-semibold">
                <tr>
                  <th className="px-6 py-4">Ticker</th>
                  <th className="px-6 py-4">Shares Acquired</th>
                  <th className="px-6 py-4">Report Date</th>
                  <th className="px-6 py-4">Accession No.</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Awaiting SEC/Regional Filing Data for this Portfolio.
                    </td>
                  </tr>
                ) : (
                  filings.map((filing) => (
                    <tr key={filing.id} className="border-b border-gray-800 hover:bg-gray-800/25 transition-colors">
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

        {/* Modal Logic */}
        {selectedFiling && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
              
              <div className="flex justify-between items-center border-b border-gray-800 pb-4 mb-4 shrink-0">
                <div>
                  <h3 className="text-2xl font-bold text-white">${selectedFiling.ticker} Quantitative Breakdown</h3>
                </div>
                <button 
                  onClick={() => setSelectedFiling(null)}
                  className="text-gray-400 hover:text-white font-bold text-xl transition-colors"
                >✕</button>
              </div>

              <div className="space-y-4 text-sm text-gray-300 overflow-y-auto pr-1 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 flex flex-col justify-between">
                    <span className="text-gray-400 text-xs">Institutional Position:</span>
                    <span className="font-mono text-emerald-400 font-bold text-base mt-1">
                      {selectedFiling.shares_held ? selectedFiling.shares_held.toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 flex flex-col justify-between">
                    <span className="text-gray-400 text-xs">90-Day Volatility (σ):</span>
                    <span className="font-mono text-blue-400 font-bold text-base mt-1">
                      {selectedFiling.metrics?.[0]?.volatility_90d ? `${selectedFiling.metrics[0].volatility_90d}%` : 'Calculating...'}
                    </span>
                  </div>
                  <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 flex flex-col justify-between">
                    <span className="text-gray-400 text-xs mb-1">Volatility Profile:</span>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border text-center ${
                      (selectedFiling.metrics?.[0]?.volatility_90d || 0) > 30 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {(selectedFiling.metrics?.[0]?.volatility_90d || 0) > 30 ? 'High Volatility' : 'Moderate Volatility'}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800">
                  <span className="text-gray-400 block mb-2 font-semibold text-xs">Geospatial Asset Tracking:</span>
                  <AssetMap ticker={selectedFiling.ticker} />
                </div>

                <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-gray-400 font-semibold text-xs">Verified Execution Brokers:</span>
                    <span className="text-[10px] uppercase font-mono bg-blue-900/40 text-blue-400 border border-blue-800/40 px-2 py-0.5 rounded">Direct Market Access</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <a href="https://www.interactivebrokers.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-blue-500/50 p-2.5 rounded-lg flex flex-col group">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-blue-400">Interactive Brokers</span>
                        <span className="text-[9px] text-gray-500 font-mono">GLOBAL</span>
                      </div>
                      <span className="text-gray-400 text-[10px] mt-0.5">US & Global Equities</span>
                    </a>
                    <a href="https://www.xtb.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-emerald-500/50 p-2.5 rounded-lg flex flex-col group">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-emerald-400">XTB Global</span>
                        <span className="text-[9px] text-gray-500 font-mono">GLOBAL</span>
                      </div>
                      <span className="text-gray-400 text-[10px] mt-0.5">Low-Commission Execution</span>
                    </a>
                    <a href="https://www.stanbicibtcstockbrokers.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-purple-500/50 p-2.5 rounded-lg flex flex-col group">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-purple-400">Stanbic IBTC Securities</span>
                        <span className="text-[9px] text-gray-500 font-mono">REGIONAL</span>
                      </div>
                      <span className="text-gray-400 text-[10px] mt-0.5">NGX & African Execution</span>
                    </a>
                    <a href="https://www.cardinalstone.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-amber-500/50 p-2.5 rounded-lg flex flex-col group">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold text-xs group-hover:text-amber-400">CardinalStone</span>
                        <span className="text-[9px] text-gray-500 font-mono">REGIONAL</span>
                      </div>
                      <span className="text-gray-400 text-[10px] mt-0.5">Institutional Brokerage</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800 flex justify-end shrink-0">
                <button onClick={() => setSelectedFiling(null)} className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors">Close Analysis</button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}