import os
import time
import requests
import numpy as np
import yfinance as yf
from datetime import datetime, timezone
from edgar import set_identity, Company
from supabase import create_client, Client
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
# STRICT REQUIREMENT: Must use Service Role Key to bypass RLS for backend writing
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") 

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("CRITICAL: Supabase Service Role credentials missing in .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# SEC Identity (Required for compliant EDGAR scraping)
set_identity("Nsikan Eno Uso-essien admin@uyologistics.com")

# Telegram VIP Channel Webhook Configuration (No hardcoded fallbacks allowed)
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHANNEL_ID = os.environ.get("TELEGRAM_CHANNEL_ID")

if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHANNEL_ID:
    raise ValueError("CRITICAL: Telegram credentials missing. Update .env file.")

def send_delta_alert(investor_name: str, ticker: str, current_shares: int, prev_shares: int, report_date: str):
    """Fires a Telegram alert ONLY when a position size changes quarter-over-quarter."""
    if current_shares == prev_shares:
        return  # Suppress alert for completely unchanged positions

    if prev_shares == 0:
        action = "🟢 NEW POSITION"
        change_pct = "N/A"
    else:
        diff = current_shares - prev_shares
        pct = (diff / prev_shares) * 100
        action = f"🟢 ADDED (+{pct:.1f}%)" if diff > 0 else f"🔴 TRIMMED ({pct:.1f}%)"

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    message = (
        f"🚨 *Institutional Delta Alert: {investor_name}*\n\n"
        f"🏢 *Asset:* `${ticker}`\n"
        f"⚡ *Action:* `{action}`\n"
        f"📊 *Current Shares:* `{current_shares:,}` (was {prev_shares:,})\n"
        f"📅 *Period:* `{report_date}`"
    )
    
    payload = {
        "chat_id": TELEGRAM_CHANNEL_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"  📢 Alert Broadcasted: {investor_name} {action} {ticker}")
            time.sleep(3.5)  # Strict Telegram API rate limit protection (max 20 msgs/min)
        else:
            print(f"  ❌ Telegram API Error: {response.text}")
    except Exception as e:
        print(f"  ❌ Connection Failed: {e}")

def get_real_volatility(ticker: str):
    """Calculates actual volatility. Returns None if data is missing or insufficient."""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="90d")
        
        # Require a statistically significant sample size (approx. 2 months of trading days)
        if not hist.empty and len(hist) >= 45:
            hist['Returns'] = hist['Close'].pct_change()
            vol_90d = hist['Returns'].std() * np.sqrt(252)
            if not np.isnan(vol_90d):
                return round(float(vol_90d * 100), 2)
        return None
    except Exception as e:
        print(f"  ⚠️ Volatility calculation error for {ticker}: {e}")
        return None

def process_sec_filing(investor_id, investor_name, filing):
    """Parses a valid 13F filing with strict filtering for pure long equity common stock."""
    try:
        holdings = filing.obj().holdings
        holdings.columns = holdings.columns.str.lower()
        
        # 1. ENTERPRISE FILTERING: Remove Options (Puts/Calls) and Debt (PRN)
        if 'putcall' in holdings.columns:
            holdings = holdings[holdings['putcall'].isnull() | (holdings['putcall'] == '')]
        if 'sshprnamttype' in holdings.columns:
            holdings = holdings[holdings['sshprnamttype'] == 'SH']
            
        report_date = str(filing.period_of_report)
        accession_no = filing.accession_no
        
        # 2. AGGREGATE: Group by ticker to sum shares (handles multi-manager overlapping rows)
        agg_holdings = holdings.groupby('ticker')['sharesprnamount'].sum().reset_index()

        for _, row in agg_holdings.iterrows():
            ticker = str(row['ticker']).strip().upper()
            if ticker == 'NAN' or not ticker: continue
            
            shares = int(float(row['sharesprnamount']))
            print(f"  🔍 Processing {ticker} | Total Shares: {shares:,}")
            
            # 3. QUERY HISTORY: Fetch previous quarter's shares for Delta Math
            prev_record = supabase.table("holdings_history")\
                .select("shares_held")\
                .eq("investor_id", investor_id)\
                .eq("ticker", ticker)\
                .order("period_of_report", desc=True)\
                .limit(1).execute()
                
            prev_shares = prev_record.data[0]['shares_held'] if prev_record.data else 0

            # 4. UPSERT HISTORY: Append to Immutable Log
            supabase.table("holdings_history").upsert({
                "investor_id": investor_id,
                "ticker": ticker,
                "shares_held": shares,
                "period_of_report": report_date,
                "filing_accession": accession_no,
                "data_source": "sec_edgar"
            }, on_conflict="investor_id, ticker, period_of_report, filing_accession").execute()

            # 5. UPSERT FILINGS: Update Current State View
            filing_response = supabase.table("filings").upsert({
                "investor_id": investor_id,
                "filing_accession": accession_no,
                "ticker": ticker,
                "shares_held": shares,
                "report_date": report_date,
                "data_source": "sec_edgar"
            }, on_conflict="filing_accession, ticker").execute()

            # 6. UPSERT METRICS: Record True Volatility (Flagging if absent)
            vol_90d = get_real_volatility(ticker)
            is_estimated = vol_90d is None
            
            if filing_response.data:
                supabase.table("metrics").upsert({
                    "filing_id": filing_response.data[0]['id'], 
                    "ticker": ticker, 
                    "volatility_90d": vol_90d if vol_90d else 0.0,
                    "vol_is_estimated": is_estimated
                }, on_conflict="filing_id, ticker").execute()

            # 7. FIRE WEBHOOK: Only alert if the position changed QoQ
            send_delta_alert(investor_name, ticker, shares, prev_shares, report_date)
            
    except Exception as e:
        print(f"  ❌ Error processing portfolio for {investor_name}: {e}")

def run_pipeline():
    print("=== STARTING STRICT SEC EDGAR INGESTION PIPELINE ===")
    
    # Isolate ingestion strictly to verified SEC-regulated entities
    investors = supabase.table("investors").select("*").eq("market", "US Equities").execute().data

    if not investors:
        print("❌ No SEC-regulated investors found in database.")
        return

    for investor in investors:
        print(f"\n--------------------------------------------------")
        print(f"📡 Processing {investor['name']} | Market: {investor['market']}")
        try:
            company = Company(str(investor['cik']).zfill(10))
            
            # Fetch both standard 13F-HR and amendments 13F-HR/A
            filings_standard = company.get_filings(form="13F-HR")
            filings_amended = company.get_filings(form="13F-HR/A")
            
            all_filings = []
            if filings_standard: all_filings.extend(list(filings_standard))
            if filings_amended: all_filings.extend(list(filings_amended))
            
            if not all_filings:
                print(f"  ⚠️ No active 13F filings found. Skipping.")
                continue
                
            # ENTERPRISE FIX: Sort by period_of_report to accurately apply older quarter amendments
            all_filings.sort(key=lambda x: str(x.period_of_report), reverse=True)
            latest_filing = all_filings[0]
            
            process_sec_filing(investor['id'], investor['name'], latest_filing)
            
        except Exception as e:
            print(f"❌ SEC Fetch Error for {investor['name']}: {e}")

    print("\n=== 🎉 SEC INGESTION PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_pipeline()