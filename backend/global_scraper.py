import os
import time
import requests
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from edgar import set_identity, Company
from supabase import create_client, Client
from dotenv import load_dotenv, find_dotenv

# Load Environment Variables from root
load_dotenv(find_dotenv())
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") 

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("CRITICAL: Supabase Service Role credentials missing in .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
set_identity("Nsikan Eno Uso-essien admin@uyologistics.com")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHANNEL_ID = os.environ.get("TELEGRAM_CHANNEL_ID")

if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHANNEL_ID:
    raise ValueError("CRITICAL: Telegram credentials missing. Update .env file.")

def send_delta_alert(investor_name: str, ticker: str, put_call: str, sec_type: str, current_shares: int, prev_shares: int, report_date: str, sec_url: str):
    if current_shares == prev_shares:
        return

    if prev_shares == 0:
        action = "🟢 NEW POSITION"
    else:
        diff = current_shares - prev_shares
        pct = (diff / prev_shares) * 100
        action = f"🟢 ADDED (+{pct:.1f}%)" if diff > 0 else f"🔴 TRIMMED ({pct:.1f}%)"

    # Format the asset label to explicitly call out Puts/Calls vs Common Stock
    asset_display = f"${ticker}"
    shares_label = "Shares"
    
    if put_call:
        asset_display += f" — {put_call} OPTION"
        shares_label = f"Underlying {sec_type}"
    elif sec_type == 'PRN':
        asset_display += " — PRINCIPAL DEBT"
        shares_label = "Principal Amount"

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    message = (
        f"🚨 *Institutional 13F Delta: {investor_name}*\n\n"
        f"🏢 *Asset:* `{asset_display}`\n"
        f"⚡ *Action:* `{action}`\n"
        f"📊 *Current {shares_label}:* `{current_shares:,}` (was {prev_shares:,})\n"
        f"📅 *Period:* `{report_date}`\n\n"
        f"🔗 *Verify SEC EDGAR Filing:*\n{sec_url}"
    )
    
    payload = {
        "chat_id": TELEGRAM_CHANNEL_ID,
        "text": message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"  📢 Alert Broadcasted: {investor_name} {action} {asset_display}")
            time.sleep(3.5)
        else:
            print(f"  ❌ Telegram API Error: {response.text}")
    except Exception as e:
        print(f"  ❌ Connection Failed: {e}")

def get_real_volatility(ticker: str):
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="90d")
        if not hist.empty and len(hist) >= 45:
            hist['Returns'] = hist['Close'].pct_change()
            vol_90d = hist['Returns'].std() * np.sqrt(252)
            if not np.isnan(vol_90d):
                return round(float(vol_90d * 100), 2)
        return None
    except Exception as e:
        print(f"  ⚠️ Volatility calculation error for {ticker}: {e}")
        return None

