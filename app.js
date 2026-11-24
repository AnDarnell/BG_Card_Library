(() => {
  const CARD_DATA_URL = './season-15.json';
  const BG_CARD_URL = (id) => `https://static.firestoneapp.com/cards/bgs/enUS/512/${encodeURIComponent(id)}.png`;
  const WIKI_CARD_URL = (id) => `https://hearthstone.wiki.gg/wiki/Special:FilePath/${encodeURIComponent(id)}_Battlegrounds.png`;
  const ART_URL = (id) => `https://art.hearthstonejson.com/v1/256x/${encodeURIComponent(id)}.jpg`;
  const ART_WEBP_URL = (id) => `https://art.hearthstonejson.com/v1/256x/${encodeURIComponent(id)}.webp`;
  const $ = (selector) => document.querySelector(selector);
  const els = {
    grid: $('#card-grid'), search: $('#search-input'), typeFilters: $('#type-filters'), modeFilters: $('#mode-filters'), tribeFilters: $('#tribe-filters'), tier: $('#tier-filter'), tierLabel: $('#tier-label'), keyword: $('#keyword-filter'), timewarp: $('#timewarp-filter'),
    sort: $('#sort-select'), filterCount: $('#filter-count'), activeFilters: $('#active-filters'), results: $('#results-label'),
    apiStatus: $('#api-status'), total: $('#total-count'), empty: $('#empty-state'), error: $('#load-error'),
    modal: $('#card-modal'), detailImage: $('#detail-image'), detailKicker: $('#detail-kicker'), detailTitle: $('#detail-title'), detailStats: $('#detail-stats'), detailText: $('#detail-text'),
    referencePopover: $('#reference-popover'), referenceImage: $('#reference-image'), referenceTitle: $('#reference-title'), referenceKicker: $('#reference-kicker'), referenceText: $('#reference-text'),
  };
  const state = { cards: [], type: 'MINION', mode: 'SOLO', tribe: 'all', tier: 'all', keyword: 'all', search: '', sort: 'tier', includeTimewarp: false };
  const tribeNames = { ABERRATION: 'Aberrations', BEAST: 'Beast', DEMON: 'Demon', DRAGON: 'Dragon', ELEMENTAL: 'Elemental', MECHANICAL: 'Mech', MECH: 'Mech', MURLOC: 'Murloc', NAGA: 'Naga', PIRATE: 'Pirate', QUILBOAR: 'Quilboar', UNDEAD: 'Undead', NEUTRAL: 'Neutral', ALL: 'All', PET: 'Pet' };
  const mechanicNames = { ACTIVATE: 'Activate', AURA: 'Aura', AVENGE: 'Avenge', BATTLECRY: 'Battlecry', CHOOSE_ONE: 'Choose One', DEATHRATTLE: 'Deathrattle', DISCOVER: 'Discover', DIVINE_SHIELD: 'Divine Shield', END_OF_TURN: 'End of Turn', LIFESTEAL: 'Lifesteal', MAGNETIC: 'Magnetic', MISSION: 'Mission', PASS: 'Pass', RALLY: 'Rally', REBORN: 'Reborn', REFRESH: 'Refresh', RESILIENT: 'Resilient', SPELLCRAFT: 'Spellcraft', START_OF_COMBAT: 'Start of Combat', START_OF_TURN: 'Start of Turn', STEALTH: 'Stealth', TAUNT: 'Taunt', VENOMOUS: 'Venomous', WINDFURY: 'Windfury' };
  const nonCardReferenceNames = new Set(['AVENGE', 'TRIPLE REWARD']);
  const keywordCache = new WeakMap();

  function cleanText(value = '') { return String(value).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\[x\]/gi, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim(); }
  function races(card) { return [...new Set([...(card.races || []), card.race].filter(Boolean).map((race) => race.toUpperCase()))]; }
  function filterTribes(card) { const tribes = races(card); if (tribes.includes('ALL')) return ['ALL']; return tribes.length ? tribes : card.type === 'MINION' ? ['NEUTRAL'] : []; }
  function cardKeywords(card) {
    if (keywordCache.has(card)) return keywordCache.get(card);
    const found = new Set((card.mechanics || []).map((keyword) => {
      const normalized = String(keyword).toUpperCase().replace(/[ -]+/g, '_');
      return normalized === 'POISONOUS' ? 'VENOMOUS' : normalized;
    }));
    const text = cleanText(card.text);
    Object.entries(mechanicNames).forEach(([key, label]) => {
      const phrase = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${phrase}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text)) found.add(key);
    });
    const keywords = [...found].filter((keyword) => Object.hasOwn(mechanicNames, keyword));
    keywordCache.set(card, keywords);
    return keywords;
  }
  function libraryCards() { return state.cards.filter((card) => !card.isReferenceOnly); }
  function cardById(id) { return state.cards.find((card) => String(card.dbfId) === String(id)); }
  function cardImageUrl(card) { return card.imageUrl || BG_CARD_URL(card.id); }
  function cardImageSource(card) { return card.imageUrl ? (card.imageUrl.includes('/patch-notes/') ? 'patch' : 'hsbg') : 'firestone'; }
  function openCardDetails(id) {
    const card = cardById(id);
    if (!card) return;
    els.detailImage.dataset.cardArt = card.id;
    els.detailImage.dataset.imageSource = cardImageSource(card);
    els.detailImage.src = cardImageUrl(card);
    els.detailImage.alt = card.name;
    const tierLabel = card.isTimewarp ? card.timewarpTier?.toUpperCase() : card.techLevel ? `TIER ${card.techLevel}` : '';
    els.detailKicker.textContent = [card.type === 'MINION' ? 'MINION' : 'TAVERN SPELL', card.isTimewarp ? 'TIMEWARP' : '', tierLabel].filter(Boolean).join(' · ');
    els.detailTitle.textContent = card.name;
    const tribe = filterTribes(card).map((race) => tribeNames[race] || race).join(' · ');
    const stats = card.type === 'MINION' ? `<span>${card.attack ?? 0} ATK</span><span>${card.health ?? 0} HP</span>` : '';
    els.detailStats.innerHTML = `${tribe ? `<span>${escapeHtml(tribe)}</span>` : ''}${stats}`;
    els.detailText.innerHTML = linkedCardText(card) || (card.type === 'SPELL' ? 'Tavern spell' : '');
    els.modal.hidden = false;
    document.body.classList.add('modal-open');
    els.modal.querySelector('.detail-close').focus();
  }
  function closeCardDetails() { els.modal.hidden = true; els.referencePopover.hidden = true; document.body.classList.remove('modal-open'); }
  function cardNameVariants(name) {
    const variants = [name];
    const match = name.match(/^(.*\s)?(\S+)$/);
    if (!match) return variants;
    const [, prefix = '', lastWord] = match;
    const plural = /[^aeiou]y$/i.test(lastWord)
      ? `${lastWord.slice(0, -1)}ies`
      : /(s|x|z|ch|sh)$/i.test(lastWord)
        ? `${lastWord}es`
        : `${lastWord}s`;
    variants.push(`${prefix}${plural}`);
    return variants;
  }
  function findCardReferences(card) {
    const text = cleanText(card.text);
    const candidates = state.cards.filter((candidate) => String(candidate.dbfId) !== String(card.dbfId) && !nonCardReferenceNames.has(candidate.name.toUpperCase())).sort((a, b) => b.name.length - a.name.length);
    const byVariant = new Map();
    candidates.forEach((candidate) => cardNameVariants(candidate.name).forEach((variant) => byVariant.set(variant.toLocaleLowerCase('en'), candidate)));
    candidates.forEach((candidate) => (candidate.referenceAliases || []).forEach((alias) => {
      cardNameVariants(alias).forEach((variant) => {
        const key = variant.toLocaleLowerCase('en');
        if (!byVariant.has(key)) byVariant.set(key, candidate);
      });
    }));
    const names = [...byVariant.keys()].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!names.length) return [];
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${names.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    return [...text.matchAll(pattern)].map((match) => ({ name: match[0], index: match.index, card: byVariant.get(match[0].toLocaleLowerCase('en')) }));
  }
  function linkedCardText(card) {
    const text = cleanText(card.text);
    const references = findCardReferences(card);
    if (!references.length) return escapeHtml(text);
    let markup = '';
    let cursor = 0;
    references.forEach(({ name, index, card: reference }) => {
      markup += escapeHtml(text.slice(cursor, index));
      markup += `<button type="button" class="card-reference" aria-describedby="reference-popover" data-reference-id="${reference.dbfId}">${escapeHtml(name)}</button>`;
      cursor = index + name.length;
    });
    return markup + escapeHtml(text.slice(cursor));
  }
  function findReferencedCards(card) { return [...new Map(findCardReferences(card).map(({ card: reference }) => [String(reference.dbfId), reference])).values()]; }
  let referenceHideTimer = null;
  let hoveredGalleryCard = null;
  function showReference(id, anchor) {
    const card = cardById(id);
    if (!card) return;
    clearTimeout(referenceHideTimer);
    els.referenceImage.dataset.cardArt = card.id;
    els.referenceImage.dataset.imageSource = cardImageSource(card);
    els.referenceImage.src = cardImageUrl(card);
    els.referenceImage.alt = card.name;
    els.referenceTitle.textContent = card.name;
    const tier = card.isTimewarp ? card.timewarpTier : card.techLevel ? `Tier ${card.techLevel}` : '';
    els.referenceKicker.textContent = [card.type === 'MINION' ? 'MINION' : 'TAVERN SPELL', tier].filter(Boolean).join(' · ');
    els.referenceText.textContent = cleanText(card.text) || 'No additional card text.';
    els.referencePopover.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = els.referencePopover.getBoundingClientRect();
    const gap = 12;
    let left = anchorRect.right + gap;
    if (left + popoverRect.width > window.innerWidth - 12) left = anchorRect.left - popoverRect.width - gap;
    left = Math.max(12, Math.min(left, window.innerWidth - popoverRect.width - 12));
    const top = Math.max(12, Math.min(anchorRect.top, window.innerHeight - popoverRect.height - 12));
    els.referencePopover.style.left = `${left}px`;
    els.referencePopover.style.top = `${top}px`;
  }
  function scheduleHideReference() { clearTimeout(referenceHideTimer); referenceHideTimer = setTimeout(() => { els.referencePopover.hidden = true; }, 140); }
  function imageFallback(image) {
    const id = image.dataset.cardArt;
    const source = image.dataset.imageSource;
    if (source === 'patch' || source === 'hsbg') { image.dataset.imageSource = 'firestone'; image.src = BG_CARD_URL(id); return; }
    if (source === 'firestone') { image.dataset.imageSource = 'wiki'; image.src = WIKI_CARD_URL(id); return; }
    if (source === 'wiki') { image.dataset.imageSource = 'hearthstonejson'; image.classList.add('image-fallback'); image.src = ART_URL(id); return; }
    if (source === 'hearthstonejson') { image.dataset.imageSource = 'hearthstonejson-webp'; image.src = ART_WEBP_URL(id); return; }
    image.onerror = null;
    image.removeAttribute('src');
    image.classList.add('image-missing');
  }
  function imageLoaded(image) {
    if (['patch', 'hsbg', 'firestone', 'wiki'].includes(image.dataset.imageSource)) image.closest('.minion-card')?.classList.add('full-render');
  }
  window.imageFallback = imageFallback;
  window.imageLoaded = imageLoaded;

  async function fetchCards() {
    els.error.hidden = true; els.empty.hidden = true; els.apiStatus.classList.remove('error'); els.apiStatus.innerHTML = '<i></i> CONNECTING'; els.results.textContent = 'Loading card data';
    els.grid.innerHTML = '<div class="loading-note">Loading Battlegrounds cards…</div>';
    try {
      const response = await fetch(CARD_DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const data = payload.cards;
      if (!Array.isArray(data)) throw new Error('Unexpected card data');
      state.cards = data.filter((card) => card && card.dbfId && card.name && ['MINION', 'SPELL'].includes(card.type));
      if (!state.cards.length) throw new Error('No Battlegrounds cards found');
      populateTribes();
      populateKeywords();
      els.apiStatus.innerHTML = '<i></i> S15 · PATCH 37.2';
      els.total.textContent = `${libraryCards().length.toLocaleString('en-US')} cards`;
      render();
    } catch (error) {
      console.error('Unable to load Season 15 cards:', error);
      els.grid.innerHTML = ''; els.error.hidden = false; els.apiStatus.classList.add('error');
      els.apiStatus.innerHTML = '<i></i> OFFLINE'; els.results.textContent = 'Could not load card data';
    }
  }

  function populateTribes() {
    const available = [...new Set(libraryCards().filter((card) => card.type === 'MINION').flatMap(filterTribes))].sort((a, b) => (tribeNames[a] || a).localeCompare(tribeNames[b] || b));
    els.tribeFilters.innerHTML = '<button class="chip tribe-chip selected" data-value="all">All tribes</button>' + available.map((tribe) => `<button class="chip tribe-chip" data-value="${tribe}">${tribeNames[tribe] || tribe}</button>`).join('');
  }

  function populateKeywords() {
    const available = [...new Set(libraryCards().flatMap(cardKeywords))].sort((a, b) => mechanicNames[a].localeCompare(mechanicNames[b]));
    els.keyword.innerHTML = '<option value="all">All keywords</option>' + available.map((keyword) => `<option value="${keyword}">${mechanicNames[keyword]}</option>`).join('');
    els.keyword.value = state.keyword;
  }

  function updateTierOptions() {
    const options = state.includeTimewarp
      ? [['all', 'All'], ['minor', 'Minor'], ['major', 'Major']]
      : [['all', 'All tiers'], ...Array.from({ length: 7 }, (_, index) => [String(index + 1), `Tier ${index + 1}`])];
    els.tier.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    els.tier.value = state.tier;
    els.tierLabel.textContent = state.includeTimewarp ? 'TIMEWARP TIER' : 'TAVERN TIER';
  }

  function filteredCards() {
    const query = state.search.toLocaleLowerCase('en');
    let cards = state.cards.filter((card) => {
      if (card.isReferenceOnly) return false;
      if (card.type !== state.type) return false;
      if (state.mode === 'SOLO' && card.isDuosOnly) return false;
      if (state.mode === 'DUOS' && card.isSolosOnly) return false;
      const isTimewarpCard = Boolean(card.isTimewarp || /timewarp/i.test(card.name));
      if (isTimewarpCard !== state.includeTimewarp) return false;
      if (state.tribe !== 'all' && !filterTribes(card).includes(state.tribe)) return false;
      if (state.keyword !== 'all' && !cardKeywords(card).includes(state.keyword)) return false;
      if (state.tier !== 'all') {
        const cardTier = state.includeTimewarp ? String(card.timewarpTier || '').toLowerCase() : String(card.techLevel ?? '');
        if (cardTier !== state.tier) return false;
      }
      if (query) {
        const searchable = `${card.name} ${cleanText(card.text)} ${filterTribes(card).map((race) => tribeNames[race] || race).join(' ')} ${(card.mechanics || []).map((item) => mechanicNames[item] || item).join(' ')}`.toLocaleLowerCase('en');
        if (!searchable.includes(query)) return false;
      }
      return true;
    });
    cards.sort((a, b) => {
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      if (state.sort === 'attack') return (b.attack || 0) - (a.attack || 0) || (b.health || 0) - (a.health || 0);
      if (state.sort === 'health') return (b.health || 0) - (a.health || 0) || (b.attack || 0) - (a.attack || 0);
      return (a.techLevel || 99) - (b.techLevel || 99) || a.name.localeCompare(b.name);
    });
    return cards;
  }

  function cardMarkup(card) {
    const id = String(card.dbfId);
    const imageUrl = cardImageUrl(card);
    const imageSource = cardImageSource(card);
    const tags = [card.isNew ? '<span class="card-tag new-badge">NEW</span>' : '', card.isChanged ? '<span class="card-tag changed-badge">Chg.</span>' : '', card.isReturning ? '<span class="card-tag returning-badge">Ret.</span>' : ''].filter(Boolean).join('');
    return `<article class="minion-card" data-card-id="${id}">
      <button class="card-preview" data-action="details" aria-label="View details for ${escapeHtml(card.name)}"><div class="card-image-wrap"><img class="card-image" data-card-art="${escapeHtml(card.id)}" data-image-source="${imageSource}" loading="lazy" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(card.name)}" onerror="imageFallback(this)" onload="imageLoaded(this)" />${tags ? `<span class="card-tags">${tags}</span>` : ''}</div></button>
    </article>`;
  }

  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function render() {
    if (!state.cards.length) return;
    const cards = filteredCards();
    const tiers = new Map();
    cards.forEach((card) => {
      const tier = state.includeTimewarp ? (card.timewarpTier || 'other').toLowerCase() : (card.techLevel || 'other');
      if (!tiers.has(tier)) tiers.set(tier, []);
      tiers.get(tier).push(card);
    });
    const orderedTiers = [...tiers.keys()].sort((a, b) => state.includeTimewarp ? ({ minor: 0, major: 1, other: 2 }[a] ?? 3) - ({ minor: 0, major: 1, other: 2 }[b] ?? 3) : a === 'other' ? 1 : b === 'other' ? -1 : Number(a) - Number(b));
    els.grid.innerHTML = orderedTiers.map((tier) => {
      const tierCards = tiers.get(tier);
      const label = tier === 'other' ? 'Other' : state.includeTimewarp ? tier[0].toUpperCase() + tier.slice(1) : `Tier ${tier}`;
      const tierIcon = !state.includeTimewarp && /^\d+$/.test(String(tier)) ? `<img class="tier-icon" src="./assets/tiers/Tier${tier}.png" alt="" aria-hidden="true" />` : '';
      return `<section class="tier-row"><div class="tier-row-heading">${tierIcon}<span>${label}</span><i></i><small>${tierCards.length} cards</small></div><div class="tier-row-grid">${tierCards.map(cardMarkup).join('')}</div></section>`;
    }).join('');
    els.empty.hidden = cards.length !== 0;
    els.results.textContent = `${cards.length.toLocaleString('en-US')} CARDS SHOWN`;
    const activeCount = Number(state.type !== 'MINION') + Number(state.mode !== 'SOLO') + Number(state.includeTimewarp) + Number(state.tribe !== 'all') + Number(state.tier !== 'all') + Number(state.keyword !== 'all') + Number(Boolean(state.search));
    els.filterCount.textContent = activeCount; els.filterCount.hidden = !activeCount;
    els.activeFilters.innerHTML = [state.type !== 'MINION' ? 'Tavern spells' : '', state.mode !== 'SOLO' ? 'Duos' : '', state.includeTimewarp ? 'Timewarp' : '', state.tribe !== 'all' ? tribeNames[state.tribe] || state.tribe : '', state.tier !== 'all' ? state.includeTimewarp ? state.tier[0].toUpperCase() + state.tier.slice(1) : `Tier ${state.tier}` : '', state.keyword !== 'all' ? mechanicNames[state.keyword] : '', state.search ? `Search: ${state.search}` : ''].filter(Boolean).map((label) => `<span class="active-tag">${escapeHtml(label)}</span>`).join('');
  }

  function clearFilters() { state.type = 'MINION'; state.mode = 'SOLO'; state.includeTimewarp = false; state.tribe = 'all'; state.tier = 'all'; state.keyword = 'all'; state.search = ''; els.search.value = ''; els.timewarp.checked = false; els.keyword.value = 'all'; updateTierOptions(); document.querySelectorAll('#type-filters .chip').forEach((chip) => chip.classList.toggle('selected', chip.dataset.value === 'MINION')); document.querySelectorAll('#mode-filters .chip').forEach((chip) => chip.classList.toggle('selected', chip.dataset.value === 'SOLO')); document.querySelectorAll('#tribe-filters .chip').forEach((chip) => chip.classList.toggle('selected', chip.dataset.value === 'all')); render(); }
  els.search.addEventListener('input', () => { state.search = els.search.value.trim(); render(); });
  els.tier.addEventListener('change', () => { state.tier = els.tier.value; render(); });
  els.keyword.addEventListener('change', () => { state.keyword = els.keyword.value; render(); });
  els.sort.addEventListener('change', () => { state.sort = els.sort.value; render(); });
  els.timewarp.addEventListener('change', () => { state.includeTimewarp = els.timewarp.checked; state.tier = 'all'; updateTierOptions(); render(); });
  els.typeFilters.addEventListener('click', (event) => { const button = event.target.closest('.chip'); if (!button) return; state.type = button.dataset.value; els.typeFilters.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('selected', chip === button)); render(); });
  els.modeFilters.addEventListener('click', (event) => { const button = event.target.closest('.chip'); if (!button) return; state.mode = button.dataset.value; els.modeFilters.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('selected', chip === button)); render(); });
  els.tribeFilters.addEventListener('click', (event) => { const button = event.target.closest('.chip'); if (!button) return; state.tribe = button.dataset.value; els.tribeFilters.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('selected', chip === button)); render(); });
  els.grid.addEventListener('pointerover', (event) => {
    const article = event.target.closest('.minion-card');
    if (!article || hoveredGalleryCard === article.dataset.cardId) return;
    hoveredGalleryCard = article.dataset.cardId;
    const card = cardById(hoveredGalleryCard);
    const reference = card && findReferencedCards(card)[0];
    if (reference) showReference(reference.dbfId, article.querySelector('.card-preview'));
    else scheduleHideReference();
  });
  els.grid.addEventListener('pointerout', (event) => {
    const article = event.target.closest('.minion-card');
    const nextArticle = event.relatedTarget?.closest?.('.minion-card');
    if (article && article !== nextArticle) { hoveredGalleryCard = null; scheduleHideReference(); }
  });
  els.grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="details"]');
    if (button) openCardDetails(button.closest('.minion-card').dataset.cardId);
  });
  els.detailText.addEventListener('pointerover', (event) => { const reference = event.target.closest('.card-reference'); if (reference) showReference(reference.dataset.referenceId, reference); });
  els.detailText.addEventListener('pointerout', (event) => { if (event.target.closest('.card-reference') && !event.relatedTarget?.closest?.('.card-reference')) scheduleHideReference(); });
  els.detailText.addEventListener('focusin', (event) => { const reference = event.target.closest('.card-reference'); if (reference) showReference(reference.dataset.referenceId, reference); });
  els.detailText.addEventListener('focusout', scheduleHideReference);
  els.detailText.addEventListener('click', (event) => { const reference = event.target.closest('.card-reference'); if (reference) showReference(reference.dataset.referenceId, reference); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.card-reference') && !event.target.closest('#reference-popover')) els.referencePopover.hidden = true; });
  els.modal.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    if (button.dataset.action === 'close-modal') closeCardDetails();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !els.referencePopover.hidden) { els.referencePopover.hidden = true; return; } if (event.key === 'Escape' && !els.modal.hidden) closeCardDetails(); });
  $('#clear-filters').addEventListener('click', clearFilters); $('#empty-clear').addEventListener('click', clearFilters);
  $('#refresh-button').addEventListener('click', fetchCards); $('#retry-button').addEventListener('click', fetchCards);
  $('#filter-toggle').addEventListener('click', () => { const button = $('#filter-toggle'); const expanded = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!expanded)); $('#filters').hidden = expanded; });
  document.addEventListener('keydown', (event) => { if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); els.search.focus(); } if (event.key === 'Escape') { els.search.blur(); } });

  fetchCards();
})();
