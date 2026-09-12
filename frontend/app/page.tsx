"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Dashboard() {
  const [filings, setFilings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFilings() {
      const { data, error } = await supabase
        .from('filings')
        .select('*')
        .order('shares_held', { ascending: false });

      if (error) console.error("Error fetching data:", error);
      if (data) setFilings(data);
      setLoading(false);
    }

    fetchFilings();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="mb-10 border-b border-gray-800 pb-6">
          <h1 className="text-4xl font-bold text-white tracking-tight">BillionaireTrades</h1>
          <p className="text-gray-400 mt-2 text-lg">Institutional Alpha & SEC Disclosure Tracking</p>
        </div>

        {/* Data Terminal Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/50">
            <h2 className="text-xl font-semibold text-gray-200">Recent Whale Activity (13F-HR)</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="bg-gray-800/50 text-xs uppercase text-gray-400 font-semibold">
                <tr>
                  <th className="px-6 py-4">Ticker</th>
                  <th className="px-6 py-4">Shares Acquired</th>
                  <th className="px-6 py-4">Filing Accession No.</th>
                  <th className="px-6 py-4">Report Date</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading quantitative data...</td>
                  </tr>
                ) : filings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No filings found in database.</td>
                  </tr>
                ) : (
                  filings.map((filing) => (
                    <tr key={filing.id} className="border-b border-gray-800 hover:bg-gray-800/25 transition-colors">
                      <td className="px-6 py-4 font-bold text-white">${filing.ticker}</td>
                      <td className="px-6 py-4 text-emerald-400 font-medium">
                        {filing.shares_held.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{filing.filing_accession}</td>
                      <td className="px-6 py-4">{filing.report_date}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold transition-colors">
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

      </div>
    </div>
  );
}