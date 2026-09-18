"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const AssetMap = dynamic(() => import('../../../components/AssetMap'), { 
  ssr: false,
  loading: () => <div className="h-48 w-full bg-gray-900 animate-pulse rounded-lg border border-gray-800"></div>
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Types
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

export default function InvestorDeepDive() {
  const params = useParams();
  const slug = params?.slug as string;

  const [investor, setInvestor] = useState<any>(null);
  const [filings, setFilings] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  
  // Real-time signal states
  const [insiderTrades, setInsiderTrades] = useState<InsiderTransaction[]>([]);
  const [activistStakes, setActivistStakes] = useState<ActivistStake[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedFiling, setSelectedFiling] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'HOLDINGS' | 'INSIDER' | 'ACTIVIST'>('HOLDINGS');

  useEffect(() => {
    if (!slug) return;

    async function fetchData() {
      try {
        // 1. Fetch Investor Profile
        const { data: investorData, error: invError } = await supabase
          .from('investors')
          .select('*')
          .eq('slug', slug)
          .single();

        if (invError) throw invError;
        setInvestor(investorData);

        if (investorData) {
          // 2. Fetch Current State (Filings + Provenance Metrics)
          const filingsPromise = supabase
            .from('filings')
            .select('*, metrics(volatility_90d, vol_is_estimated)')
            .eq('investor_id', investorData.id)
            .order('shares_held', { ascending: false });

          // 3. Fetch Append-Only History for QoQ Diffing
          const historyPromise = supabase
            .from('holdings_history')
            .select('ticker, shares_held, period_of_report')
            .eq('investor_id', investorData.id)
            .order('period_of_report', { ascending: false });

          // 4. Fetch Form 4 Insider Trades for this specific manager
          const insiderPromise = supabase
            .from('insider_transactions')
            .select('*')
            .eq('reporting_owner', investorData.name)
            .order('transaction_date', { ascending: false });

          // 5. Fetch 13D/G Activist Stakes for this specific manager
          const activistPromise = supabase
            .from('activist_stakes')
            .select('*')
            .eq('investor_id', investorData.id)
            .order('filing_date', { ascending: false });

          // Execute concurrently for speed
          const [filingsRes, historyRes, insiderRes, activistRes] = await Promise.all([
            filingsPromise, historyPromise, insiderPromise, activistPromise
          ]);

          if (!filingsRes.error && filingsRes.data) setFilings(filingsRes.data);
          if (!historyRes.error && historyRes.data) setHistory(historyRes.data);
          if (!insiderRes.error && insiderRes.data) setInsiderTrades(insiderRes.data as InsiderTransaction[]);
          if (!activistRes.error && activistRes.data) setActivistStakes(activistRes.data as ActivistStake[]);
        }
      } catch (err) {
        console.error("Data Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [slug]);

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
        <div className="mb-8 border-b border-gray-800 pb-6">
          <h1 className="text-4xl font-bold text-white tracking-tight">{investor.name}</h1>
          <div className="flex flex-wrap gap-4 mt-3 items-center">
            <p className="text-gray-400 text-lg">{investor.investment_style}</p>
            <span className="text-xs font-mono text-blue-400 bg-blue-950/30 border border-blue-900/50 px-2.5 py-1 rounded">
              {investor.region} | {investor.market}
            </span>
            {investor.market === 'US Equities' && (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-2.5 py-1 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> SEC EDGAR Verified
              </span>
            )}
          </div>
        </div>

        {/* Deep Dive Tabs */}
        <div className="flex items-center gap-2 font-mono text-xs mb-8 overflow-x-auto pb-2 border-b border-gray-800/50">
          <button
            onClick={() => setActiveTab('HOLDINGS')}
            className={`px-4 py-2.5 rounded-t-lg transition-all border-b-2 ${
              activeTab === 'HOLDINGS'
                ? 'bg-blue-900/20 text-white border-blue-500 font-bold'
                : 'text-gray-400 border-transparent hover:bg-gray-900 hover:text-gray-200'
            }`}
          >
            📊 13F Holdings ({filings.length})
          </button>
          <button
            onClick={() => setActiveTab('INSIDER')}
            className={`px-4 py-2.5 rounded-t-lg transition-all border-b-2 ${
              activeTab === 'INSIDER'
                ? 'bg-emerald-900/20 text-white border-emerald-500 font-bold'
                : 'text-gray-400 border-transparent hover:bg-gray-900 hover:text-gray-200'
            }`}
          >
            🟢 Form 4 Insider Trades ({insiderTrades.length})
          </button>
          <button
            onClick={() => setActiveTab('ACTIVIST')}
            className={`px-4 py-2.5 rounded-t-lg transition-all border-b-2 ${
              activeTab === 'ACTIVIST'
                ? 'bg-purple-900/20 text-white border-purple-500 font-bold'
                : 'text-gray-400 border-transparent hover:bg-gray-900 hover:text-gray-200'
            }`}
          >
            🔥 13D/G Activist Stakes ({activistStakes.length})
          </button>
        </div>

        {/* Tab 1: 13F Holdings View */}
        {activeTab === 'HOLDINGS' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-200">Current Portfolio & QoQ Vectors</h2>
              <span className="text-xs font-mono text-gray-500">Quarterly Snapshots</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-800/50 text-xs uppercase text-gray-400 font-semibold">
                  <tr>
                    <th className="px-6 py-4">Ticker</th>
                    <th className="px-6 py-4">Shares Held</th>
                    <th className="px-6 py-4">QoQ Vector</th>
                    <th className="px-6 py-4">Report Date</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        Awaiting Verified Regulatory Data for this Portfolio.
                      </td>
                    </tr>
                  ) : (
                    filings.map((filing) => {
                      const prevFiling = history.find(
                        (h) => h.ticker === filing.ticker && h.period_of_report < filing.report_date
                      );

                      let diffBadge = <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-400 border border-blue-900">BASE</span>;
                      
                      if (prevFiling && prevFiling.shares_held) {
                        const diff = filing.shares_held - prevFiling.shares_held;
                        const pct = ((diff / prevFiling.shares_held) * 100).toFixed(1);
                        if (diff > 0) {
                          diffBadge = <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">+{pct}% ADDED</span>;
                        } else if (diff < 0) {
                          diffBadge = <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">{pct}% TRIMMED</span>;
                        } else {
                          diffBadge = <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-400 border border-gray-700">UNCHANGED</span>;
                        }
                      } else {
                        diffBadge = <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">NEW POSITION</span>;
                      }

                      return (
                        <tr key={filing.id} className="border-b border-gray-800 hover:bg-gray-800/25 transition-colors">
                          <td className="px-6 py-4 font-bold text-blue-400">${filing.ticker}</td>
                          <td className="px-6 py-4 text-emerald-400 font-medium font-mono">
                            {filing.shares_held ? filing.shares_held.toLocaleString() : 'N/A'}
                          </td>
                          <td className="px-6 py-4">{diffBadge}</td>
                          <td className="px-6 py-4 font-mono text-xs">{filing.report_date}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => setSelectedFiling(filing)}
                              className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/50 px-4 py-1.5 rounded text-xs font-bold transition-colors"
                            >
                              Analyze
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Insider Trades View */}
        {activeTab === 'INSIDER' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {insiderTrades.length === 0 ? (
              <div className="col-span-full py-16 text-center border border-gray-800 bg-gray-900/40 rounded-xl text-gray-500 font-mono text-sm">
                No recent Form 4 insider transactions recorded for {investor.name}.
              </div>
            ) : (
              insiderTrades.map((tx) => {
                const isBuy = tx.transaction_code === 'P';
                return (
                  <div key={tx.id} className="bg-gray-900 border border-gray-800 p-5 rounded-xl hover:border-gray-700 transition-colors shadow-lg">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold text-white font-mono">${tx.ticker}</h3>
                      <span className={`text-[10px] font-mono px-2 py-1 rounded border font-bold ${
                        isBuy ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-red-950 text-red-400 border-red-800'
                      }`}>
                        {isBuy ? '🟢 OPEN MARKET BUY' : '🔴 OPEN MARKET SELL'}
                      </span>
                    </div>

                    <div className="space-y-2 font-mono text-xs text-gray-300">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Shares Traded:</span>
                        <span className="font-bold">{tx.shares?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Avg Price:</span>
                        <span className="font-bold">${tx.price_per_share?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-800/80">
                        <span className="text-gray-500">Total Value:</span>
                        <span className="font-bold text-emerald-400">
                          ${tx.total_value?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-gray-800 flex justify-between items-center text-[10px] font-mono">
                      <span className="text-gray-500">{tx.transaction_date}</span>
                      <a
                        href={`https://www.sec.gov/edgar/browse/?CIK=${tx.filing_accession}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        Verify EDGAR →
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 3: Activist Stakes View */}
        {activeTab === 'ACTIVIST' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activistStakes.length === 0 ? (
              <div className="col-span-full py-16 text-center border border-gray-800 bg-gray-900/40 rounded-xl text-gray-500 font-mono text-sm">
                No recent 13D/G activist or passive stakes recorded for {investor.name}.
              </div>
            ) : (
              activistStakes.map((stake) => {
                const isActivist = stake.filing_type?.includes('13D');
                return (
                  <div key={stake.id} className="bg-gray-900 border border-gray-800 p-6 rounded-xl hover:border-gray-700 transition-colors shadow-lg">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Target Entity</span>
                        <h3 className="text-xl font-bold text-white mt-0.5">{stake.target_company}</h3>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-1 rounded border font-bold ${
                        isActivist ? 'bg-amber-950 text-amber-400 border-amber-800' : 'bg-blue-950 text-blue-400 border-blue-800'
                      }`}>
                        {stake.filing_type} {isActivist ? '• ACTIVIST INTENT' : '• PASSIVE STAKE'}
                      </span>
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-800/80 flex justify-between items-center text-xs font-mono">
                      <span className="text-gray-500">Filing Date: {stake.filing_date}</span>
                      <a
                        href={`https://www.sec.gov/edgar/browse/?CIK=${stake.filing_accession}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline flex items-center gap-1 font-bold"
                      >
                        Read SEC Filing →
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Modal Logic for 13F Analysis */}
        {selectedFiling && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col scale-in-95 duration-200">
              
              <div className="flex justify-between items-start border-b border-gray-800 pb-4 mb-4 shrink-0">
                <div>
                  <h3 className="text-2xl font-bold text-white">${selectedFiling.ticker} Quantitative Breakdown</h3>
                  {/* Data Provenance Badge */}
                  <div className="mt-2 inline-flex items-center gap-2 text-[10px] uppercase font-mono bg-gray-950 border border-gray-800 text-gray-400 px-2.5 py-1 rounded">
                    <span className="text-emerald-500">●</span> 
                    Position Data: {selectedFiling.data_source === 'sec_edgar' ? <span className="text-emerald-400">VERIFIED: SEC 13F-HR</span> : 'MANUAL ENTRY'} 
                    <span className="mx-1 text-gray-600">|</span> 
                    As Of: {selectedFiling.report_date}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedFiling(null)}
                  className="text-gray-500 hover:text-white font-bold text-2xl transition-colors leading-none"
                >×</button>
              </div>

              <div className="space-y-4 text-sm text-gray-300 overflow-y-auto pr-1 flex-1">
                
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 flex flex-col justify-between">
                    <span className="text-gray-400 text-xs">Institutional Position:</span>
                    <span className="font-mono text-emerald-400 font-bold text-base mt-1">
                      {selectedFiling.shares_held ? selectedFiling.shares_held.toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  
                  {/* Volatility Metric with Transparency Tooltip */}
                  <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 flex flex-col justify-between relative group">
                    <span className="text-gray-400 text-xs flex justify-between items-center">
                      90-Day Volatility (σ):
                      <span className="text-[9px] text-gray-600 font-mono">SOURCE: YF</span>
                    </span>
                    <span className="font-mono text-blue-400 font-bold text-base mt-1 flex items-center">
                      {selectedFiling.metrics?.[0]?.volatility_90d ? `${selectedFiling.metrics[0].volatility_90d}%` : 'N/A'}
                      {selectedFiling.metrics?.[0]?.vol_is_estimated && (
                        <span className="text-[8px] text-amber-500 font-mono border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 rounded ml-2 uppercase">
                          Estimated
                        </span>
                      )}
                    </span>
                    <div className="absolute hidden group-hover:block -top-8 left-0 bg-gray-800 text-xs px-2 py-1 rounded border border-gray-700 w-full z-10 text-center shadow-lg">
                      Calculated via Yahoo Finance Market API
                    </div>
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

                {/* Relabeled Spatial Map */}
                <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 font-semibold text-xs">Primary Corporate Headquarters:</span>
                    <span className="text-[9px] text-gray-500 font-mono">POSTGIS GPS</span>
                  </div>
                  <AssetMap ticker={selectedFiling.ticker} />
                </div>

                {/* Ticker-Based Dynamic Broker Routing */}
                <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-gray-400 font-semibold text-xs">Common Market Access:</span>
                    <span className="text-[10px] uppercase font-mono bg-blue-900/40 text-blue-400 border border-blue-800/40 px-2 py-0.5 rounded">
                      {!selectedFiling.ticker.includes('.') ? 'US Equities DMA' : 'Regional / Cross-Border'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    
                    {/* Logic: US-Listed Equities (Tickers with no exchange suffix) */}
                    {!selectedFiling.ticker.includes('.') && (
                      <>
                        <a href="https://www.interactivebrokers.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-blue-500/50 p-2.5 rounded-lg flex flex-col group transition-all">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-xs group-hover:text-blue-400">Interactive Brokers</span>
                            <span className="text-[9px] text-gray-500 font-mono">GLOBAL</span>
                          </div>
                          <span className="text-gray-400 text-[10px] mt-0.5">US Equities Access</span>
                        </a>
                        <a href="https://www.xtb.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-emerald-500/50 p-2.5 rounded-lg flex flex-col group transition-all">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-xs group-hover:text-emerald-400">XTB Global</span>
                            <span className="text-[9px] text-gray-500 font-mono">GLOBAL</span>
                          </div>
                          <span className="text-gray-400 text-[10px] mt-0.5">Low-Commission Execution</span>
                        </a>
                      </>
                    )}

                    {/* Logic: African Equities (Tickers ending in .LG or .JO) */}
                    {(selectedFiling.ticker.endsWith('.LG') || selectedFiling.ticker.endsWith('.JO')) && (
                      <>
                        <a href="https://www.stanbicibtcstockbrokers.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-purple-500/50 p-2.5 rounded-lg flex flex-col group transition-all">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-xs group-hover:text-purple-400">Stanbic IBTC</span>
                            <span className="text-[9px] text-gray-500 font-mono">REGIONAL</span>
                          </div>
                          <span className="text-gray-400 text-[10px] mt-0.5">African Exchange Access</span>
                        </a>
                        <a href="https://www.cardinalstone.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-amber-500/50 p-2.5 rounded-lg flex flex-col group transition-all">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold text-xs group-hover:text-amber-400">CardinalStone</span>
                            <span className="text-[9px] text-gray-500 font-mono">REGIONAL</span>
                          </div>
                          <span className="text-gray-400 text-[10px] mt-0.5">Institutional Brokerage</span>
                        </a>
                      </>
                    )}

                    {/* Logic: Other International Equities (e.g., .PA, .HK, .T) */}
                    {(selectedFiling.ticker.includes('.') && !selectedFiling.ticker.endsWith('.LG') && !selectedFiling.ticker.endsWith('.JO')) && (
                      <a href="https://www.interactivebrokers.com" target="_blank" rel="noopener noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 hover:border-blue-500/50 p-2.5 rounded-lg flex flex-col group transition-all col-span-2">
                        <div className="flex justify-between items-center">
                          <span className="text-white font-bold text-xs group-hover:text-blue-400">Interactive Brokers (International)</span>
                          <span className="text-[9px] text-gray-500 font-mono">GLOBAL</span>
                        </div>
                        <span className="text-gray-400 text-[10px] mt-0.5">Cross-Border Market Access</span>
                      </a>
                    )}

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