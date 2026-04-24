import urllib.request
import json

def get_top_categories():
    print("Fetching data from Kalshi API...")
    base_url = "https://api.elections.kalshi.com/trade-api/v2"
    url = f"{base_url}/series?include_volume=true"
    
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                print(f"Error fetching data: {response.status}")
                return
            data = json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching data: {e}")
        return
        
    series_list = data.get('series', [])
    
    # Aggregate volume by category
    category_volume = {}
    for series in series_list:
        cat = series.get('category', 'Unknown')
        vol = series.get('volume', 0) 
        
        # In the v2 API, volume might also be under 'volume_fp' if requested
        if 'volume_fp' in series:
            vol = series['volume_fp']
            
        if vol is None:
            vol = 0
            
        try:
            vol = float(vol)
        except ValueError:
            vol = 0
            
        category_volume[cat] = category_volume.get(cat, 0) + vol
        
    # Sort categories by total volume descending
    sorted_cats = sorted(category_volume.items(), key=lambda x: x[1], reverse=True)
    
    print("\nTop 3 Categories on Kalshi by Volume:")
    print("-" * 40)
    for i, (cat, vol) in enumerate(sorted_cats[:3], 1):
        print(f"{i}. {cat.capitalize()}: {vol:,.0f} contracts")

if __name__ == "__main__":
    get_top_categories()
