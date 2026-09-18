import os
import time
import requests
import pandas as pd
from edgar import set_identity, Company
from supabase import create_client, Client
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Strict write access

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("CRITICAL: Supabase Service Role credentials missing in .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
set_identity("Nsikan Eno Uso-essien admin@uyologistics.com")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHANNEL_ID = os.environ.get("TELEGRAM_CHANNEL_ID")

if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHANNEL_ID:
    raise ValueError("CRITICAL: Telegram credentials missing. Update .env file.")

def send_form4_alert(investor_name, ticker, tx_code, shares, price, total_value, tx_date, accession_no):
    """Fires a high-frequency Telegram alert for real-time Insider Transactions."""
    action = "🟢 INSIDER BUY (Open Market)" if tx_code == "P" else "🔴 INSIDER SELL (Open Market)"
    
    message = (
        f"🚨 *Form 4 Real-Time Signal: {investor_name}*\n\n"
        f"🏢 *Asset:* `${ticker}`\n"
        f"⚡ *Action:* `{action}`\n"
        f"📊 *Shares Traded:* `{shares:,}`\n"
        f"💵 *Average Price:* `${price:,.2f}`\n"
        f"💰 *Total Value:* `${total_value:,.2f}`\n"
        f"📅 *Date:* `{tx_date}`\n"
        f"🔗 *Accession:* `{accession_no}`"
    )
    
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHANNEL_ID, "text": message, "parse_mode": "Markdown"},
            timeout=10
        )
        if response.status_code == 200:
            print(f"  📢 Form 4 Alert Broadcasted: {investor_name} {action} {ticker}")
            time.sleep(3.5)  # Strict Telegram API rate limit protection (max 20 msgs/min)
        else:
            print(f"  ❌ Telegram API Error: {response.text}")
    except Exception as e:
        print(f"  ❌ Connection Failed: {e}")

def run_form4_pipeline():
    print("=== STARTING FORM 4 INSIDER TRANSACTIONS PIPELINE ===")
    
    # We only scan verified SEC-regulated entities
    investors = supabase.table("investors").select("*").eq("market", "US Equities").execute().data

    for investor in investors:
        print(f"\n📡 Monitoring Insider Trades for {investor['name']}")
        try:
            company = Company(str(investor['cik']).zfill(10))
            
            # Fetch Form 4 (Statement of Changes in Beneficial Ownership)
            filings = company.get_filings(form="4")
            
            if not filings:
                print("  ⚠️ No Form 4 filings found. Skipping.")
                continue
                
            # Scan the 5 most recent Form 4 filings to catch fast-moving trades
            recent_filings = filings.head(5)
            
            for filing in recent_filings:
                accession_no = filing.accession_no
                
                # Deduplication: Check if this trade was already processed and alerted
                existing = supabase.table("insider_transactions").select("id").eq("filing_accession", accession_no).execute()
                if existing.data:
                    continue
                
                # Parse the Form 4 XML into structured data
                form4 = filing.obj()
                
                # Extract Issuer Ticker safely
                ticker = getattr(form4, 'issuer', 'UNKNOWN')
                if hasattr(ticker, 'ticker'):
                    ticker = str(ticker.ticker).strip().upper()
                
                # edgartools stores the trades in a pandas DataFrame called 'transactions'
                if not hasattr(form4, 'transactions') or form4.transactions is None:
                    continue
                    
                df = form4.transactions
                if isinstance(df, pd.DataFrame):
                    df.columns = df.columns.str.lower()
                    
                    for _, row in df.iterrows():
                        # We exclusively isolate Open Market Purchases (P) and Sales (S)
                        tx_code = str(row.get('transactioncode', row.get('code', ''))).strip().upper()
                        if tx_code not in ['P', 'S']:
                            continue
                            
                        shares = int(float(row.get('shares', 0)))
                        price = float(row.get('price', 0.0))
                        tx_date = str(row.get('date', ''))
                        total_value = shares * price
                        
                        if shares == 0:
                            continue
                            
                        # 1. Append to Immutable Insider History
                        supabase.table("insider_transactions").upsert({
                            "investor_id": investor['id'],
                            "ticker": ticker,
                            "reporting_owner": investor['name'],
                            "transaction_date": tx_date,
                            "transaction_code": tx_code,
                            "shares": shares,
                            "price_per_share": price,
                            "total_value": total_value,
                            "filing_accession": accession_no
                        }, on_conflict="filing_accession").execute()
                        
                        # 2. Fire Real-Time Webhook Alert
                        send_form4_alert(investor['name'], ticker, tx_code, shares, price, total_value, tx_date, accession_no)
                        
        except Exception as e:
            print(f"  ❌ Form 4 Fetch Error for {investor['name']}: {e}")

    print("\n=== 🎉 FORM 4 PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_form4_pipeline()