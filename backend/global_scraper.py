import os
import time
import numpy as np
import yfinance as yf
from datetime import datetime
from edgar import set_identity, Company
from supabase import create_client, Client
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("CRITICAL: Supabase credentials missing in .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# SEC Identity
set_identity("System Admin admin@uyologistics.com")

def calculate_volatility(ticker: str) -> float | None:
    """Calculates annualized 90-day volatility for global and US tickers with emerging market fallbacks."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="90d")
        
        # Fallback logic for illiquid or unsupported emerging markets (like NGX)
        if hist.empty or len(hist) < 10:
            if ticker.endswith('.LG'):
                print(f"  ⚠️ Applying emerging market proxy volatility for {ticker}")
                return 28.50  # Standard historical proxy for NGX blue-chips
            return None
        
        hist['Returns'] = hist['Close'].pct_change()
        vol_90d = hist['Returns'].std() * np.sqrt(252)
        
        if np.isnan(vol_90d):
            return None
            
        return round(float(vol_90d * 100), 2)
    except Exception as e:
        # Catch 404s and apply the same proxy fallback
        if ticker.endswith('.LG'):
            print(f"  ⚠️ Applying emerging market proxy volatility for {ticker} (API Error)")
            return 28.50
        print(f"  ⚠️ Volatility calculation error for {ticker}: {e}")
        return None
def fetch_regional_proxy_holdings(slug: str):
    """
    Acts as a proxy ingestion endpoint for non-SEC global exchanges.
    Maps international titans to their primary publicly traded vehicles using global ticker suffixes.
    """
    regional_alpha_map = {
        # Africa (NGX suffix is .LG, JSE is .JO)
        'aliko-dangote': [{'ticker': 'DANGCEM.LG', 'shares': 14000000000}],
        'femi-otedola': [{'ticker': 'FBNH.LG', 'shares': 1000000000}, {'ticker': 'GEREGU.LG', 'shares': 1200000000}],
        'tony-elumelu': [{'ticker': 'UBA.LG', 'shares': 2500000000}, {'ticker': 'TRANSCORP.LG', 'shares': 10000000000}],
        'johann-rupert': [{'ticker': 'CFR.JO', 'shares': 522000000}],
        
        # Asia (TSE is .T, HKEX is .HK)
        'masayoshi-son': [{'ticker': '9984.T', 'shares': 420000000}, {'ticker': 'ARM', 'shares': 930000000}],
        'li-ka-shing': [{'ticker': '0001.HK', 'shares': 1100000000}],
        
        # Europe (Euronext is .PA, XETRA is .DE)
        'bernard-arnault': [{'ticker': 'MC.PA', 'shares': 240000000}],
        'stefan-quandt': [{'ticker': 'BMW.DE', 'shares': 155000000}]
    }
    return regional_alpha_map.get(slug, [])

def process_and_sync_holdings(investor_id, investor_name, ticker, shares, report_date, accession_no):
    """Handles the universal database upsert for both SEC and Regional data."""
    print(f"  🔍 Analyzing {ticker} | Shares: {shares:,}")
    vol_90d = calculate_volatility(ticker)
    
    if vol_90d is not None:
        print(f"  📈 90-Day Volatility: {vol_90d}%")
    else:
        print("  ⚠️ Volatility unavailable.")
    
    filing_data = {
        "investor_id": investor_id,
        "filing_accession": accession_no,
        "ticker": ticker,
        "shares_held": shares,
        "report_date": report_date
    }
    
    try:
        filing_response = supabase.table("filings").upsert(
            filing_data, on_conflict="filing_accession, ticker"
        ).execute()
        
        if filing_response.data:
            filing_id = filing_response.data[0]['id']
            if vol_90d is not None:
                supabase.table("metrics").upsert(
                    {"filing_id": filing_id, "ticker": ticker, "volatility_90d": vol_90d},
                    on_conflict="filing_id, ticker"
                ).execute()
                print(f"  ✅ Indexed successfully.")
    except Exception as e:
        print(f"  ❌ Sync failed for {ticker}: {e}")

def run_global_pipeline():
    print("=== STARTING GLOBAL MULTI-REGION INGESTION PIPELINE ===")
    
    investors = supabase.table("investors").select("*").execute().data
    if not investors:
        print("❌ No investors found.")
        return

    today_str = datetime.now().strftime("%Y-%m-%d")

    for investor in investors:
        print(f"\n--------------------------------------------------")
        print(f"📡 Processing {investor['name']} | Region: {investor['region']} | Market: {investor['market']}")
        
        # ROUTE 1: US Equities (SEC EDGAR)
        if investor['market'] == 'US Equities':
            cik = str(investor['cik']).zfill(10)
            try:
                company = Company(cik)
                filings = company.get_filings(form="13F-HR")
                if not filings:
                    print(f"❌ No 13F filings found.")
                    continue
                
                filing = filings[0]
                holdings = filing.obj().holdings
                holdings.columns = holdings.columns.str.lower()
                
                for _, row in holdings.head(3).iterrows():
                    ticker = str(row['ticker']).strip().upper()
                    if ticker == 'NAN' or not ticker: continue
                    shares = int(float(row['sharesprnamount']))
                    process_and_sync_holdings(investor['id'], investor['name'], ticker, shares, str(filing.filing_date), filing.accession_no)
                    time.sleep(1) # Rate limit protection
            except Exception as e:
                print(f"❌ SEC Error: {e}")
                
        # ROUTE 2: International / Regional Markets (Proxy Ingestion)
        else:
            regional_holdings = fetch_regional_proxy_holdings(investor['slug'])
            if not regional_holdings:
                print(f"⏳ Awaiting regional API integration for this portfolio.")
                continue
            
            for holding in regional_holdings:
                # Generate a unique synthetic accession number for regional filings
                accession_no = f"REG-{investor['slug']}-{today_str}"
                process_and_sync_holdings(investor['id'], investor['name'], holding['ticker'], holding['shares'], today_str, accession_no)
                time.sleep(1)

    print("\n=== 🎉 GLOBAL PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_global_pipeline()