"use client";

import Link from 'next/link';

export default function ComplianceFooter() {
  return (
    <footer className="w-full bg-gray-950 border-t border-gray-900 py-6 px-8 mt-12 text-gray-500 font-sans text-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        
        {/* Regulatory Disclaimer */}
        <div className="space-y-1 max-w-2xl text-[11px] leading-relaxed">
          <p className="font-semibold text-gray-400 uppercase tracking-wider">Institutional Regulatory Disclosure & Disclaimer</p>
          <p>
            BillionairesTrade is an analytical intelligence platform tracking public regulatory filings (SEC 13F-HR) and regional proxy disclosures. 
            Data is provided for informational and research purposes only and does <span className="text-gray-300 font-medium">not</span> constitute financial, legal, or investment advice. 
            Past performance of tracked institutional managers does not guarantee future results.
          </p>
        </div>

        {/* Links & Copyright */}
        <div className="flex flex-col md:items-end gap-2 text-[11px]">
          <div className="flex gap-4 font-mono">
            <span className="hover:text-gray-300 transition-colors cursor-pointer">Terms of Service</span>
            <span>•</span>
            <span className="hover:text-gray-300 transition-colors cursor-pointer">Privacy Policy</span>
            <span>•</span>
            <span className="hover:text-gray-300 transition-colors cursor-pointer">API Status</span>
          </div>
          <p className="font-mono text-[10px] text-gray-600">
            © {new Date().getFullYear()} BillionairesTrade Terminal. All rights reserved.
          </p>
        </div>

      </div>
    </footer>
  );
}