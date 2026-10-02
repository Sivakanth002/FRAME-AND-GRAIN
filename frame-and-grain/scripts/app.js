import { TITLES_CATALOG } from './catalog.js';

const SERVICES = { netflix: 'Netflix', prime: 'Prime Video', hotstar: 'JioHotstar', mubi: 'MUBI', sonyliv: 'Sony LIV', criterion: 'Criterion Channel', max: 'Max', apple: 'Apple TV+' };
const REGIONS = { IN: 'India', US: 'United States', GB: 'United Kingdom', JP: 'Japan', CA: 'Canada', FR: 'France', DE: 'Germany', AU: 'Australia' };
const MOODS = {
  thrilled: { label: 'Thrilled', genres: ['Thriller', 'Action', 'Crime'], keywords: ['thrilled', 'dark', 'unsettled'] },
  moved: { label: 'Moved', genres: ['Drama', 'Romance', 'Family'], keywords: ['moved', 'inspired'] },
  unsettled: { label: 'Unsettled', genres: ['Horror', 'Thriller', 'Crime'], keywords: ['unsettled', 'dark'] },
  inspired: { label: 'Inspired', genres: ['Drama', 'Documentary', 'Action'], keywords: ['inspired', 'moved'] },
  laugh: { label: 'Make me laugh', genres: ['Comedy', 'Romance'], keywords: ['laugh', 'relaxed'] },
  think: { label: 'Make me think', genres: ['Drama', 'Crime', 'Sci-Fi'], keywords: ['think', 'unsettled'] },
  dark: { label: 'Something dark', genres: ['Horror', 'Thriller', 'Crime'], keywords: ['dark', 'unsettled'] },
  relaxed: { label: 'Keep it gentle', genres: ['Comedy', 'Family', 'Romance'], keywords: ['relaxed', 'moved'] }
};
const defaults = { region: 'IN', services: ['netflix', 'prime', 'hotstar'], anyServices: false, format: 'all', language: 'all', genre: 'all', mood: 'all', runtime: 'all', period: 'all' };
let preferences = { ...defaults };
let currentResults = [];
let luckyPool = [];
let luckyIndex = 0;

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const yearOf = (title) => Number(title.releaseDate || title.year || 0) || 0;
const parseVotes = (value) => typeof value === 'number' ? value : Number(String(value || 0).replace(/[^0-9.]/g, '')) * (String(value).toUpperCase().includes('K') ? 1000 : String(value).toUpperCase().includes('M') ? 1000000 : 1);
const formatRuntime = (minutes, type) => type === 'series' ? `~${minutes}m / ep` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

// Raw catalog -> the only object shape the UI ever consumes.
function normalize(raw) {
  const mediaType = raw.mediaType === 'tv_series' ? 'tv' : raw.mediaType === 'tv' ? 'tv' : 'movie';
  const anime = (raw.language === 'Japanese' || raw.original_language === 'ja') && raw.genres?.includes('Animation');
  const explicitAnime = raw.mediaType === 'anime';
  return { source: 'tmdb', sourceId: String(raw.id).replace('tmdb-', ''), mediaType, contentClass: mediaType === 'movie' ? ((explicitAnime || anime) ? 'anime' : 'movie') : (anime ? 'anime' : 'series'), title: raw.title, originalTitle: raw.originalTitle || raw.title, poster: raw.poster, backdrop: raw.backdrop || raw.poster, releaseDate: String(raw.year || ''), originalLanguage: raw.language || 'English', genres: raw.genres || [], runtime: Number(raw.runtime) || 0, rating: Number(raw.rating) || 0, voteCount: parseVotes(raw.voteCount), ratingScore: 0, providers: [], overview: raw.overview || raw.editorialRationale || '', _availability: raw.availability || {}, _moods: raw.moods || [], _runtimeCategory: raw.runtimeCategory || (raw.runtime < 90 ? 'under-90' : raw.runtime <= 120 ? '90-120' : 'over-120'), _period: raw.period || (raw.year >= 2020 ? '2020s' : raw.year >= 2010 ? '2010s' : raw.year >= 2000 ? '2000s' : raw.year >= 1990 ? '1990s' : 'classics') };
}
const TITLES = TITLES_CATALOG.map(normalize);

