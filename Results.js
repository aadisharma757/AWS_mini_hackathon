// Results page: calls our own server (/api/search), never Gemini directly,
// so your API key stays private on the server.
(() => {
  const params = new URLSearchParams(window.location.search);
  const query = (params.get('q') || '').trim();
  if (query.length < 2) {
    window.location.replace('index.html');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const placeEl = $('place');
  const summaryEl = $('summary');
  const statusEl = $('status');
  const listEl = $('list');
  const sourcesEl = $('sources');

  $('q').value = query;
  placeEl.textContent = query;
  document.title = `${query} · thekation`;

  const LOADING = [
    "Reading reviews so you don't have to",
    'Checking who actually keeps the lights on',
    'Peeking into the fridge',
    'Doing the safety math',
    'Ranking the top five',
  ];
  let loadingTimer = 0;

  /* tiny DOM helper: AI text only ever goes through textContent */
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  /* ---------- wording ---------- */
  function safetyTone(score) {
    if (score >= 8) return { tone: 'good', verdict: 'Walk right in.' };
    if (score >= 6) return { tone: 'ok', verdict: 'Mostly fine.' };
    if (score >= 4) return { tone: 'meh', verdict: 'Bring a buddy.' };
    return { tone: 'bad', verdict: 'Not tonight.' };
  }

  function vibeVerdict(score) {
    if (score >= 8) return 'Main character energy.';
    if (score >= 6) return 'Solid, no notes.';
    if (score >= 4) return 'Mid, but fine.';
    return 'Pass.';
  }

  function oddsWord(pct) {
    if (pct >= 70) return 'Very likely';
    if (pct >= 40) return 'Could be';
    return 'Unlikely';
  }

  const CONFIDENCE = {
    high: 'Strong signal online',
    medium: 'Decent signal, double-check',
    low: 'Thin info online, be extra careful',
  };

  const FRIDGE = [
    ['fruityCoolers', 'Fruity coolers', 'minty jamun types'],
    ['seltzersRtds', 'Seltzers & RTDs', 'buzzball-style cans'],
    ['craftBeerWine', 'Craft beer & wine', 'the grown-up shelf'],
  ];

  /* ---------- building blocks ---------- */
  function stat(label, score, verdict, note, extra = {}) {
    return el(
      'div',
      { class: `stat ${extra.cls || ''}`, 'data-tone': extra.tone },
      el(
        'div',
        { class: 'stat-top' },
        el('span', { class: 'mono', text: label }),
        el('span', { class: 'stat-num' }, String(score), el('small', { text: '/10' }))
      ),
      el(
        'div',
        { class: 'cells', role: 'img', 'aria-label': `${label} ${score} out of 10` },
        Array.from({ length: 10 }, (_, i) => el('i', { class: i < score ? 'on' : '' }))
      ),
      el('div', { class: 'verdict', text: verdict }),
      note ? el('p', { class: 'stat-note', text: note }) : null
    );
  }

  function fridgeItem([key, name, sub], shop) {
    const pct = shop.fridge[key];
    return el(
      'div',
      { class: 'f-item' },
      el('div', { class: 'f-name', text: name }),
      el('div', { class: 'f-sub', text: sub }),
      el('div', { class: 'f-meter', role: 'img', 'aria-label': `${name}: ${pct} percent` }, el('i', { style: `width:${pct}%` })),
      el('div', { class: 'f-odds' }, el('span', { text: oddsWord(pct) }), el('b', { text: `${pct}%` }))
    );
  }

  function mapsUrl(shop, place) {
    const q = [shop.name, shop.address || shop.area || place].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  function placeLine(shop) {
    const a = shop.area.toLowerCase();
    if (shop.address && a && shop.address.toLowerCase().includes(a)) return shop.address;
    return [shop.area, shop.address].filter(Boolean).join(' · ');
  }

  function shopCard(shop, index, place) {
    const safety = safetyTone(shop.safetyScore);
    const flags = [
      ...shop.greenFlags.map((f) => el('li', { class: 'tag plus', text: `+ ${f}` })),
      ...shop.redFlags.map((f) => el('li', { class: 'tag minus', text: `− ${f}` })),
    ];

    return el(
      'article',
      { class: 'shop' },
      el('div', { class: 'shop-rank', 'aria-hidden': 'true', text: String(index + 1).padStart(2, '0') }),

      el(
        'header',
        { class: 'shop-head' },
        el('h2', { text: shop.name }),
        el('p', { class: 'mono', text: placeLine(shop) })
      ),

      el(
        'div',
        { class: 'shop-body' },
        shop.vibe ? el('p', { class: 'vibe', text: shop.vibe }) : null,
        flags.length ? el('ul', { class: 'tags' }, flags) : null
      ),

      el(
        'div',
        { class: 'shop-stats' },
        stat('Safety', shop.safetyScore, safety.verdict, shop.safetyNote, { tone: safety.tone }),
        stat('Vibe', shop.vibeScore, vibeVerdict(shop.vibeScore), '', { cls: 'vibe-stat' }),
        el(
          'div',
          { class: 'rating-row' },
          el('span', { class: 'mono', text: 'Rating' }),
          shop.rating !== null
            ? el('b', {}, `★ ${shop.rating.toFixed(1)} `, shop.reviewCount ? el('small', { text: `(${shop.reviewCount.toLocaleString('en-IN')})` }) : null)
            : el('b', { text: 'not rated' })
        )
      ),

      el(
        'div',
        { class: 'shop-fridge' },
        el('span', { class: 'mono', text: 'In the fridge · our odds' }),
        el('div', { class: 'fridge-grid' }, FRIDGE.map((f) => fridgeItem(f, shop)))
      ),

      el(
        'div',
        { class: 'shop-foot' },
        el('span', { class: 'mono', text: `Confidence: ${shop.confidence}. ${CONFIDENCE[shop.confidence]}` }),
        el('a', {
          class: 'maps mono',
          href: mapsUrl(shop, place),
          target: '_blank',
          rel: 'noopener noreferrer',
          text: 'Open in Maps ↗',
        })
      )
    );
  }

  /* ---------- states ---------- */
  function showLoading() {
    let i = 0;
    const msg = el('p', { class: 'load-msg mono', text: LOADING[0] });
    statusEl.replaceChildren(el('div', { class: 'loadline' }), msg);
    listEl.replaceChildren(
      ...Array.from({ length: 3 }, () => el('div', { class: 'sk', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')))
    );
    clearInterval(loadingTimer);
    loadingTimer = setInterval(() => {
      i += 1;
      msg.textContent = `${LOADING[i % LOADING.length]}…`;
    }, 2400);
  }

  function stopLoading() {
    clearInterval(loadingTimer);
    statusEl.replaceChildren();
  }

  function showError(message) {
    stopLoading();
    listEl.replaceChildren(
      el(
        'div',
        { class: 'err' },
        el('p', { text: message }),
        el('a', { class: 'maps mono', href: `results.html?q=${encodeURIComponent(query)}`, text: 'Try again' })
      )
    );
  }

  function render(data) {
    stopLoading();
    placeEl.textContent = data.location;
    summaryEl.textContent = data.summary || '';
    document.title = `${data.location} · thekation`;
    listEl.replaceChildren(...data.shops.map((s, i) => shopCard(s, i, data.location)));

    if (data.sources && data.sources.length) {
      sourcesEl.replaceChildren(
        'Sources',
        ...data.sources.map((s) => el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }))
      );
      sourcesEl.hidden = false;
    }
  }

  /* ---------- go ---------- */
  async function load() {
    showLoading();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 100000);
    try {
      const res = await fetch('api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: query }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
      render(data);
    } catch (err) {
      showError(err.name === 'AbortError' ? 'That took too long. Try again in a moment.' : err.message || 'Something went wrong. Try again.');
    } finally {
      clearTimeout(timeout);
    }
  }

  load();
})();