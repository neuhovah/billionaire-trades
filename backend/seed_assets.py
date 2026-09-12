import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load the keys from your .env file
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def insert_test_asset():
    # Example: Tesla Gigafactory Texas (-97.6171, 30.2223)
    asset_data = {
        "ticker": "TSLA",
        "asset_name": "Gigafactory Texas",
        "asset_type": "Manufacturing Node",
        "location": "POINT(-97.6171 30.2223)",
        "description": "Primary vehicle assembly and battery cell production hub."
    }
    
    try:
        response = supabase.table("corporate_assets").insert(asset_data).execute()
        print("✅ SUCCESS! PostGIS Asset Inserted:", response.data)
    except Exception as e:
        print("❌ ERROR:", e)

if __name__ == "__main__":
    insert_test_asset()