function providerEnrich(title, region) {
  return { ...title, providers: (title._availability[region] || []).map((id) => ({ id, name: SERVICES[id] || id, type: 'flatrate' })) };
}
function activeWeights() {
  return { genre: preferences.genre !== 'all' ? 25 : 0, rating: 25, language: preferences.language !== 'all' ? 15 : 0, mood: preferences.mood !== 'all' ? 15 : 0, runtime: preferences.runtime !== 'all' ? 10 : 0, period: preferences.period !== 'all' ? 5 : 0 };
}
function computeScore(candidate, poolMean = 7) {
  const weights = activeWeights();
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  const rating = ((candidate.voteCount / (candidate.voteCount + 350)) * candidate.rating) + ((350 / (candidate.voteCount + 350)) * poolMean);
  const mood = MOODS[preferences.mood];
  const parts = {
    genre: preferences.genre === 'all' ? 0 : (candidate.genres.includes(preferences.genre) ? 100 : 0),
    rating: Math.min(100, (rating / 10) * 100),
    language: preferences.language === 'all' ? 0 : (candidate.originalLanguage === preferences.language ? 100 : 0),
    mood: preferences.mood === 'all' ? 0 : (candidate.genres.some((g) => mood?.genres.includes(g)) || candidate._moods.includes(preferences.mood) ? 100 : 22),
    runtime: preferences.runtime === 'all' ? 0 : (candidate._runtimeCategory === preferences.runtime || (candidate.runtime < 90 && preferences.runtime === 'under-90') || (candidate.runtime >= 90 && candidate.runtime <= 120 && preferences.runtime === '90-120') || (candidate.runtime > 120 && preferences.runtime === 'over-120') ? 100 : 0),
    period: preferences.period === 'all' ? 0 : (candidate._period === preferences.period ? 100 : 0)
  };
  const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + (parts[key] * weight / 100), 0) / total * 100;
  const reasons = [];
  if (weights.genre && parts.genre) reasons.push(`a strong ${preferences.genre.toLowerCase()} match`);
  if (weights.rating && rating >= 7.8) reasons.push(`a considered ${rating.toFixed(1)}/10 audience rating`);
  if (weights.language && parts.language) reasons.push(`made in ${candidate.originalLanguage}`);
  if (weights.mood && parts.mood >= 100) reasons.push(`the ${mood.label.toLowerCase()} mood you chose`);
  if (weights.runtime && parts.runtime) reasons.push(`fits your ${runtimeLabel(preferences.runtime).toLowerCase()}`);
  if (weights.period && parts.period) reasons.push(`from the ${preferences.period}`);
  if (!reasons.length) reasons.push('a quietly reliable place to start');
  return { ...candidate, ratingScore: rating, score, reasons: reasons.slice(0, 3) };
}
function runtimeLabel(value) { return { 'under-90': 'under 90 minutes', '90-120': '90–120 minutes', 'over-120': 'two-hour window' }[value] || 'your time'; }
function eligibleTitles() {
  // The local catalog stands in for a server route in this static learning prototype.
  const initial = TITLES.slice(0, 60);
  const filter = (pool) => pool.filter((title) => {
    const formatOkay = preferences.format === 'all' || title.contentClass === preferences.format;
    const languageOkay = preferences.language === 'all' || title.originalLanguage === preferences.language;
    const genreOkay = preferences.genre === 'all' || title.genres.includes(preferences.genre);
    const runtimeOkay = preferences.runtime === 'all' || (preferences.runtime === 'under-90' ? title.runtime < 90 : preferences.runtime === '90-120' ? title.runtime >= 90 && title.runtime <= 120 : title.runtime > 120);
    const periodOkay = preferences.period === 'all' || title._period === preferences.period;
    return formatOkay && languageOkay && genreOkay && runtimeOkay && periodOkay;
  });
  const formatFiltered = filter(initial).map((title) => providerEnrich(title, preferences.region)).filter((title) => preferences.anyServices || title.providers.some((p) => preferences.services.includes(p.id)));
  if (formatFiltered.length >= 5 || TITLES.length <= 60) return formatFiltered;
  const expanded = filter(TITLES.slice(60, 120)).map((title) => providerEnrich(title, preferences.region)).filter((title) => preferences.anyServices || title.providers.some((p) => preferences.services.includes(p.id)));
  return [...formatFiltered, ...expanded];
}
function runEngine() {
  const eligible = eligibleTitles();
  const mean = eligible.reduce((sum, t) => sum + t.rating, 0) / (eligible.length || 1);
  return eligible.map((title) => computeScore(title, mean)).sort((a, b) => b.score - a.score || b.ratingScore - a.ratingScore);
}

