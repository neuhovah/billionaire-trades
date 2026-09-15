import os
import time
import pandas as pd
import yfinance as yf
import numpy as np
from edgar import set_identity, Company
from supabase import create_client, Client
from dotenv import load_dotenv

# 1. Load & Validate Environment Variables
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("CRITICAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mandatory SEC Identity header to prevent IP throttle/bans
set_identity("System Admin admin@uyologistics.com")


def calculate_volatility(ticker: str) -> float | None:
    """Calculates annualized 90-day volatility for a given ticker using Yahoo Finance."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="90d")
        
        if hist.empty or len(hist) < 10:
            return None
        
        hist['Returns'] = hist['Close'].pct_change()
        vol_90d = hist['Returns'].std() * np.sqrt(252)
        
        if np.isnan(vol_90d):
            return None
            
        return round(float(vol_90d * 100), 2)
    except Exception as e:
        print(f"⚠️ Volatility calculation error for {ticker}: {e}")
        return None


def sync_multi_investor_filings():
    print("=== STARTING MULTI-INVESTOR SEC EDGAR PIPELINE ===")
    
    # 1. Fetch all tracked institutional investors from Supabase
    try:
        investors_res = supabase.table("investors").select("*").execute()
        investors = investors_res.data
    except Exception as e:
        print(f"❌ Failed to fetch investors from Supabase: {e}")
        return

    if not investors:
        print("❌ No investors found in the database. Please run the migration SQL first.")
        return

    # 2. Loop through each billionaire portfolio manager
    for investor in investors:
        investor_id = investor['id']
        investor_name = investor['name']
        cik = str(investor['cik']).zfill(10)
        
        print(f"\n--------------------------------------------------")
        print(f"📡 Connecting to SEC EDGAR API for {investor_name} (CIK: {cik})...")
        
        try:
            company = Company(cik)
            filings_collection = company.get_filings(form="13F-HR")
            
            if not filings_collection:
                print(f"❌ No recent 13F filings found for {investor_name}.")
                continue

            filing = filings_collection[0]
            holdings = filing.obj().holdings
            
            if holdings is None or holdings.empty:
                print(f"⚠️ Holdings data is empty for {investor_name}.")
                continue

            # Standardize column headers to lowercase to prevent key errors
            holdings.columns = holdings.columns.str.lower()
            
            print(f"📄 Filing found ({filing.accession_no})! Processing top holdings...")
            
            for index, row in holdings.head(5).iterrows():
                ticker = str(row['ticker']).strip().upper()
                
                # Skip unlisted or non-equity assets
                if ticker.lower() == 'nan' or not ticker:
                    print(f"Skipping unlisted asset: {row.get('issuer', 'Unknown')}")
                    continue

                try:
                    shares = int(float(row['sharesprnamount']))
                except (ValueError, TypeError):
                    print(f"⚠️ Invalid share count for {ticker}, skipping.")
                    continue
                
                print(f"  🔍 Analyzing Ticker: ${ticker} | Shares: {shares:,}")
                
                # 3. Calculate 90-Day Volatility
                vol_90d = calculate_volatility(ticker)
                if vol_90d is not None:
                    print(f"  📈 90-Day Annualized Volatility: {vol_90d}%")
                else:
                    print("  ⚠️ Volatility unavailable (unlisted or fixed-income asset).")
                
                # 4. Synchronize Filing with Supabase (including investor_id relationship)
                filing_data = {
                    "investor_id": investor_id,
                    "filing_accession": filing.accession_no,
                    "ticker": ticker,
                    "shares_held": shares,
                    "report_date": str(filing.filing_date)
                }
                
                try:
                    filing_response = supabase.table("filings").upsert(
                        filing_data,
                        on_conflict="filing_accession, ticker"
                    ).execute()
                    
                    if filing_response.data and len(filing_response.data) > 0:
                        filing_id = filing_response.data[0]['id']
                        print(f"  ✅ Indexed filing for ${ticker} (ID: {filing_id})")

                        # 5. Upsert into 'metrics' table referencing the filing_id
                        if vol_90d is not None:
                            metric_data = {
                                "filing_id": filing_id,
                                "ticker": ticker,
                                "volatility_90d": vol_90d
                            }
                            supabase.table("metrics").upsert(
                                metric_data,
                                on_conflict="filing_id, ticker"
                            ).execute()
                            print(f"  ✅ Upserted volatility metric ({vol_90d}%)")
                    else:
                        print(f"  ⚠️ Could not retrieve filing record ID for ${ticker}.")

                except Exception as db_err:
                    print(f"  ❌ Database synchronization failed for ${ticker}: {db_err}")
                    
                # Rate-limiting sleep between ticker lookups to protect external APIs
                time.sleep(1.0)

        except Exception as api_err:
            print(f"❌ Error processing SEC filings for {investor_name}: {api_err}")
            continue

    print("\n=== 🎉 MULTI-INVESTOR PIPELINE COMPLETED SUCCESSFULLY ===")


if __name__ == "__main__":
    sync_multi_investor_filings()