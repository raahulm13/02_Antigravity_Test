import requests

def test_api():
    url = "https://api.elections.kalshi.com/trade-api/v2/events?limit=5"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        print("Events keys:", data.get('events', [{}])[0].keys())
    else:
        print("Error:", response.status_code)
        
    url2 = "https://api.elections.kalshi.com/trade-api/v2/markets?limit=5"
    response2 = requests.get(url2)
    if response2.status_code == 200:
        data2 = response2.json()
        print("Markets keys:", data2.get('markets', [{}])[0].keys())
    else:
        print("Error2:", response2.status_code)

if __name__ == "__main__":
    test_api()
