import os
import time
import re
import requests
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

def send_activist_alert(investor_name, target_company, form_type, date, sec_url):
    """Broadcasts a high-priority alert for >5% ownership acquisitions."""
    # Classify the intent of the filing
    if "13D" in form_type:
        action = "🔥 ACTIVIST STAKE (Control / Restructure Intent)"
    else:
        action = "📈 PASSIVE STAKE (>5% Ownership)"
    
    message = (
        f"🚨 *Institutional {form_type} Signal: {investor_name}*\n\n"
        f"🎯 *Target Asset:* `{target_company}`\n"
        f"⚡ *Type:* `{action}`\n"
        f"📅 *Filing Date:* `{date}`\n\n"
        f"🔗 *Verify SEC EDGAR Filing:*\n{sec_url}"
    )
    
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": TELEGRAM_CHANNEL_ID, 
                "text": message, 
                "parse_mode": "Markdown",
                "disable_web_page_preview": True
            },
            timeout=10
        )
        if response.status_code == 200:
            print(f"  📢 {form_type} Alert Broadcasted: {investor_name} -> {target_company}")
            time.sleep(3.5)
        else:
            print(f"  ❌ Telegram API Error: {response.text}")
    except Exception as e:
        print(f"  ❌ Connection Failed: {e}")

def run_activist_pipeline():
    print("=== STARTING 13D/G ACTIVIST STAKES PIPELINE ===")
    
    investors = supabase.table("investors").select("*").eq("market", "US Equities").execute().data
    thirty_days_ago = datetime.now() - timedelta(days=30)

    for investor in investors:
        print(f"\n📡 Monitoring Activist Filings for {investor['name']}")
        try:
            cik_str = str(investor['cik']).zfill(10)
            company = Company(cik_str)
            
            # Fetch SC 13D (Activist) and SC 13G (Passive) and their amendments (/A)
            filings = company.get_filings(form=["SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A"])
            
            if not filings:
                print("  ⚠️ No 13D/G filings found. Skipping.")
                continue
                
            # ENTERPRISE FIX: Removed .head(3) limit. Iterate all, but break at 30-day historical boundary.
            for filing in filings:
                accession_no = filing.accession_no
                date = str(filing.filing_date)
                
                # Performance & Drift Protection: Break the loop once we hit filings older than 30 days
                filing_date_obj = datetime.strptime(date, "%Y-%m-%d")
                if filing_date_obj < thirty_days_ago:
                    print(f"  🕰️ Historical boundary reached ({date}). Moving to next manager.")
                    break
                
                # Deduplication check
                existing = supabase.table("activist_stakes").select("id").eq("filing_accession", accession_no).execute()
                if existing.data:
                    continue
                
                form_type = filing.form
                
                # Generate Clickable SEC EDGAR URL
                clean_accession = accession_no.replace("-", "")
                sec_url = f"https://www.sec.gov/Archives/edgar/data/{cik_str.lstrip('0')}/{clean_accession}/{accession_no}-index.html"
                
                # Bulletproof Subject Company Extraction via Raw SGML Header Parsing
                target_company = "Unknown Target Entity"
                try:
                    if hasattr(filing, 'header') and filing.header and filing.header.text:
                        header_text = str(filing.header.text)
                        # In 13D/G SEC headers, the first "COMPANY CONFORMED NAME:" is the target issuer
                        match = re.search(r"COMPANY CONFORMED NAME:\s*([^\n\r]+)", header_text)
                        if match:
                            target_company = match.group(1).strip()
                except Exception as e:
                    print(f"  ⚠️ Could not parse header for {accession_no}: {e}")
                
                # Append to Immutable Database
                supabase.table("activist_stakes").upsert({
                    "investor_id": investor['id'],
                    "target_company": target_company,
                    "reporting_owner": investor['name'],
                    "filing_type": form_type,
                    "filing_date": date,
                    "filing_accession": accession_no
                }, on_conflict="filing_accession").execute()
                
                # Fire Telegram Webhook
                send_activist_alert(investor['name'], target_company, form_type, date, sec_url)
                        
        except Exception as e:
            print(f"  ❌ Activist Fetch Error for {investor['name']}: {e}")

    print("\n=== 🎉 ACTIVIST PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_activist_pipeline()