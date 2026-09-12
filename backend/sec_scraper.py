import os
import time
import pandas as pd
import yfinance as yf
import numpy as np
from edgar import set_identity, Company
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mandatory SEC Identity to prevent IP bans
set_identity("System Admin admin@uyologistics.com")

def calculate_volatility(ticker: str):
    """Calculates annualized 90-day volatility."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="90d")
        if hist.empty: return None
        
        hist['Returns'] = hist['Close'].pct_change()
        vol_90d = hist['Returns'].std() * np.sqrt(252)
        return round(vol_90d * 100, 2)
    except Exception as e:
        print(f"Volatility error for {ticker}: {e}")
        return None

def fetch_berkshire_filings():
    print("Connecting to SEC EDGAR API for Berkshire Hathaway...")
    company = Company("0001067983") # Warren Buffett's CIK
    
    filings_collection = company.get_filings(form="13F-HR")
    
    if not filings_collection:
        print("No recent 13F filings found.")
        return

    filing = filings_collection[0]
    holdings = filing.obj().holdings
    
    # Standardize all columns to lowercase to prevent case-sensitivity errors
    holdings.columns = holdings.columns.str.lower()
    
    print(f"\nFiling found! Processing top 5 holdings to respect API limits...")
    
    for index, row in holdings.head(5).iterrows():
        # Use the newly discovered clean columns
        ticker = str(row['ticker']).strip()
        shares = int(float(row['sharesprnamount']))
        
        # Skip if the asset doesn't have a public ticker (e.g., private bonds/cash)
        if ticker.lower() == 'nan' or not ticker:
            print(f"\nSkipping unlisted asset: {row.get('issuer', 'Unknown')}")
            continue
            
        print(f"\nAnalyzing: {ticker} | Shares: {shares:,}")
        
        # 1. Calculate Volatility
        vol_90d = calculate_volatility(ticker)
        if vol_90d:
            print(f"Calculated 90-day Volatility: {vol_90d}%")
        else:
            print("Could not calculate volatility (likely an unlisted or fixed-income asset).")
        
        # 2. Push to Supabase Filings Table
        filing_data = {
            "filing_accession": filing.accession_no,
            "ticker": ticker,
            "shares_held": shares,
            "report_date": str(filing.filing_date)
        }
        
        try:
            supabase.table("filings").insert(filing_data).execute()
            print(f"✅ Successfully inserted {ticker} into Supabase!")
        except Exception as e:
            # Check if it failed because it's a duplicate (our SQL unique constraint working)
            if 'duplicate key value' in str(e):
                print(f"⚠️ {ticker} already exists in database (Deduplication successful).")
            else:
                print(f"❌ Database insert failed for {ticker}: {e}")
            
        # Crucial: Sleep to avoid Yahoo Finance rate limits
        time.sleep(1.5)

if __name__ == "__main__":
    fetch_berkshire_filings()