import os
import time
import requests
import contextlib
import io
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
    elif current_shares == 0:
        action = "🔴 EXITED POSITION"
    else:
        diff = current_shares - prev_shares
        pct = (diff / prev_shares) * 100
        action = f"🟢 ADDED (+{pct:.1f}%)" if diff > 0 else f"🔴 TRIMMED ({pct:.1f}%)"

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
    
    # Resilient Retry Loop to prevent 429 Rate-Limits & 502 Bad Gateway failures
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.post(url, json=payload, timeout=12)
            if response.status_code == 200:
                print(f"  📢 Alert Broadcasted: {investor_name} {action} {asset_display}")
                time.sleep(1.2)  # Controlled rate-limit delay
                return
            elif response.status_code == 429:
                retry_after = response.json().get("parameters", {}).get("retry_after", 5)
                print(f"  ⚠️ Telegram Rate Limit (429). Backing off for {retry_after + 1}s...")
                time.sleep(retry_after + 1)
            elif response.status_code in [502, 503, 504]:
                print(f"  ⚠️ Telegram Gateway Error ({response.status_code}). Retrying ({attempt + 1}/{max_retries})...")
                time.sleep(3)
            else:
                print(f"  ❌ Telegram API Error ({response.status_code}): {response.text}")
                return
        except requests.exceptions.RequestException as e:
            print(f"  ⚠️ Network Timeout/Error: {e}. Retrying ({attempt + 1}/{max_retries})...")
            time.sleep(3)

def get_real_volatility(ticker: str):
    try:
        # Standardize dual-class tickers for Yahoo Finance (e.g., LENB -> LEN-B)
        yf_ticker = ticker
        if len(ticker) == 5 and ticker.endswith(('A', 'B', 'K')):
            yf_ticker = f"{ticker[:-1]}-{ticker[-1]}"
            
        # Suppress yfinance stdout/stderr printing
        with contextlib.redirect_stderr(io.StringIO()):
            stock = yf.Ticker(yf_ticker)
            hist = stock.history(period="90d")
            
        if not hist.empty and len(hist) >= 45:
            hist['Returns'] = hist['Close'].pct_change()
            vol_90d = hist['Returns'].std() * np.sqrt(252)
            if not np.isnan(vol_90d):
                return round(float(vol_90d * 100), 2)
        return None
    except Exception:
        return None

def process_merged_portfolio(investor_id, investor_name, cik, target_filings, latest_period):
    """Processes base filings and amendments chronologically to build a unified portfolio view."""
    merged_portfolio = {}
    latest_accession = target_filings[-1].accession_no
    report_date = str(latest_period)
    
    latest_filing_date_obj = datetime.strptime(str(target_filings[-1].filing_date), "%Y-%m-%d")
    is_historical = latest_filing_date_obj < (datetime.now() - timedelta(days=90))
    
    if is_historical:
        print(f"  🕰️ Historical period detected ({report_date}). Ingesting data but suppressing Telegram alerts.")
        
    clean_accession = latest_accession.replace("-", "")
    sec_url = f"https://www.sec.gov/Archives/edgar/data/{str(cik).lstrip('0')}/{clean_accession}/{latest_accession}-index.html"

    # Check database to see if history exists for this investor (Initial Seeding Protection)
    existing_history_count = supabase.table("holdings_history")\
        .select("id", count="exact")\
        .eq("investor_id", investor_id)\
        .execute().count or 0

    is_initial_seed = existing_history_count == 0
    if is_initial_seed:
        print(f"  🌱 Initial Seeding detected for {investor_name}. Suppressing bulk initial alerts.")

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
                
                merged_portfolio[(ticker, put_call, sec_type)] = shares
        except Exception as e:
            print(f"  ⚠️ Error parsing holdings for accession {filing.accession_no}: {e}")

    # 2. STATE CLEANUP: Purge current snapshot view to mirror unified portfolio
    supabase.table("filings").delete().eq("investor_id", investor_id).execute()

    # 3. DETECT FULL EXITS: Query positions held in the immediate prior quarter
    prior_period_query = supabase.table("holdings_history")\
        .select("ticker, put_call, security_type, shares_held")\
        .eq("investor_id", investor_id)\
        .lt("period_of_report", report_date)\
        .order("period_of_report", desc=True)\
        .execute()

    if prior_period_query.data:
        prior_tickers = {}
        for row in prior_period_query.data:
            key = (row['ticker'], row.get('put_call') or '', row.get('security_type') or 'SH')
            # Store the shares if this is the most recent prior record
            if key not in prior_tickers and row['shares_held'] > 0:
                prior_tickers[key] = row['shares_held']

        # Check for assets held previously that are missing from current merged_portfolio
        for (p_ticker, p_put_call, p_sec_type), p_shares in prior_tickers.items():
            if (p_ticker, p_put_call, p_sec_type) not in merged_portfolio:
                print(f"  🔴 EXITED POSITION DETECTED: {p_ticker} (Was {p_shares:,} shares -> Now 0)")
                
                # Record zero-share exit in history
                supabase.table("holdings_history").upsert({
                    "investor_id": investor_id,
                    "ticker": p_ticker,
                    "put_call": p_put_call,
                    "security_type": p_sec_type,
                    "shares_held": 0,
                    "period_of_report": report_date,
                    "filing_accession": latest_accession,
                    "data_source": "sec_edgar"
                }, on_conflict="investor_id, ticker, period_of_report, filing_accession, put_call, security_type").execute()

                # Trigger Exit Webhook if not historical/initial seed
                if not is_historical and not is_initial_seed:
                    send_delta_alert(investor_name, p_ticker, p_put_call, p_sec_type, 0, p_shares, report_date, sec_url)

    # 4. DB UPSERT & ALERTS LOOP FOR CURRENT POSITIONS
    for (ticker, put_call, sec_type), shares in merged_portfolio.items():
        instrument_label = put_call if put_call else "COMMON"
        print(f"  🔍 Processing {ticker} | Type: {instrument_label} | Total: {shares:,}")
        
        # QUERY HISTORY: Fetch prior period for delta math
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

        # UPSERT HISTORY
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

        # UPSERT FILINGS
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

        # FIRE WEBHOOK: Suppress if historical or during initial baseline seeding
        if not is_historical and not is_initial_seed:
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
                
            all_filings.sort(key=lambda x: str(x.period_of_report), reverse=True)
            latest_period = all_filings[0].period_of_report
            
            target_filings = [f for f in all_filings if f.period_of_report == latest_period]
            target_filings.sort(key=lambda x: str(x.filing_date))
            
            process_merged_portfolio(investor['id'], investor['name'], investor['cik'], target_filings, latest_period)
            
        except Exception as e:
            print(f"❌ SEC Fetch Error for {investor['name']}: {e}")

    print("\n=== 🎉 SEC INGESTION PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_pipeline()