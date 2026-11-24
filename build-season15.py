import json
import re
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://hsbg.cards"
session = requests.Session()
soup = BeautifulSoup(session.get(f"{BASE}/patch-notes/37.2", timeout=40).text, "html.parser")

# The page classifies the rotation, while the public catalog supplies the
# normalized card fields for returning and unchanged cards.
catalog = []
offset = 0
while True:
    response = session.get(
        f"{BASE}/api/v1/cards",
        params={"pool": "all", "limit": 200, "offset": offset},
        timeout=30,
    ).json()
    catalog.extend(response.get("data", []))
    offset = response.get("pagination", {}).get("nextOffset")
    if offset is None:
        break


def normalize(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", value.lower())


by_id = {str(card["id"]): card for card in catalog}
by_name = {normalize(card["name"]): card for card in catalog}
art = {}
for box in soup.select("[data-card-id]"):
    image = box.select_one("img[alt][src]")
    if image:
        src = image["src"]
        art[normalize(image.get("alt", ""))] = (
            str(box["data-card-id"]),
            BASE + src if src.startswith("/") else src,
        )

staying_label = next(
    item for item in soup.find_all(string=lambda value: value and "Staying (217)" in value)
)
staying_gallery = staying_label.parent.parent.parent
selected = {}
for box in staying_gallery.select("[data-card-id]"):
    card = by_id.get(str(box["data-card-id"]))
    if card:
        selected[str(card["id"])] = card

section_names = {
    "Functionality Update",
    "Changed Minions",
    "Returning Minions",
    "Returning Spells",
    "Returning Minor Timewarp Cards",
    "Returning Major Timewarp Cards",
}
sections = []
for section in soup.select("section"):
    heading = section.find(["h2", "h3"], recursive=False)
    title = heading.get_text(" ", strip=True) if heading else ""
    title = re.sub(r"\s*\([^)]*\)\s*$", "", title)
    if title in section_names or title.startswith("New "):
        sections.append((title, section))

new_count = 0
missing_new = []
changed_ids = set()
timewarp_ids = set()
timewarp_tiers = {}
new_ids = set()
returning_ids = set()
for title, section in sections:
    for item in section.select(":scope > ul > li"):
        label = item.find(["strong", "a"])
        if not label:
            continue
        name = label.get_text(" ", strip=True)
        key = normalize(name)
        card = by_name.get(key)
        if card and title.startswith("New "):
            card = dict(card)
            new_ids.add(str(card["id"]))
            if "timewarp" in title.lower():
                timewarp_ids.add(str(card["id"]))
                if "minor timewarp" in title.lower():
                    timewarp_tiers[str(card["id"])] = "Minor"
                elif "major timewarp" in title.lower():
                    timewarp_tiers[str(card["id"])] = "Major"
            summary = item.get_text(" ", strip=True)
            stats = re.search(
                r"Tier\s+(\d+)(?:\s*\(([^)]*)\))?\s*[—-]\s*(\d+)\s*/\s*(\d+)",
                summary,
                re.I,
            )
            paragraph = item.find("p", recursive=False)
            if stats:
                card["tier"], card["attack"], card["health"] = map(int, (stats.group(1), stats.group(3), stats.group(4)))
                if stats.group(2):
                    card["minionTypes"] = [race.strip() for race in stats.group(2).split(",")]
            if paragraph:
                card["text"] = paragraph.get_text(" ", strip=True)
            selected[str(card["id"])] = card
            continue
        if card:
            card = dict(card)
            card_id = str(card["id"])
            if title == "Functionality Update" and card_id not in selected:
                continue
            if title.startswith("Returning "):
                returning_ids.add(card_id)
            if "timewarp" in title.lower():
                timewarp_ids.add(str(card["id"]))
                if "minor timewarp" in title.lower():
                    timewarp_tiers[str(card["id"])] = "Minor"
                elif "major timewarp" in title.lower():
                    timewarp_tiers[str(card["id"])] = "Major"
            if title in ("Changed Minions", "Functionality Update"):
                changed_ids.add(card_id)
            summary = item.get_text(" ", strip=True)
            if "Text" in summary and "\u2192" in summary:
                card["text"] = summary.split("Text", 1)[1].split("\u2192")[-1].strip(" :")
                changed_ids.add(card_id)
            if title == "Changed Minions":
                summary = item.get_text(" ", strip=True).split("Text:", 1)[0]
                stats = re.search(r"Tier\s+(\d+).*?[—-]\s*(\d+)\s*/\s*(\d+)", summary, re.I)
                if stats:
                    card["tier"], card["attack"], card["health"] = map(int, stats.groups())
            for subitem in item.select("li"):
                change = subitem.get_text(" ", strip=True)
                label = subitem.find("em")
                if label and label.get_text(" ", strip=True).lower() == "text" and "→" in change:
                    card["text"] = change.split("→")[-1].strip()
                    break
            selected[str(card["id"])] = card
            continue

        # Upcoming cards are not yet present in the API. Their preview rows
        # contain their stats and rules text; the gallery supplies card ID/art.
        if not title.startswith("New "):
            continue
        summary = item.get_text(" ", strip=True)
        paragraph = item.find("p", recursive=False)
        description = paragraph.get_text(" ", strip=True) if paragraph else ""
        if not description:
            description = summary[len(name):].strip(" —-")
        stats = re.search(
            r"Tier\s+(\d+)(?:\s*\(([^)]*)\))?\s*[—-]\s*(\d+)\s*/\s*(\d+)",
            summary,
            re.I,
        )
        artwork = art.get(key)
        if not artwork:
            missing_new.append(name)
            continue
        card_id, image_url = artwork
        new_ids.add(card_id)
        if "timewarp" in title.lower():
            timewarp_ids.add(card_id)
            if "minor timewarp" in title.lower():
                timewarp_tiers[card_id] = "Minor"
            elif "major timewarp" in title.lower():
                timewarp_tiers[card_id] = "Major"
        races = [race.strip() for race in stats.group(2).split(",")] if stats and stats.group(2) else []
        tier = int(stats.group(1)) if stats else None
        if tier is None:
            tier_match = re.search(r"Tier\s+(\d+)", summary, re.I)
            tier = int(tier_match.group(1)) if tier_match else None
        selected[card_id] = {
            "id": int(card_id),
            "externalId": f"BG37_{card_id}",
            "name": name,
            "text": description,
            "attack": int(stats.group(3)) if stats else None,
            "health": int(stats.group(4)) if stats else None,
            "tier": tier,
            "cardType": "heroPower" if title.lower().startswith("new hero") else "minion" if stats else "spell",
            "minionTypes": races,
            "keywords": [],
            "image": image_url,
            "pool": True,
        }
        new_count += 1

# The API can still return pre-patch values for changed/returning cards.
# Keep the patch-notes values authoritative for this snapshot.
patch_37_2_overrides = {
    "Dream Inquisitor": {"tier": 5, "attack": 5, "health": 5},
    "Shadowdancer": {"tier": 4, "attack": 4},
    "Ignition Specialist": {"tier": 5},
    "Nether Drake": {"health": 12},
    "Gentle Djinni": {"tier": 5},
    "Junk Jouster": {"tier": 5, "attack": 5, "health": 5},
    "Thundering Abomination": {"tier": 5},
    "Monstrous Macaw": {"tier": 3, "attack": 4, "health": 3},
    "Divine Sparkbot": {"tier": 4, "health": 1},
    "Efficient Engineer": {"tier": 5},
    "Wizened Captain": {"tier": 6, "attack": 6, "health": 6},
}
for card_id, source in selected.items():
    updates = patch_37_2_overrides.get(source.get("name"))
    if updates:
        source.update(updates)
        changed_ids.add(str(card_id))

cards = []
selected_api_ids = {
    str(source["id"])
    for source in selected.values()
    if str(source.get("id")) in by_id
}
reference_only_ids = {
    str(card["id"])
    for card in catalog
    if card.get("parentId") is not None
    and str(card.get("parentId")) in selected_api_ids
    and card.get("cardType") in ("minion", "spell")
}


def plural_variant(name):
    words = name.rsplit(" ", 1)
    last = words[-1]
    if re.search(r"[^aeiou]y$", last, re.I):
        plural = last[:-1] + "ies"
    elif re.search(r"(s|x|z|ch|sh)$", last, re.I):
        plural = last + "es"
    else:
        plural = last + "s"
    return (words[0] + " " if len(words) == 2 else "") + plural


variants = {}
for candidate in catalog:
    candidate_id = str(candidate["id"])
    if candidate_id in selected_api_ids or candidate.get("cardType") not in ("minion", "spell"):
        continue
    variants.setdefault(candidate["name"].lower(), candidate_id)
    variants.setdefault(plural_variant(candidate["name"]).lower(), candidate_id)
if variants:
    mention_pattern = re.compile(
        r"(?<!\w)(?:" + "|".join(re.escape(name) for name in sorted(variants, key=len, reverse=True)) + r")(?!\w)",
        re.I,
    )
    for source in selected.values():
        for match in mention_pattern.finditer(str(source.get("text") or "")):
            reference_only_ids.add(variants[match.group(0).lower()])

# Some cards refer to a token by a descriptive name instead of the token's
# catalog name (for example, Alleycat summons a "Cat", whose card is Tabbycat).
reference_aliases = {}
number_words = "a|an|one|two|three|four|five|six|seven|eight|nine|ten"
summoned_name_pattern = re.compile(
    rf"\bSummon(?:s)?\s+(?:(?:{number_words})\s+)?(?:\d+\s*/\s*\d+\s+)?([A-Za-z]+)\b",
    re.I,
)
reference_tokens = [by_id[card_id] for card_id in reference_only_ids if card_id in by_id]
for source in selected.values():
    plain_text = re.sub(r"<[^>]*>", " ", str(source.get("text") or ""))
    summon_terms = {match.group(1).lower() for match in summoned_name_pattern.finditer(plain_text)}
    singular_terms = set()
    for term in summon_terms:
        if term.endswith("ies"):
            singular_terms.add(term[:-3] + "y")
        elif term.endswith("s"):
            singular_terms.add(term[:-1])
    summon_terms.update(singular_terms)
    for child in reference_tokens:
        child_id = str(child["id"])
        child_name = child["name"].lower()
        for term in summon_terms:
            if term != child_name and child_name.endswith(term):
                reference_aliases.setdefault(child_id, set()).add(term.title())

for card_id, source in selected.items():
    card = dict(source)
    races = card.get("minionTypes") or []
    image = card.get("image") or ""
    card_art = art.get(normalize(card.get("name", "")))
    if card_art and "/patch-notes/" in card_art[1]:
        image = card_art[1]
        if str(card_id) in changed_ids:
            image = image.replace("/old-", "/new-")
    card_type = card.get("cardType")
    if card_type not in ("minion", "spell", "heroPower"):
        continue
    is_timewarp = str(card_id) in timewarp_ids or "timewarped" in card.get("name", "").lower()
    timewarp_tier = timewarp_tiers.get(str(card_id))
    if is_timewarp and not timewarp_tier:
        timewarp_tier = "Minor" if card.get("tier") == 3 else "Major" if card.get("tier") == 5 else None
    cards.append(
        {
            "id": card.get("externalId") or f"BG37_{card_id}",
            "dbfId": int(card["id"]),
            "name": card["name"],
            "type": "MINION" if card_type == "minion" else "HERO_POWER" if card_type == "heroPower" else "SPELL",
            "techLevel": card.get("tier"),
            "attack": card.get("attack"),
            "health": card.get("health"),
            "races": [str(race).upper() for race in races],
            "text": card.get("text") or "",
            "mechanics": [str(word).upper().replace(" ", "_") for word in card.get("keywords", [])],
            "imageUrl": image if image.startswith("http") else BASE + image if image.startswith("/") else "",
            "isTimewarp": is_timewarp,
            "timewarpTier": timewarp_tier,
            "isNew": str(card_id) in new_ids,
            "isChanged": str(card_id) in changed_ids,
            "isReturning": str(card_id) in returning_ids,
            "isDuosOnly": bool(card.get("isDuosOnly", False)),
            "isSolosOnly": bool(card.get("isSolosOnly", False)),
            "isReferenceOnly": card.get("parentId") is not None,
        }
    )

for card_id in sorted(reference_only_ids):
    card = by_id.get(card_id)
    if not card:
        continue
    image = card.get("image") or ""
    cards.append(
        {
            "id": card.get("externalId") or f"HSBG_{card_id}",
            "dbfId": int(card["id"]),
            "name": card["name"],
            "type": "MINION" if card["cardType"] == "minion" else "SPELL",
            "techLevel": card.get("tier"),
            "attack": card.get("attack"),
            "health": card.get("health"),
            "races": [str(race).upper() for race in card.get("minionTypes", [])],
            "text": card.get("text") or "",
            "mechanics": [str(word).upper().replace(" ", "_") for word in card.get("keywords", [])],
            "imageUrl": image if image.startswith("http") else BASE + image if image.startswith("/") else "",
            "isTimewarp": False,
            "timewarpTier": None,
            "isNew": False,
            "isChanged": False,
            "isReturning": False,
            "isDuosOnly": bool(card.get("isDuosOnly", False)),
            "isSolosOnly": bool(card.get("isSolosOnly", False)),
            "isToken": True,
            "isReferenceOnly": True,
            "referenceAliases": sorted(reference_aliases.get(card_id, [])),
        }
    )

output = {
    "season": "15",
    "patch": "37.2",
    "source": f"{BASE}/patch-notes/37.2",
    "cards": cards,
}
Path("season-15.json").write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(
    f"catalog={len(catalog)} staying={len(staying_gallery.select('[data-card-id]'))} "
    f"new_preview={new_count} cards={len(cards)} "
    f"minions={sum(card['type'] == 'MINION' for card in cards)} "
    f"spells={sum(card['type'] == 'SPELL' for card in cards)}"
)
print("unmatched new cards:", missing_new)
for name in ("Surfing Sylvar", "Ambitious Cannoneer", "Aureate Laureate"):
    print(name, next((card for card in cards if card["name"] == name), None))