function Header() { return `<header class="site-header"><a class="wordmark" href="#/" aria-label="Frame & Grain home">FRAME <span>&amp;</span> GRAIN</a><nav><a href="#/discover">DISCOVER</a><a href="#/index">INDEX</a><a href="#/about">ABOUT</a></nav><span class="header-note">GOOD FILMS. BETTER DAYS.</span></header>`; }
function Footer() { return `<footer><div><strong>FRAME &amp; GRAIN</strong><span>Good films. Better days.</span></div><nav><a href="#/discover">DISCOVER</a><a href="#/index">INDEX</a><a href="#/about">ABOUT</a></nav><small>This product uses the TMDB API but is not endorsed or certified by TMDB.</small></footer>`; }
function Shell(content) { return `${Header()}<main>${content}</main>${Footer()}`; }
function hero() { return `<section class="hero"><div class="hero-image" style="background-image:url('${TITLES[0].backdrop}')"></div><div class="hero-copy"><p class="eyebrow">A DIGITAL INDEPENDENT CINEMA</p><h1>A BETTER<br>STORY <em>AWAITS.</em></h1><p class="hero-lede">Thoughtful recommendations for every mood, moment, and kind of story.</p><div class="actions"><a class="button button-light" href="#/discover">FIND MY FILM <span>→</span></a><button class="button button-outline" data-action="lucky-home">I'M FEELING LUCKY <span>→</span></button></div></div><div class="hero-caption">STORIES<br>FOR EVERY<br>KIND OF YOU.</div><div class="hero-mark">FRAME &amp; GRAIN<br><span>GOOD FILMS. BETTER DAYS.</span></div></section>`; }
const stepData = [
  { key: 'region', question: 'WHERE ARE YOU WATCHING FROM?', sub: 'Availability changes by territory.', options: Object.entries(REGIONS).map(([value, label]) => ({ value, label })) },
  { key: 'services', question: 'WHAT DO YOU HAVE?', sub: 'Choose what you already have access to.', options: [{ value: 'any', label: 'ANY SERVICE I HAVE ACCESS TO' }, ...Object.entries(SERVICES).map(([value, label]) => ({ value, label }))] },
  { key: 'format', question: 'WHAT ARE WE SHOWING?', sub: 'Leave it open if the story matters more than the format.', options: [{ value: 'all', label: 'ANY FORMAT' }, { value: 'movie', label: 'MOVIES' }, { value: 'series', label: 'SERIES' }, { value: 'anime', label: 'ANIME' }] },
  { key: 'language', question: 'WHAT LANGUAGE?', sub: 'The original voice of the story.', options: ['all', 'English', 'Hindi', 'Malayalam', 'Tamil', 'Telugu', 'Japanese', 'Korean', 'French'].map((value) => ({ value, label: value === 'all' ? 'ANY LANGUAGE' : value })) },
  { key: 'mood', question: 'WHAT KIND OF STORY ARE YOU IN THE MOOD FOR?', sub: 'A soft signal, never a hard exclusion.', options: [{ value: 'all', label: 'ANY MOOD' }, ...Object.entries(MOODS).map(([value, item]) => ({ value, label: item.label }))] },
  { key: 'runtime', question: 'HOW MUCH TIME HAVE YOU GOT?', sub: 'A little structure for the evening.', options: [{ value: 'all', label: 'ANY RUNTIME' }, { value: 'under-90', label: 'UNDER 90 MIN' }, { value: '90-120', label: '90–120 MIN' }, { value: 'over-120', label: 'TWO HOURS OR MORE' }] },
  { key: 'period', question: 'WHEN SHOULD THE STORY COME FROM?', sub: 'A decade, a feeling, or no boundary at all.', options: [{ value: 'all', label: 'ANY YEAR' }, '2020s', '2010s', '2000s', '1990s', 'classics'].map((value) => ({ value, label: value === 'all' ? 'ANY YEAR' : value })) }
];
let step = 0;
function discover() { const item = stepData[step]; const value = item.key === 'services' ? (preferences.anyServices ? 'any' : preferences.services[0]) : preferences[item.key]; return `<section class="discovery"><div class="discovery-aside"><p class="eyebrow">PROGRAMME SELECTION</p><div class="progress"><span>0${step + 1} / 07</span><i style="width:${((step + 1) / 7) * 100}%"></i></div><p class="aside-note">One considered choice at a time. You can leave any criterion open.</p></div><div class="question"><p class="eyebrow">SCREEN ${String(step + 1).padStart(2, '0')} / 07</p><h1>${item.question}</h1><p class="question-sub">${item.sub}</p><div class="choice-grid ${item.key === 'region' ? 'region-grid' : ''}">${item.options.map((option) => `<button class="choice ${((item.key === 'services' ? (option.value === 'any' ? preferences.anyServices : preferences.services.includes(option.value)) : value === option.value) ? 'selected' : '')}" data-choice="${item.key}" data-value="${option.value}">${esc(option.label)}<span>↗</span></button>`).join('')}</div><div class="step-actions">${step ? '<button class="text-button" data-action="back">← BACK</button>' : '<span></span>'}<button class="button button-light" data-action="next">${step === 6 ? 'FIND MY FILM →' : 'NEXT SCREEN →'}</button></div></div></section>`; }
function resultCard(title, index) { return `<article class="recommendation"><a class="poster-link" href="#/title/${title.mediaType}/${title.sourceId}"><img src="${title.poster}" alt="${esc(title.title)} poster" loading="lazy"><span>${index === 0 ? 'BEST MATCH' : 'VIEW FILM'} ↗</span></a><div class="rec-copy"><p class="meta">${yearOf(title)} · ${title.contentClass} · ${esc(title.originalLanguage)}</p><h2>${esc(title.title)}</h2><p class="rating"><b>★ ${title.rating.toFixed(1)}</b><span>${Math.round(title.voteCount / 1000)}K votes</span></p><p class="why"><b>WHY THIS ONE?</b>${esc(title.reasons.join('. '))}.</p><div class="where"><b>WHERE TO WATCH</b><span>${title.providers.map((p) => esc(p.name)).join(' · ') || 'Availability unavailable'}</span></div><a class="detail-link" href="#/title/${title.mediaType}/${title.sourceId}">VIEW FILM →</a></div></article>`; }
function results() { currentResults = runEngine(); const count = currentResults.length; const thin = count > 0 && count < 5; return `<section class="results"><div class="results-heading"><p class="eyebrow">THE LOBBY / ${REGIONS[preferences.region]}</p><h1>TONIGHT'S <em>PICKS</em></h1><p>${count ? `${count} ${count === 1 ? 'film fits' : 'films fit'} your criteria. Here are your strongest matches.` : 'We couldn’t find a match without loosening your preferences.'}</p></div>${count ? `<div class="results-grid">${currentResults.slice(0, 8).map(resultCard).join('')}</div>${thin ? `<div class="state-note"><h2>${count} FILM${count === 1 ? '' : 'S'} FIT YOUR CRITERIA.</h2><p>We couldn't find more without loosening your preferences.</p><button class="button button-light" data-action="widen">WIDEN THE SEARCH →</button></div>` : ''}` : `<div class="empty-state"><span class="empty-chair">□</span><h2>NO SCREENING FOUND.</h2><p>We couldn't find a match without loosening your preferences.</p><button class="button button-light" data-action="widen">WIDEN THE SEARCH →</button></div>`}</section>`; }
function lucky(title) { return `<section class="lucky"><div class="lucky-heading"><p class="eyebrow">SURPRISE SCREENING</p><h1>YOUR <em>LUCKY</em> PICK</h1><p>Sometimes the best stories are the ones you did not plan for.</p></div><div class="lucky-card"><img src="${title.poster}" alt="${esc(title.title)} poster"><div><p class="meta">${yearOf(title)} · ${title.contentClass} · ${esc(title.originalLanguage)} · ${formatRuntime(title.runtime, title.contentClass)}</p><h2>${esc(title.title)}</h2><p class="rating"><b>★ ${title.rating.toFixed(1)}</b><span>${Math.round(title.voteCount / 1000)}K votes</span></p><p class="why"><b>WHY THIS ONE?</b>${esc(title.reasons[0])}.</p><div class="where"><b>WHERE TO WATCH</b><span>${title.providers.map((p) => esc(p.name)).join(' · ')}</span></div><div class="actions"><a class="button button-light" href="#/title/${title.mediaType}/${title.sourceId}">VIEW FILM →</a><button class="button button-outline" data-action="try-lucky">TRY ANOTHER →</button></div></div></div></section>`; }
function detail(id) { const title = TITLES.find((item) => item.sourceId === id) || currentResults.find((item) => item.sourceId === id); if (!title) return `<section class="empty-state"><h2>FILM NOT FOUND.</h2><a class="button button-light" href="#/index">RETURN TO INDEX →</a></section>`; const enriched = providerEnrich(title, preferences.region); const scored = computeScore(enriched, title.rating); return `<section class="detail"><div class="detail-art" style="background-image:url('${title.backdrop}')"></div><div class="detail-poster"><img src="${title.poster}" alt="${esc(title.title)} poster"></div><div class="detail-copy"><p class="eyebrow">FILM PROGRAMME / ${title.contentClass.toUpperCase()}</p><h1>${esc(title.title)}</h1><p class="meta">${yearOf(title)} · ${title.contentClass} · ${esc(title.originalLanguage)} · ${formatRuntime(title.runtime, title.contentClass)}</p><p class="rating"><b>★ ${title.rating.toFixed(1)}</b><span>${Math.round(title.voteCount / 1000)}K votes</span></p><p class="overview">${esc(title.overview)}</p><div class="why"><b>WHY THIS ONE?</b>${esc(scored.reasons.join('. '))}.</div><div class="where"><b>WHERE TO WATCH</b><span>${enriched.providers.map((p) => `${esc(p.name)} · ${p.type === 'flatrate' ? 'Included with subscription' : 'Rent or buy'}`).join('<br>') || 'Not listed for this region.'}</span></div><a class="detail-link" href="#/results">← BACK TO PICKS</a></div></section>`; }
function indexPage() { const picks = TITLES.slice().sort((a, b) => b.rating - a.rating).slice(0, 12); return `<section class="index-page"><div class="results-heading"><p class="eyebrow">THE INDEX / A SMALL CATALOGUE</p><h1>GOOD STORIES, <em>IN FRAME.</em></h1><p>A quieter way to browse. Start with a poster, then follow the story.</p></div><div class="index-grid">${picks.map((title, i) => `<a class="index-card" href="#/title/${title.mediaType}/${title.sourceId}"><img src="${title.poster}" alt="${esc(title.title)} poster" loading="lazy"><div><h2>${esc(title.title)}</h2><span>${yearOf(title)} · ★ ${title.rating.toFixed(1)}</span></div></a>`).join('')}</div></section>`; }
function about() { return `<section class="about"><p class="eyebrow">ABOUT THE FILM HOUSE</p><h1>FOR PEOPLE WHO<br><em>CARE ABOUT STORIES.</em></h1><div class="about-copy"><p>Frame &amp; Grain is a small recommendation prototype for the moment before you press play. Tell us where you watch, what kind of story you are after, and how much time you have. We look for a strong fit rather than a long list.</p><p>Recommendations are ranked from a normalized catalogue using genre, rating quality, language, mood, runtime, and release period. Availability depends on the selected region and the provider data available to us.</p><p class="tmdb">This product uses the TMDB API but is not endorsed or certified by TMDB.</p></div></section>`; }
function render() { const hash = location.hash || '#/'; const [route, type, id] = hash.replace(/^#\//, '').split('/'); if (route === 'lucky' && !luckyPool.length) { luckyPool = runEngine(); luckyIndex = weightedPick(luckyPool); } let content = route === 'discover' ? discover() : route === 'results' ? results() : route === 'index' ? indexPage() : route === 'about' ? about() : route === 'title' ? detail(id) : route === 'lucky' ? lucky(luckyPool[luckyIndex] || luckyPool[0]) : hero(); document.querySelector('#app').innerHTML = Shell(content); bind(); window.scrollTo({ top: 0, behavior: 'instant' }); }
function updateChoice(key, value) { if (key === 'services') { if (value === 'any') { preferences.anyServices = true; preferences.services = []; } else { preferences.anyServices = false; preferences.services = preferences.services.includes(value) ? preferences.services.filter((item) => item !== value) : [...preferences.services, value]; if (!preferences.services.length) preferences.anyServices = true; } } else preferences[key] = value; }
function bind() { document.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => { updateChoice(button.dataset.choice, button.dataset.value); render(); })); document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => { const action = button.dataset.action; if (action === 'next') { if (step < 6) step += 1; else location.hash = '#/results'; } if (action === 'back') step = Math.max(0, step - 1); if (action === 'widen') { preferences = { ...preferences, format: 'all', language: 'all', genre: 'all', mood: 'all', runtime: 'all', period: 'all' }; location.hash = '#/results'; } if (action === 'lucky-home') { preferences = { ...defaults, anyServices: true, services: [] }; luckyPool = runEngine(); luckyIndex = weightedPick(luckyPool); location.hash = '#/lucky'; } if (action === 'try-lucky') { const previous = luckyIndex; luckyIndex = weightedPick(luckyPool, previous); if (luckyIndex === previous && luckyPool.length > 1) luckyIndex = (previous + 1) % luckyPool.length; location.hash = '#/lucky'; } render(); })); }
function weightedPick(pool, previous = -1) { if (!pool?.length) return 0; const candidates = pool.map((title, index) => ({ title, index })).filter((item) => item.index !== previous); const weights = candidates.map(({ title }) => Math.max(1, title.score)); const total = weights.reduce((sum, weight) => sum + weight, 0); let cursor = Math.random() * total; for (let i = 0; i < candidates.length; i += 1) { cursor -= weights[i]; if (cursor <= 0) return candidates[i].index; } return candidates[0].index; }
window.addEventListener('hashchange', render); render();
