import os
import time
import requests
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from edgar import set_identity, Company
from supabase import create_client, Client
from dotenv import load_dotenv, find_dotenv

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

def process_sec_filing(investor_id, investor_name, cik, filing):
    try:
        holdings = filing.obj().holdings
        holdings.columns = holdings.columns.str.lower()
        
        # 1. FIX: Do NOT drop options. Extract the exact instrument type instead.
        if 'putcall' not in holdings.columns:
            holdings['putcall'] = ''
        if 'sshprnamttype' not in holdings.columns:
            holdings['sshprnamttype'] = 'SH'
            
        # Clean strings to prevent grouping errors (e.g., 'Put', 'PUT ', 'put')
        holdings['putcall'] = holdings['putcall'].fillna('').astype(str).str.strip().str.upper()
        holdings['sshprnamttype'] = holdings['sshprnamttype'].fillna('SH').astype(str).str.strip().str.upper()
            
        report_date = str(filing.period_of_report)
        accession_no = filing.accession_no
        
        clean_accession = accession_no.replace("-", "")
        sec_url = f"https://www.sec.gov/Archives/edgar/data/{str(cik).lstrip('0')}/{clean_accession}/{accession_no}-index.html"
        
        filing_date_obj = datetime.strptime(str(filing.filing_date), "%Y-%m-%d")
        is_historical = filing_date_obj < (datetime.now() - timedelta(days=90))
        if is_historical:
            print(f"  🕰️ Historical filing detected ({filing.filing_date}). Ingesting data but suppressing Telegram alerts.")
        
        # 2. AGGREGATE: Group by Ticker + Option Type + Asset Type to ensure Puts/Calls don't overwrite Stock
        agg_holdings = holdings.groupby(['ticker', 'putcall', 'sshprnamttype'])['sharesprnamount'].sum().reset_index()

        for _, row in agg_holdings.iterrows():
            ticker = str(row['ticker']).strip().upper()
            if ticker == 'NAN' or not ticker: continue
            
            put_call = row['putcall']
            sec_type = row['sshprnamttype']
            shares = int(float(row['sharesprnamount']))
            
            instrument_label = put_call if put_call else "COMMON"
            print(f"  🔍 Processing {ticker} | Type: {instrument_label} | Total: {shares:,}")
            
            # 3. QUERY HISTORY: Fetch exact match (Ticker + PutCall + SecType)
            prev_record = supabase.table("holdings_history")\
                .select("shares_held")\
                .eq("investor_id", investor_id)\
                .eq("ticker", ticker)\
                .eq("put_call", put_call)\
                .eq("security_type", sec_type)\
                .order("period_of_report", desc=True)\
                .limit(1).execute()
                
            prev_shares = prev_record.data[0]['shares_held'] if prev_record.data else 0

            # 4. UPSERT HISTORY: Uses new composite unique constraint
            supabase.table("holdings_history").upsert({
                "investor_id": investor_id,
                "ticker": ticker,
                "put_call": put_call,
                "security_type": sec_type,
                "shares_held": shares,
                "period_of_report": report_date,
                "filing_accession": accession_no,
                "data_source": "sec_edgar"
            }, on_conflict="investor_id, ticker, period_of_report, filing_accession, put_call, security_type").execute()

            # 5. UPSERT FILINGS: Uses new composite unique constraint
            filing_response = supabase.table("filings").upsert({
                "investor_id": investor_id,
                "filing_accession": accession_no,
                "ticker": ticker,
                "put_call": put_call,
                "security_type": sec_type,
                "shares_held": shares,
                "report_date": report_date,
                "data_source": "sec_edgar"
            }, on_conflict="investor_id, filing_accession, ticker, put_call, security_type").execute()

            # 6. UPSERT METRICS
            vol_90d = get_real_volatility(ticker)
            is_estimated = vol_90d is None
            
            if filing_response.data:
                supabase.table("metrics").upsert({
                    "filing_id": filing_response.data[0]['id'], 
                    "ticker": ticker, 
                    "volatility_90d": vol_90d if vol_90d else 0.0,
                    "vol_is_estimated": is_estimated
                }, on_conflict="filing_id, ticker").execute()

            # 7. FIRE WEBHOOK
            if not is_historical:
                send_delta_alert(investor_name, ticker, put_call, sec_type, shares, prev_shares, report_date, sec_url)
            
    except Exception as e:
        print(f"  ❌ Error processing portfolio for {investor_name}: {e}")

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
            latest_filing = all_filings[0]
            
            process_sec_filing(investor['id'], investor['name'], investor['cik'], latest_filing)
            
        except Exception as e:
            print(f"❌ SEC Fetch Error for {investor['name']}: {e}")

    print("\n=== 🎉 SEC INGESTION PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_pipeline()