def process_merged_portfolio(investor_id, investor_name, cik, target_filings, latest_period):
    """Processes base filings and amendments chronologically to build a unified portfolio view."""
    merged_portfolio = {}
    latest_accession = target_filings[-1].accession_no
    report_date = str(latest_period)
    
    # Use the filing date of the MOST RECENT amendment for historical drift protection
    latest_filing_date_obj = datetime.strptime(str(target_filings[-1].filing_date), "%Y-%m-%d")
    is_historical = latest_filing_date_obj < (datetime.now() - timedelta(days=90))
    
    if is_historical:
        print(f"  🕰️ Historical period detected ({report_date}). Ingesting data but suppressing Telegram alerts.")
        
    clean_accession = latest_accession.replace("-", "")
    sec_url = f"https://www.sec.gov/Archives/edgar/data/{str(cik).lstrip('0')}/{clean_accession}/{latest_accession}-index.html"

    # 1. MERGE LOGIC: Chronologically overlay base filings and amendments
    for filing in target_filings:
        try:
            holdings = filing.obj().holdings
            if holdings is None or holdings.empty:
                continue
                
            holdings.columns = holdings.columns.str.lower()
            
            if 'putcall' not in holdings.columns:
                holdings['putcall'] = ''
            if 'sshprnamttype' not in holdings.columns:
                holdings['sshprnamttype'] = 'SH'
                
            holdings['putcall'] = holdings['putcall'].fillna('').astype(str).str.strip().str.upper()
            holdings['sshprnamttype'] = holdings['sshprnamttype'].fillna('SH').astype(str).str.strip().str.upper()
            
            agg_holdings = holdings.groupby(['ticker', 'putcall', 'sshprnamttype'])['sharesprnamount'].sum().reset_index()
            
            for _, row in agg_holdings.iterrows():
                ticker = str(row['ticker']).strip().upper()
                if ticker == 'NAN' or not ticker: continue
                put_call = row['putcall']
                sec_type = row['sshprnamttype']
                shares = int(float(row['sharesprnamount']))
                
                # Overwrites base data with amendment data if it's a restatement, or adds it if it's a new addition
                merged_portfolio[(ticker, put_call, sec_type)] = shares
        except Exception as e:
            print(f"  ⚠️ Error parsing holdings for accession {filing.accession_no}: {e}")

    # 2. STATE CLEANUP: Purge old snapshot data to prevent ghost duplicates from previous quarters
    # This guarantees the `filings` table ONLY holds the absolute latest unified portfolio
    supabase.table("filings").delete().eq("investor_id", investor_id).execute()

    # 3. DB UPSERT & ALERTS LOOP
    for (ticker, put_call, sec_type), shares in merged_portfolio.items():
        instrument_label = put_call if put_call else "COMMON"
        print(f"  🔍 Processing {ticker} | Type: {instrument_label} | Total: {shares:,}")
        
        # QUERY HISTORY: Delta Math requires previous quarter (strictly less than current report_date)
        prev_record = supabase.table("holdings_history")\
            .select("shares_held")\
            .eq("investor_id", investor_id)\
            .eq("ticker", ticker)\
            .eq("put_call", put_call)\
            .eq("security_type", sec_type)\
            .lt("period_of_report", report_date)\
            .order("period_of_report", desc=True)\
            .limit(1).execute()
            
        prev_shares = prev_record.data[0]['shares_held'] if prev_record.data else 0

        # UPSERT HISTORY: Append to Immutable Log
        supabase.table("holdings_history").upsert({
            "investor_id": investor_id,
            "ticker": ticker,
            "put_call": put_call,
            "security_type": sec_type,
            "shares_held": shares,
            "period_of_report": report_date,
            "filing_accession": latest_accession,
            "data_source": "sec_edgar"
        }, on_conflict="investor_id, ticker, period_of_report, filing_accession, put_call, security_type").execute()

        # UPSERT FILINGS: Update Current State View
        filing_response = supabase.table("filings").upsert({
            "investor_id": investor_id,
            "filing_accession": latest_accession,
            "ticker": ticker,
            "put_call": put_call,
            "security_type": sec_type,
            "shares_held": shares,
            "report_date": report_date,
            "data_source": "sec_edgar"
        }, on_conflict="investor_id, filing_accession, ticker, put_call, security_type").execute()

        # UPSERT METRICS
        vol_90d = get_real_volatility(ticker)
        is_estimated = vol_90d is None
        
        if filing_response.data:
            supabase.table("metrics").upsert({
                "filing_id": filing_response.data[0]['id'], 
                "ticker": ticker, 
                "volatility_90d": vol_90d if vol_90d else 0.0,
                "vol_is_estimated": is_estimated
            }, on_conflict="filing_id, ticker").execute()

        # FIRE WEBHOOK
        if not is_historical:
            send_delta_alert(investor_name, ticker, put_call, sec_type, shares, prev_shares, report_date, sec_url)

def run_pipeline():
    print("=== STARTING STRICT SEC EDGAR INGESTION PIPELINE ===")
    
    investors = supabase.table("investors").select("*").eq("market", "US Equities").execute().data

    if not investors:
        print("❌ No SEC-regulated investors found in database.")
        return

    for investor in investors:
        print(f"\n--------------------------------------------------")
        print(f"📡 Processing {investor['name']} | Market: {investor['market']}")
        try:
            company = Company(str(investor['cik']).zfill(10))
            
            filings_standard = company.get_filings(form="13F-HR")
            filings_amended = company.get_filings(form="13F-HR/A")
            
            all_filings = []
            if filings_standard: all_filings.extend(list(filings_standard))
            if filings_amended: all_filings.extend(list(filings_amended))
            
            if not all_filings:
                print(f"  ⚠️ No active 13F filings found. Skipping.")
                continue
                
            # ENTERPRISE FIX: Group by period_of_report to process base filings AND their amendments
            all_filings.sort(key=lambda x: str(x.period_of_report), reverse=True)
            latest_period = all_filings[0].period_of_report
            
            # Isolate all filings strictly for this latest reporting period
            target_filings = [f for f in all_filings if f.period_of_report == latest_period]
            
            # Sort chronologically by filing date so base filings are processed *before* amendments
            target_filings.sort(key=lambda x: str(x.filing_date))
            
            process_merged_portfolio(investor['id'], investor['name'], investor['cik'], target_filings, latest_period)
            
        except Exception as e:
            print(f"❌ SEC Fetch Error for {investor['name']}: {e}")

    print("\n=== 🎉 SEC INGESTION PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_pipeline()