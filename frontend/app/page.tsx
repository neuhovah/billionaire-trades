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
  id: number;
  name: string;
  region: string;
  market: string;
  investment_style: string;
  slug: string;
}

export default function GlobalHub() {
  const [investorsByRegion, setInvestorsByRegion] = useState<Record<string, Investor[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInvestors() {
      try {
        const { data, error } = await supabase
          .from('investors')
          .select('*')
          .order('name');

        if (error) throw error;

        // Group investors by region
        if (data) {
          const grouped = data.reduce((acc: Record<string, Investor[]>, investor) => {
            const region = investor.region || 'Global';
            if (!acc[region]) acc[region] = [];
            acc[region].push(investor as Investor);
            return acc;
          }, {});
          
          setInvestorsByRegion(grouped);
        }
      } catch (err) {
        console.error("Error fetching investors:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchInvestors();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* Hub Header */}
        <div className="mb-12 border-b border-gray-800 pb-8 text-center md:text-left flex flex-col md:flex-row justify-between items-center md:items-end gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">BillionairesTrade</h1>
            <p className="text-gray-400 mt-3 text-lg md:text-xl font-light">Global Alpha & Institutional Disclosure Network</p>
          </div>
          <div className="text-emerald-400 font-mono text-sm bg-emerald-950/30 border border-emerald-900/50 px-4 py-2 rounded-lg flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            Live Data Engine Active
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500 font-mono animate-pulse">Initializing Global Markets...</div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Map over the 5 Regions */}
            {['North America', 'Europe', 'Asia-Pacific', 'Africa', 'Middle East & Emerging'].map((region) => {
              const regionInvestors = investorsByRegion[region];
              if (!regionInvestors || regionInvestors.length === 0) return null;

              return (
                <div key={region} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                  {/* Region Header */}
                  <div className="px-6 py-5 bg-gradient-to-r from-gray-900 to-gray-800/80 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white tracking-wide">{region}</h2>
                    <span className="text-xs font-mono text-gray-500 bg-gray-950 px-3 py-1 rounded-md border border-gray-800">
                      {regionInvestors.length} Managers
                    </span>
                  </div>
                  
                  {/* Manager Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-800">
                    {regionInvestors.map((investor) => (
                      <Link 
                        href={`/investor/${investor.slug}`} 
                        key={investor.id}
                        className="bg-gray-900 p-6 hover:bg-gray-800/60 transition-colors group relative"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-bold text-gray-200 group-hover:text-blue-400 transition-colors text-lg pr-4 leading-tight">
                            {investor.name}
                          </h3>
                          <span className="text-[10px] uppercase font-mono text-gray-500 border border-gray-700 px-2 py-0.5 rounded whitespace-nowrap">
                            {investor.market}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mb-6 font-light">{investor.investment_style}</p>
                        
                        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-blue-500 font-mono text-xs font-bold flex items-center gap-1">
                            Analyze Portfolio <span className="text-lg">→</span>
                          </span>
                        </div>
                      </Link>
                    ))}
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