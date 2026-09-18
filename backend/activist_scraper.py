import os
import time
import requests
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

def send_activist_alert(investor_name, target_company, form_type, date, accession_no):
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
        f"📅 *Filing Date:* `{date}`\n"
        f"🔗 *Accession:* `{accession_no}`"
    )
    
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHANNEL_ID, "text": message, "parse_mode": "Markdown"},
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

    for investor in investors:
        print(f"\n📡 Monitoring Activist Filings for {investor['name']}")
        try:
            company = Company(str(investor['cik']).zfill(10))
            
            # Fetch SC 13D (Activist) and SC 13G (Passive) and their amendments (/A)
            filings = company.get_filings(form=["SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A"])
            
            if not filings:
                print("  ⚠️ No 13D/G filings found. Skipping.")
                continue
                
            # Scan the 3 most recent filings per manager
            recent_filings = filings.head(3)
            
            for filing in recent_filings:
                accession_no = filing.accession_no
                
                # Deduplication check
                existing = supabase.table("activist_stakes").select("id").eq("filing_accession", accession_no).execute()
                if existing.data:
                    continue
                
                form_type = filing.form
                date = str(filing.filing_date)
                
                # Extract the Subject Company (The target of the acquisition)
                target_company = "Unknown Target Entity"
                try:
                    obj = filing.obj()
                    if obj and hasattr(obj, 'subject_company') and obj.subject_company:
                        target_company = str(obj.subject_company).strip()
                except:
                    pass
                
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
                send_activist_alert(investor['name'], target_company, form_type, date, accession_no)
                        
        except Exception as e:
            print(f"  ❌ Activist Fetch Error for {investor['name']}: {e}")

    print("\n=== 🎉 ACTIVIST PIPELINE COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_activist_pipeline()