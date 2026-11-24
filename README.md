# Tavern Ledger

A small Swedish language Hearthstone Battlegrounds card library and seven minion warband sketch board.

## Run locally

Serve this folder with any static web server, then open its local URL. For example, if Python is installed:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000`. The app reads its Season 15 card snapshot from `season-15.json`; serve the folder over HTTP because browsers do not load local JSON files from `file://`. Card artwork is hosted by HS BG Cards and its patch preview, so an internet connection is required for images.

## Included

- Search by card name, card text, tribe, and keyword.
- Filter by minion or Tavern spell, tribe, Tavern tier, and favorites.
- Sort by tier, name, attack, or health.
- Save favorites and a seven-minion board in local browser storage.
- Copy a text version of the current warband.
- Load card artwork from the Season 15 preview, with Firestone, Hearthstone Wiki, and HearthstoneJSON fallbacks.

The checked-in snapshot combines the Season 15 / Patch 37.2 rotation and card changes from [HS BG Cards' patch notes](https://hsbg.cards/patch-notes/37.2) with its public card catalog. `build-season15.py` regenerates the snapshot. The patch notes are a community source, and the snapshot is pinned so the library does not silently revert to the still-live pool. Card game data and art are Blizzard Entertainment properties; this is an unofficial fan project.

To rebuild the snapshot, install the script's Python dependencies (`requests` and `beautifulsoup4`) and run `python build-season15.py` from this folder.
