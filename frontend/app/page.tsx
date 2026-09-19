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
  status?: string; // Added to support 'private' check
}

interface InsiderTransaction {
  id: string;
  reporting_owner: string;
  ticker: string;
  transaction_code: string;
  shares: number;
  price_per_share: number;
  total_value: number;
  transaction_date: string;
  filing_accession: string;
}

interface ActivistStake {
  id: string;
  reporting_owner: string;
  target_company: string;
  filing_type: string;
  filing_date: string;
  filing_accession: string;
}

export default function GlobalHub() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [insiderTrades, setInsiderTrades] = useState<InsiderTransaction[]>([]);
  const [activistStakes, setActivistStakes] = useState<ActivistStake[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'SEC_VERIFIED' | 'REGIONAL'>('ALL');
  const [activeTab, setActiveTab] = useState<'MANAGERS' | 'SIGNALS'>('MANAGERS');

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Fetch Investors, Insider Trades, and Activist Stakes concurrently
        const [investorsRes, insidersRes, activistsRes] = await Promise.all([
          supabase.from('investors').select('*').order('name'),
          supabase.from('insider_transactions').select('*').order('transaction_date', { ascending: false }).limit(15),
          supabase.from('activist_stakes').select('*').order('filing_date', { ascending: false }).limit(15)
        ]);

        if (investorsRes.error) throw investorsRes.error;
        if (investorsRes.data) setInvestors(investorsRes.data as Investor[]);
        if (insidersRes.data) setInsiderTrades(insidersRes.data as InsiderTransaction[]);
        if (activistsRes.data) setActivistStakes(activistStakesRes => activistsRes.data as ActivistStake[]);

      } catch (err) {
        console.error("Error loading institutional dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  // Filter Logic across Search Query and Market Verification Tier
  const filteredInvestors = investors.filter((investor) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      investor.name.toLowerCase().includes(searchLower) ||
      investor.investment_style.toLowerCase().includes(searchLower) ||
      investor.market.toLowerCase().includes(searchLower) ||
      investor.region.toLowerCase().includes(searchLower);

    // SEC Verification is now based purely on regulatory filing status (CIK), not geography
    const isSecVerified = !!investor.cik;
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

  // Dynamic count of all managers with an SEC CIK globally
  const secVerifiedCount = investors.filter((i) => !!i.cik).length;

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
                SEC EDGAR 13F, Form 4 & 13D/G Active
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">BillionairesTrade</h1>
            <p className="text-gray-400 mt-2 text-base md:text-lg font-light">
              Verified Institutional Disclosure Network & Real-Time Signal Stream
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

        {/* Navigation View Tabs & Global Search */}
        <div className="bg-gray-900/80 border border-gray-800 p-4 rounded-2xl space-y-4 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4 shadow-xl">
          
          {/* View Toggle Tabs */}
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => setActiveTab('MANAGERS')}
              className={`px-4 py-2.5 rounded-xl transition-all border ${
                activeTab === 'MANAGERS'
                  ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-md'
                  : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
              }`}
            >
              🏢 Tracked Managers ({investors.length})
            </button>
            <button
              onClick={() => setActiveTab('SIGNALS')}
              className={`px-4 py-2.5 rounded-xl transition-all border flex items-center gap-2 ${
                activeTab === 'SIGNALS'
                  ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-md'
                  : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              ⚡ Live Signals Feed ({insiderTrades.length + activistStakes.length})
            </button>
          </div>

          {/* Conditional Controls based on active tab */}
          {activeTab === 'MANAGERS' ? (
            <div className="flex flex-col md:flex-row items-center gap-3 flex-1 justify-end">
              {/* Real-time Search Input */}
              <div className="relative w-full md:w-72">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                  🔍
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search managers..."
                  className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 text-sm text-gray-200 pl-10 pr-4 py-2 rounded-xl font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2 font-mono text-xs w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                <button
                  onClick={() => setMarketFilter('ALL')}
                  className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap border ${
                    marketFilter === 'ALL'
                      ? 'bg-gray-800 text-white border-gray-700 font-bold'
                      : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
                  }`}
                >
                  All ({investors.length})
                </button>
                <button
                  onClick={() => setMarketFilter('SEC_VERIFIED')}
                  className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap border ${
                    marketFilter === 'SEC_VERIFIED'
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 font-bold'
                      : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
                  }`}
                >
                  SEC Verified ({secVerifiedCount})
                </button>
              </div>
            </div>
          ) : (
            <div className="font-mono text-xs text-gray-400">
              Streaming real-time Form 4 Insider Trades & 13D/G Activist Stakes directly from SEC EDGAR.
            </div>
          )}
        </div>

        {/* Content Render Area */}
        {loading ? (
          <div className="flex justify-center items-center h-64 bg-gray-900/40 border border-gray-800/60 rounded-2xl">
            <div className="text-gray-500 font-mono animate-pulse text-sm">
              Connecting to Institutional Registry & Signal Stream...
            </div>
          </div>
        ) : activeTab === 'SIGNALS' ? (
          /* LIVE SIGNALS STREAM VIEW */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Form 4 Real-Time Insider Transactions Column */}
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-gray-900 border border-gray-800 px-5 py-3 rounded-xl">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>🟢 Form 4 Insider Trades</span>
                </h2>
                <span className="text-xs font-mono bg-blue-950 text-blue-400 border border-blue-800 px-2.5 py-1 rounded">
                  {insiderTrades.length} Events
                </span>
              </div>

              {insiderTrades.length === 0 ? (
                <div className="text-center py-12 bg-gray-900/40 border border-gray-800 rounded-2xl">
                  <p className="text-gray-500 font-mono text-xs">No Form 4 insider signals recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {insiderTrades.map((tx) => {
                    const isBuy = tx.transaction_code === 'P';
                    return (
                      <div key={tx.id} className="bg-gray-900 border border-gray-800 p-5 rounded-xl hover:border-gray-700 transition-all space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-gray-400">{tx.reporting_owner}</span>
                            <h3 className="text-lg font-bold text-white font-mono mt-0.5">${tx.ticker}</h3>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-1 rounded border font-bold ${
                            isBuy ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-red-950 text-red-400 border-red-800'
                          }`}>
                            {isBuy ? '🟢 OPEN MARKET BUY' : '🔴 OPEN MARKET SELL'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800/80 font-mono text-xs">
                          <div>
                            <span className="text-gray-500 block text-[10px]">SHARES</span>
                            <span className="text-gray-200 font-bold">{tx.shares?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[10px]">AVG PRICE</span>
                            <span className="text-gray-200 font-bold">${tx.price_per_share?.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[10px]">TOTAL VALUE</span>
                            <span className="text-emerald-400 font-bold">${tx.total_value?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 text-[11px] font-mono text-gray-500">
                          <span>Date: {tx.transaction_date}</span>
                          <a
                            href={`https://www.sec.gov/edgar/browse/?CIK=${tx.filing_accession}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline flex items-center gap-1"
                          >
                            SEC Filing →
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 13D/G Activist Stakes Column */}
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-gray-900 border border-gray-800 px-5 py-3 rounded-xl">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>🔥 13D/G Activist & Passive Stakes</span>
                </h2>
                <span className="text-xs font-mono bg-purple-950 text-purple-400 border border-purple-800 px-2.5 py-1 rounded">
                  {activistStakes.length} Filings
                </span>
              </div>

              {activistStakes.length === 0 ? (
                <div className="text-center py-12 bg-gray-900/40 border border-gray-800 rounded-2xl">
                  <p className="text-gray-500 font-mono text-xs">No activist stake filings recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activistStakes.map((stake) => {
                    const isActivist = stake.filing_type?.includes('13D');
                    return (
                      <div key={stake.id} className="bg-gray-900 border border-gray-800 p-5 rounded-xl hover:border-gray-700 transition-all space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-gray-400">{stake.reporting_owner}</span>
                            <h3 className="text-lg font-bold text-white mt-0.5">{stake.target_company}</h3>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-1 rounded border font-bold ${
                            isActivist ? 'bg-amber-950 text-amber-400 border-amber-800' : 'bg-blue-950 text-blue-400 border-blue-800'
                          }`}>
                            {stake.filing_type} {isActivist ? '• ACTIVIST INTENT' : '• PASSIVE STAKE'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-gray-800/80 font-mono text-xs text-gray-400">
                          <span>Filing Date: {stake.filing_date}</span>
                          <a
                            href={`https://www.sec.gov/edgar/browse/?CIK=${stake.filing_accession}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline flex items-center gap-1 font-bold"
                          >
                            Verify on EDGAR →
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
          /* MANAGERS DIRECTORY VIEW */
          <div className="space-y-10">
            {['North America', 'Europe', 'Asia-Pacific', 'Africa', 'Middle East & Emerging'].map((region) => {
              const regionInvestors = groupedInvestors[region];
              if (!regionInvestors || regionInvestors.length === 0) return null;

              return (
                <div key={region} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                  {/* Region Header */}
                  <div className="px-6 py-4 bg-linear-to-r from-gray-900 via-gray-900 to-gray-800/80 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white tracking-wide">{region}</h2>
                    <span className="text-[11px] font-mono text-gray-400 bg-gray-950 px-3 py-1 rounded-md border border-gray-800">
                      {regionInvestors.length} {regionInvestors.length === 1 ? 'Manager' : 'Managers'}
                    </span>
                  </div>

                  {/* Manager Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-800">
                    {regionInvestors.map((investor) => {
                      const isSec = !!investor.cik;
                      const isPrivate = !isSec && (investor.market?.toLowerCase().includes('private') || investor.status === 'private');

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
                                  isPrivate 
                                    ? 'bg-gray-950 text-gray-500 border-gray-800' 
                                    : isSec
                                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                                    : 'bg-gray-950 text-gray-500 border-gray-800'
                                }`}
                              >
                                {isPrivate ? 'PRIVATE' : isSec ? 'SEC 13F / Form 4' : investor.market}
                              </span>
                            </div>

                            <p className="text-xs text-gray-400 font-light mb-6">
                              {investor.investment_style}
                            </p>
                          </div>

                          <div className="flex justify-between items-center pt-4 border-t border-gray-800/60 font-mono text-xs">
                            {/* Dynamic Card Status Line */}
                            {isPrivate ? (
                              <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                PRIVATE — NO DISCLOSURE
                              </span>
                            ) : isSec ? (
                              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                VERIFIED SOURCE
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-amber-500/70 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50"></span>
                                AWAITING REGULATORY DATA
                              </span>
                            )}
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