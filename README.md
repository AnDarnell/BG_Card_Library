# BG Card Library

A searchable Hearthstone Battlegrounds card library for Season 15.

## Run locally

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. Card data is stored in `season-15.json`; card artwork is loaded from external sources.

To refresh the data, install `requests` and `beautifulsoup4`, then run:

```powershell
python build-season15.py
```
