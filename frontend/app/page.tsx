"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

// Supabase Setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Types
interface Investor {
  id: string;
  name: string;
  region: string;
  market: string;
  investment_style: string;
  slug: string;
  cik?: string;
}

export default function GlobalHub() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'SEC_VERIFIED' | 'REGIONAL'>('ALL');

  useEffect(() => {
    async function fetchInvestors() {
      try {
        const { data, error } = await supabase
          .from('investors')
          .select('*')
          .order('name');

        if (error) throw error;
        if (data) setInvestors(data as Investor[]);
      } catch (err) {
        console.error("Error fetching investors:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchInvestors();
  }, []);

  // Filter Logic across Search Query and Market Verification Tier
  const filteredInvestors = investors.filter((investor) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      investor.name.toLowerCase().includes(searchLower) ||
      investor.investment_style.toLowerCase().includes(searchLower) ||
      investor.market.toLowerCase().includes(searchLower) ||
      investor.region.toLowerCase().includes(searchLower);

    const isSecVerified = investor.market === 'US Equities';
    const matchesMarket =
      marketFilter === 'ALL' ||
      (marketFilter === 'SEC_VERIFIED' && isSecVerified) ||
      (marketFilter === 'REGIONAL' && !isSecVerified);

    return matchesSearch && matchesMarket;
  });

  // Group filtered results by region
  const groupedInvestors = filteredInvestors.reduce((acc: Record<string, Investor[]>, investor) => {
    const region = investor.region || 'Global';
    if (!acc[region]) acc[region] = [];
    acc[region].push(investor);
    return acc;
  }, {});

  const secVerifiedCount = investors.filter((i) => i.market === 'US Equities').length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Terminal Header */}
        <div className="border-b border-gray-800 pb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-blue-950 text-blue-400 border border-blue-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded tracking-wider uppercase">
                Institutional Terminal v1.0
              </span>
              <span className="text-xs font-mono text-gray-500">
                SEC EDGAR 13F & Form 4 Active
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">BillionairesTrade</h1>
            <p className="text-gray-400 mt-2 text-base md:text-lg font-light">
              Verified Institutional Disclosure Network & Real-Time Signal Engine
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-emerald-400 font-mono text-xs bg-emerald-950/40 border border-emerald-900/60 px-3.5 py-2 rounded-lg flex items-center gap-2.5 shadow-lg">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              Live Pipeline Operational
            </div>
          </div>
        </div>

        {/* Global Search Bar and Market Filter Controls */}
        <div className="bg-gray-900/80 border border-gray-800 p-4 rounded-2xl space-y-4 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4 shadow-xl">
          
          {/* Real-time Search Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
              🔍
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by manager name, strategy, region, or market..."
              className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 text-sm text-gray-200 pl-10 pr-4 py-2.5 rounded-xl font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-mono text-gray-500 hover:text-white"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 font-mono text-xs">
            <button
              onClick={() => setMarketFilter('ALL')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap border ${
                marketFilter === 'ALL'
                  ? 'bg-blue-600 text-white border-blue-500 font-bold'
                  : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
              }`}
            >
              All Tracked ({investors.length})
            </button>
            <button
              onClick={() => setMarketFilter('SEC_VERIFIED')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                marketFilter === 'SEC_VERIFIED'
                  ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                  : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
              }`}
            >
              <span className="text-emerald-400">●</span> SEC Verified ({secVerifiedCount})
            </button>
            <button
              onClick={() => setMarketFilter('REGIONAL')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap border ${
                marketFilter === 'REGIONAL'
                  ? 'bg-purple-600 text-white border-purple-500 font-bold'
                  : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
              }`}
            >
              Regional / Pending
            </button>
          </div>
        </div>

        {/* Content Render Area */}
        {loading ? (
          <div className="flex justify-center items-center h-64 bg-gray-900/40 border border-gray-800/60 rounded-2xl">
            <div className="text-gray-500 font-mono animate-pulse text-sm">
              Connecting to Institutional Registry...
            </div>
          </div>
        ) : filteredInvestors.length === 0 ? (
          <div className="text-center py-16 bg-gray-900/40 border border-gray-800 rounded-2xl">
            <p className="text-gray-400 font-mono text-sm">No managers match your filter parameters.</p>
            <button
              onClick={() => { setSearchTerm(''); setMarketFilter('ALL'); }}
              className="mt-3 text-xs font-mono text-blue-400 hover:underline"
            >
              Reset Search & Filters
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {['North America', 'Europe', 'Asia-Pacific', 'Africa', 'Middle East & Emerging'].map((region) => {
              const regionInvestors = groupedInvestors[region];
              if (!regionInvestors || regionInvestors.length === 0) return null;

              return (
                <div key={region} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                  {/* Region Header */}
                  <div className="px-6 py-4 bg-gradient-to-r from-gray-900 via-gray-900 to-gray-800/80 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white tracking-wide">{region}</h2>
                    <span className="text-[11px] font-mono text-gray-400 bg-gray-950 px-3 py-1 rounded-md border border-gray-800">
                      {regionInvestors.length} {regionInvestors.length === 1 ? 'Manager' : 'Managers'}
                    </span>
                  </div>

                  {/* Manager Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-800">
                    {regionInvestors.map((investor) => {
                      const isSec = investor.market === 'US Equities';
                      return (
                        <Link
                          href={`/investor/${investor.slug}`}
                          key={investor.id}
                          className="bg-gray-900 p-6 hover:bg-gray-800/60 transition-all group relative flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex justify-between items-start mb-3 gap-2">
                              <h3 className="font-bold text-gray-100 group-hover:text-blue-400 transition-colors text-lg leading-tight">
                                {investor.name}
                              </h3>
                              <span
                                className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded border whitespace-nowrap ${
                                  isSec
                                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                                    : 'bg-gray-950 text-gray-500 border-gray-800'
                                }`}
                              >
                                {isSec ? 'SEC 13F / Form 4' : investor.market}
                              </span>
                            </div>

                            <p className="text-xs text-gray-400 font-light mb-6">
                              {investor.investment_style}
                            </p>
                          </div>

                          <div className="flex justify-between items-center pt-4 border-t border-gray-800/60 font-mono text-xs">
                            <span className="text-[10px] text-gray-500 flex items-center gap-1">
                              {isSec ? (
                                <span className="text-emerald-400 font-bold">● VERIFIED SOURCE</span>
                              ) : (
                                <span className="text-amber-500">○ AWAITING REGULATORY DATA</span>
                              )}
                            </span>
                            <span className="text-blue-400 group-hover:translate-x-1 transition-transform font-bold text-sm">
                              →
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}