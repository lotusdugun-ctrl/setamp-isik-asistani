// SetAmp PRO — Temiz, Modern, Çevrimdışı Sinema Işık Asistanı (Amper + kW + Lamba Görselleri)
(function () {
  const STORAGE_KEY = 'setamp_pro_state_v1';

  const CABLES = window.SET_CABLES || [];
  const BASE_FIXTURES = window.SET_FIXTURES || [];
  const TEMPLATES = window.TRUCK_TEMPLATES || [];
  const DEFAULT_EXPENDABLES = window.DEFAULT_EXPENDABLES || [];
  const Calc = window.SetCalc;

  const NAMED_BRANDS = ['ARRI', 'Aputure', 'Godox', 'Nanlux', 'Astera', 'Creamsource', 'Kino Flo'];
  const BRANDS = ['Tümü', ...NAMED_BRANDS, 'Diğer'];
  const FIXTURE_TYPES = ['Tümü', 'HMI', 'LED COB', 'LED Panel', 'LED Tüp', 'Tungsten'];
  const TRUCK_CATEGORIES = ['Tümü', 'Lamba', 'Kablo', 'Stand & Grip', 'Aksesuar'];
  const EXP_CATEGORIES = ['Tümü', 'Bant', 'Difüzyon', 'Renk Jelatini', 'Kontrol', 'Aksesuar', 'Güvenlik'];

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Her lamba için uygun stüdyo görselini (fotoğraf veya özel yüklenen görsel) döndürür
   */
  function getFixtureImage(fixture) {
    if (!fixture) return './assets/lamps/aputure-cob.jpg';
    if (fixture.image) return fixture.image;

    const id = (fixture.id || '').toLowerCase();
    const model = (fixture.model || '').toLowerCase();
    const brand = (fixture.brand || '').toLowerCase();
    const type = fixture.type || '';

    if (type === 'HMI') return './assets/lamps/arri-hmi.jpg';
    if (type === 'LED Tüp') return './assets/lamps/led-tubes.svg';
    if (type === 'Tungsten') {
      if (id.includes('dino') || id.includes('space') || model.includes('dino') || model.includes('space')) {
        return './assets/lamps/dino-bank.svg';
      }
      return './assets/lamps/tungsten-fresnel.svg';
    }
    if (type === 'LED Panel') {
      if (model.includes('mat') || model.includes('slim') || model.includes('f21') || model.includes('f22') || model.includes('f200') || model.includes('f400') || model.includes('f600') || model.includes('f800')) {
        return './assets/lamps/flex-mat.svg';
      }
      if (brand === 'creamsource' || model.includes('vortex') || model.includes('hard') || model.includes('brick')) {
        return './assets/lamps/hard-panel.jpg';
      }
      return './assets/lamps/arri-skypanel.jpg';
    }
    if (brand === 'godox') return './assets/lamps/godox-cob.jpg';
    if (brand === 'arri' && model.includes('fresnel')) return './assets/lamps/arri-hmi.jpg';
    return './assets/lamps/aputure-cob.jpg';
  }

  function buildInitialTruckItems() {
    const tpl = TEMPLATES[0];
    if (!tpl) return [];
    return tpl.items.map((item) => ({
      id: uid('inv'),
      category: item.category,
      name: item.name,
      fixtureId: item.fixtureId || null,
      cableId: item.cableId || null,
      qty: item.qty,
      status: 'pending',
      note: ''
    }));
  }

  function normalizeCableId(id) {
    const legacyMap = {
      '16a-tri': '16a-mono',
      '32a-tri': '32a-mono',
      '63a-tri': '63a-mono',
      '125a-tri': '125a-mono',
      '400a-powerlock': '125a-mono'
    };
    const mapped = legacyMap[id] || id;
    return CABLES.some((c) => c.id === mapped) ? mapped : '16a-mono';
  }

  function mergeSinglePhaseLoad(items) {
    const merged = new Map();
    for (const it of items) {
      if (!it || !it.fixtureId) continue;
      if (merged.has(it.fixtureId)) {
        merged.get(it.fixtureId).qty += Number(it.qty) || 1;
      } else {
        merged.set(it.fixtureId, { uid: it.uid || uid('ld'), fixtureId: it.fixtureId, qty: Number(it.qty) || 1, phase: 0 });
      }
    }
    return Array.from(merged.values());
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const selId = normalizeCableId(parsed.selectedCableId || '16a-mono');
        const selCable = CABLES.find((c) => c.id === selId) || CABLES[0];
        const savedSection = Number(parsed.cableSection);
        return {
          activeTab: parsed.activeTab || 'calc',
          catalogSubtab: parsed.catalogSubtab || 'lamps',
          theme: ['studio', 'light', 'night'].includes(parsed.theme) ? parsed.theme : (parsed.nightRed ? 'night' : 'studio'),
          selectedCableId: selId,
          catalogCableId: normalizeCableId(parsed.catalogCableId || selId),
          cableLength: Number(parsed.cableLength) || selCable.defaultLength,
          cableSection: selCable.availableSections.includes(savedSection) ? savedSection : selCable.defaultCrossSection,
          loadItems: Array.isArray(parsed.loadItems) ? mergeSinglePhaseLoad(parsed.loadItems) : [],
          customFixtures: Array.isArray(parsed.customFixtures) ? parsed.customFixtures : [],
          projectName: parsed.projectName ?? 'Örnek Set — Dizi 1. Ünite',
          rentalHouse: parsed.rentalHouse ?? 'Standart Işık Kamyonu',
          truckItems: Array.isArray(parsed.truckItems) ? parsed.truckItems : buildInitialTruckItems(),
          expendables: Array.isArray(parsed.expendables) ? parsed.expendables : DEFAULT_EXPENDABLES.map((e) => ({ ...e }))
        };
      }
    } catch (_) {
      // ignore storage errors
    }

    return {
      activeTab: 'calc',
      catalogSubtab: 'lamps',
      theme: 'studio',
      selectedCableId: '16a-mono',
      catalogCableId: '16a-mono',
      cableLength: 20,
      cableSection: 2.5,
      loadItems: [
        { uid: uid('ld'), fixtureId: 'arri-m18', qty: 1, phase: 0 },
        { uid: uid('ld'), fixtureId: 'aputure-600d-pro', qty: 1, phase: 0 }
      ],
      customFixtures: [],
      projectName: 'Örnek Set — Dizi 1. Ünite',
      rentalHouse: 'Standart Işık Kamyonu',
      truckItems: buildInitialTruckItems(),
      expendables: DEFAULT_EXPENDABLES.map((e) => ({ ...e }))
    };
  }

  const state = loadState();

  const ui = {
    quickSearch: '',
    quickBrand: 'Tümü',
    catalogSearch: '',
    catalogBrand: 'Tümü',
    catalogType: 'Tümü',
    truckStatusFilter: 'all',
    truckCatFilter: 'Tümü',
    truckSearch: '',
    expCatFilter: 'Tümü',
    cableSettingsOpen: false,
    truckSettingsOpen: false,
    lightboxFixtureId: null
  };

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore quota errors
    }
  }

  function getAllFixtures() {
    return [...state.customFixtures, ...BASE_FIXTURES];
  }

  function getFixtureMap() {
    const map = {};
    for (const f of getAllFixtures()) map[f.id] = f;
    return map;
  }

  function getCable(id) {
    return CABLES.find((c) => c.id === id) || CABLES[0];
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ==================== NAVIGATION & THEME ====================
  function setTab(tabId) {
    state.activeTab = tabId;
    saveState();
    document.querySelectorAll('.tab-panel').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `tab-${tabId}`);
    });
    document.querySelectorAll('.side-nav-btn, .bnav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderAll();
  }

  function setTheme(themeName) {
    const valid = ['studio', 'light', 'night'].includes(themeName) ? themeName : 'studio';
    state.theme = valid;
    document.body.classList.toggle('theme-light', valid === 'light');
    document.body.classList.toggle('night-red', valid === 'night');
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === valid);
    });
    const mobBtn = document.getElementById('mobileThemeBtn');
    const labels = { studio: 'Stüdyo', light: 'Açık', night: 'Gece' };
    if (mobBtn) {
      mobBtn.textContent = labels[valid];
      mobBtn.classList.toggle('active', valid === 'night');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', valid === 'night' ? '#000000' : valid === 'light' ? '#ffffff' : '#1e222b');
    }
    saveState();
  }

  // ==================== LIGHTBOX ====================
  function openLampLightbox(fixtureId) {
    const f = getFixtureMap()[fixtureId];
    if (!f) return;
    ui.lightboxFixtureId = fixtureId;
    const fc = Calc.calcFixtureAmps(f);
    document.getElementById('lbBrandTag').textContent = f.brand;
    document.getElementById('lbTypeTag').textContent = f.type;
    document.getElementById('lbTitle').textContent = f.model;
    const img = document.getElementById('lbImage');
    img.src = getFixtureImage(f);
    img.alt = `${f.brand} ${f.model}`;
    document.getElementById('lbSpecs').innerHTML = `
      <div class="lightbox-spec-box">
        <div class="strip-k">Akım (230V)</div>
        <div style="font-size:16px; font-weight:800; color:var(--accent);">${fc.continuousAmps.toFixed(1)} A</div>
      </div>
      <div class="lightbox-spec-box">
        <div class="strip-k">Güç</div>
        <div style="font-size:16px; font-weight:800;">${fc.kwText}</div>
      </div>
      <div class="lightbox-spec-box">
        <div class="strip-k">Min Soket</div>
        <div style="font-size:16px; font-weight:800;">${f.minSocketAmps} A</div>
      </div>
    `;
    document.getElementById('lbNote').textContent = `${f.colorTemp ? f.colorTemp + ' • ' : ''}PF ${f.pf} — ${f.notes || ''}`;
    openModal('lampLightboxModal');
  }

  // ==================== CALCULATOR ACTIONS ====================
  function selectCalcCable(cableId, rebalanceOnUpgrade = true) {
    const prevCable = getCable(state.selectedCableId);
    const nextCable = getCable(cableId);
    state.selectedCableId = nextCable.id;
    state.cableSection = nextCable.defaultCrossSection;
    if (state.cableLength === prevCable.defaultLength || nextCable.id === 'turk-uclu' || prevCable.id === 'turk-uclu') {
      state.cableLength = nextCable.defaultLength;
    }

    const fixtureMap = getFixtureMap();
    if (nextCable.phases === 1) {
      const merged = new Map();
      for (const it of state.loadItems) {
        if (merged.has(it.fixtureId)) {
          merged.get(it.fixtureId).qty += it.qty;
        } else {
          merged.set(it.fixtureId, { ...it, phase: 0 });
        }
      }
      state.loadItems = Array.from(merged.values());
    } else if (rebalanceOnUpgrade && prevCable.phases === 1 && state.loadItems.length > 0) {
      state.loadItems = Calc.autoBalanceItems(nextCable, state.loadItems, fixtureMap);
    }

    saveState();
    renderAll();
  }

  function addFixtureToLoad(fixtureId) {
    const cable = getCable(state.selectedCableId);
    const fixtureMap = getFixtureMap();
    const fixture = fixtureMap[fixtureId];
    if (!fixture) return;

    let targetPhase = 0;
    if (cable.phases === 3) {
      const currentEval = Calc.evaluateLineLoad(cable, state.loadItems, fixtureMap, {
        lengthMeters: state.cableLength,
        crossSection: state.cableSection
      });
      const pAmps = currentEval.phaseAmps;
      targetPhase = 0;
      if (pAmps[1] < pAmps[targetPhase]) targetPhase = 1;
      if (pAmps[2] < pAmps[targetPhase]) targetPhase = 2;
    }

    const existing = state.loadItems.find((x) => x.fixtureId === fixtureId && x.phase === targetPhase);
    if (existing) {
      existing.qty += 1;
    } else {
      state.loadItems.push({ uid: uid('ld'), fixtureId, qty: 1, phase: targetPhase });
    }

    saveState();
    renderCalcTab();
    renderLiveBadges();
    const pText = cable.phases === 3 ? ` (Faz ${['R', 'S', 'T'][targetPhase]})` : '';
    showToast(`+1 ${fixture.brand} ${fixture.model}${pText}`);
  }

  function updateLoadItemQty(itemUid, delta) {
    const idx = state.loadItems.findIndex((x) => x.uid === itemUid);
    if (idx === -1) return;
    state.loadItems[idx].qty += delta;
    if (state.loadItems[idx].qty <= 0) state.loadItems.splice(idx, 1);
    saveState();
    renderCalcTab();
    renderLiveBadges();
  }

  function cycleLoadItemPhase(itemUid) {
    const cable = getCable(state.selectedCableId);
    if (cable.phases <= 1) return;
    const item = state.loadItems.find((x) => x.uid === itemUid);
    if (!item) return;
    item.phase = (item.phase + 1) % cable.phases;
    saveState();
    renderCalcTab();
    renderLiveBadges();
  }

  function rebalanceCurrentLoad() {
    const cable = getCable(state.selectedCableId);
    state.loadItems = Calc.autoBalanceItems(cable, state.loadItems, getFixtureMap());
    saveState();
    renderCalcTab();
    renderLiveBadges();
    showToast('Fazlar (R-S-T) otomatik dengelendi');
  }

  // ==================== SHARED CABLE STRIP RENDERER ====================
  function renderCableStrip(containerId, activeCableId, onSelect) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = CABLES.map((c) => {
      const cp = Calc.calcCablePower(c);
      const isActive = c.id === activeCableId;
      return `
        <button class="cable-card-btn ${isActive ? 'active' : ''}" data-cbtn="${c.id}">
          <div class="cc-top">
            <span class="cc-amp mono">${c.id === 'turk-uclu' ? 'Üçlü' : `${c.ratedAmps}A`}</span>
            <span class="cc-phase mono">${c.id === 'turk-uclu' ? 'Türk' : '230V'}</span>
          </div>
          <div class="cc-kw mono">${cp.ratedTotalKWText}</div>
          <div class="cc-safe mono">Güv: ${cp.safeAmpsPerPhase}A · ${cp.safeTotalKWText}</div>
        </button>
      `;
    }).join('');
    el.querySelectorAll('[data-cbtn]').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.cbtn));
    });
  }

  // ==================== LIVE SHELL BADGES ====================
  function renderLiveBadges() {
    const cable = getCable(state.selectedCableId);
    const ev = Calc.evaluateLineLoad(cable, state.loadItems, getFixtureMap(), {
      lengthMeters: state.cableLength,
      crossSection: state.cableSection
    });

    const sideCard = document.getElementById('sidebarLiveCard');
    if (sideCard) {
      sideCard.className = `sidebar-live-card status-${ev.status}`;
      document.getElementById('sideLiveCable').textContent = `${cable.shortName} (${ev.cablePower.ratedTotalKWText})`;
      document.getElementById('sideLiveStats').textContent = `${ev.maxPhaseAmps.toFixed(1)}A • ${ev.totalKWText} (%${ev.peakUsagePercent})`;
      const sideBadge = document.getElementById('sideLiveBadge');
      if (sideBadge) {
        const cls = ev.status === 'SAFE' ? 'tag-safe' : ev.status === 'CAUTION' ? 'tag-caution' : ev.status === 'DANGER' ? 'tag-danger' : '';
        sideBadge.className = `tag ${cls} mono`;
        sideBadge.textContent = ev.status === 'EMPTY' ? 'YÜK YOK' : ev.status === 'SAFE' ? 'RİSKSİZ' : ev.status === 'CAUTION' ? 'DİKKAT' : 'RİSKLİ';
      }
      const sideBar = document.getElementById('sideLiveBarFill');
      if (sideBar) sideBar.style.width = `${Math.min(100, ev.peakUsagePercent)}%`;
    }

    const totalFixCount = getAllFixtures().length;
    const sideLampPill = document.getElementById('sideLampCountPill');
    if (sideLampPill) sideLampPill.textContent = totalFixCount;
    const catLampCount = document.getElementById('catalogLampCount');
    if (catLampCount) catLampCount.textContent = totalFixCount;

    const mobChip = document.getElementById('mobileLiveChip');
    if (mobChip) {
      mobChip.className = `live-chip mono status-${ev.status}`;
      document.getElementById('mobileLiveText').textContent = `${cable.badge} • ${ev.maxPhaseAmps.toFixed(1)}A · ${ev.totalKWText}`;
    }

    const issues = state.truckItems.filter((i) => i.status === 'missing' || i.status === 'faulty').length;
    ['sideTruckBadge', 'mobileTruckBadge'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.textContent = issues;
        b.style.display = issues > 0 ? 'grid' : 'none';
      }
    });

    const lowCount = state.expendables.filter((e) => Number(e.qty) <= Number(e.minQty)).length;
    ['sideExpBadge', 'mobileExpBadge'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        b.textContent = lowCount;
        b.style.display = lowCount > 0 ? 'grid' : 'none';
      }
    });
  }

  // ==================== RENDER: TAB 1 (HESAPLAYICI) ====================
  function renderCalcTab() {
    const cable = getCable(state.selectedCableId);
    const fixtureMap = getFixtureMap();
    const ev = Calc.evaluateLineLoad(
      cable,
      state.loadItems,
      fixtureMap,
      { lengthMeters: state.cableLength, crossSection: state.cableSection },
      CABLES
    );
    const cp = ev.cablePower;

    // 1. Kablo Şeridi
    renderCableStrip('calcCableSelector', cable.id, (id) => selectCalcCable(id));

    // 2. Hero Güç & Risk Göstergesi
    const riskBanner = document.getElementById('riskBanner');
    riskBanner.className = `hero-card status-${ev.status}`;

    const dropColor = ev.voltageDropPercent >= 5.5
      ? 'var(--danger)'
      : ev.voltageDropPercent >= 3.0
        ? 'var(--caution)'
        : 'var(--safe)';

    const totalRemSafeA = ev.phaseDetails.reduce((s, p) => s + p.remainingSafeAmps, 0);
    const totalRemSafeW = Math.max(0, totalRemSafeA * cable.voltage);

    let actionHtml = '';
    if (ev.canFixByRebalance) {
      actionHtml += `<button class="btn btn-primary btn-sm" id="bannerRebalanceBtn">Fazları Otomatik Dengele (Riski Kaldır)</button>`;
    }
    if (ev.recommendedCable) {
      actionHtml += `<button class="btn btn-safe btn-sm" id="bannerUpgradeBtn" data-cable="${ev.recommendedCable.id}">Güvenli Hata Geç: ${esc(ev.recommendedCable.shortName)} (${esc(ev.recommendedCable.ratedTotalKWText)})</button>`;
    }

    const barWidth = Math.min(100, ev.peakUsagePercent);
    const sectionPrefix = cable.phases === 3 ? '5×' : '3×';

    riskBanner.innerHTML = `
      <div class="hero-head">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span class="status-pill">${esc(ev.verdict.badge)}</span>
          <span class="hero-verdict-title" style="font-weight:700; font-size:14px;">${esc(ev.verdict.headline)}</span>
        </div>
        <button id="toggleCableSettingsBtn" class="cable-settings-toggle mono ${ui.cableSettingsOpen ? 'open' : ''}">
          ${state.cableLength}m • ${sectionPrefix}${state.cableSection}mm²
          <span>${ui.cableSettingsOpen ? '▴' : '▾'}</span>
        </button>
      </div>

      <div class="hero-readout">
        <div class="dual-big">
          <div class="big-metric">
            <span class="big-label">${cable.phases === 3 ? 'Tepe Faz Akımı' : 'Hat Akımı'}</span>
            <span class="big-num mono">
              ${ev.maxPhaseAmps.toFixed(1)} A
              <span class="big-sub">/ ${cable.ratedAmps}A</span>
            </span>
          </div>
          <span class="big-divider" aria-hidden="true"></span>
          <div class="big-metric">
            <span class="big-label">Toplam Güç (kW)</span>
            <span class="big-num mono">
              ${ev.totalKWText}
              <span class="big-sub">/ ${cp.ratedTotalKWText}</span>
            </span>
          </div>
        </div>
        <span class="pct-chip mono">%${ev.peakUsagePercent.toFixed(0)}</span>
      </div>

      <div class="gauge-wrap">
        <div class="bar-track">
          <div class="bar-fill ${ev.status}" style="width:${barWidth}%;"></div>
          <div class="bar-mark-80" style="left:${Math.round((cable.safeRatio || 0.8) * 100)}%;" title="Sürekli güvenli sınır"></div>
        </div>
        <div class="gauge-scale mono">
          <span>0</span>
          <span>Güvenli (%${Math.round((cable.safeRatio || 0.8) * 100)}): ${cp.safeAmpsPerPhase}A • ${cp.safeTotalKWText}</span>
          <span>Max (%100): ${cable.ratedAmps}A</span>
        </div>
      </div>

      <div class="hero-strip mono">
        <div class="strip-item">
          <span class="strip-k">Seçili Hat (${esc(cable.connector)})</span>
          <span class="strip-v">${esc(cable.shortName)} • ${cp.ratedTotalKWText}</span>
        </div>
        <div class="strip-item">
          <span class="strip-k">Kalan Güvenli Kapasite</span>
          <span class="strip-v" style="color:${totalRemSafeA > 0 ? 'var(--safe)' : 'var(--danger)'};">
            ${totalRemSafeA > 0 ? `+${totalRemSafeA.toFixed(1)}A · +${Calc.formatKW(totalRemSafeW)}` : 'Dolu (0A · 0 kW)'}
          </span>
        </div>
        <div class="strip-item">
          <span class="strip-k">Hat Sonu Voltaj (${state.cableLength}m)</span>
          <span class="strip-v" style="color:${dropColor};">${ev.deliveredVoltage}V (−%${ev.voltageDropPercent})</span>
        </div>
      </div>

      <div id="cableSettingsPanel" class="cable-settings-panel ${ui.cableSettingsOpen ? 'open' : ''}">
        <div>
          <label class="field-label" for="cableLengthInput">Kablo Uzunluğu (Metre)</label>
          <input id="cableLengthInput" class="input mono" type="number" min="1" max="300" step="5" value="${state.cableLength}" />
          <div class="len-chips">
            ${[5, 10, 20, 30, 50].map((m) =>
              `<button class="len-chip mono ${Number(state.cableLength) === m ? 'active' : ''}" data-len="${m}">${m}m</button>`
            ).join('')}
          </div>
        </div>
        <div>
          <label class="field-label" for="cableSectionSelect">Kablo Kesiti (mm²)</label>
          <select id="cableSectionSelect" class="select mono">
            ${cable.availableSections.map((s) =>
              `<option value="${s}" ${Number(state.cableSection) === s ? 'selected' : ''}>${sectionPrefix}${s} mm² ${s === cable.defaultCrossSection ? '(Standart)' : ''}</option>`
            ).join('')}
          </select>
          <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">
            Voltaj düşümü bakır kablo (50°C) üzerinden hesaplanır.
          </div>
        </div>
      </div>

      ${actionHtml ? `<div class="hero-actions">${actionHtml}</div>` : ''}
    `;

    // Hero içi dinamik olaylar
    document.getElementById('toggleCableSettingsBtn').addEventListener('click', () => {
      ui.cableSettingsOpen = !ui.cableSettingsOpen;
      renderCalcTab();
    });

    const lenInput = document.getElementById('cableLengthInput');
    lenInput.addEventListener('input', (e) => {
      state.cableLength = Math.max(1, Number(e.target.value) || 1);
      saveState();
      renderCalcTab();
    });
    riskBanner.querySelectorAll('[data-len]').forEach((b) => {
      b.addEventListener('click', () => {
        state.cableLength = Number(b.dataset.len);
        saveState();
        renderCalcTab();
      });
    });
    document.getElementById('cableSectionSelect').addEventListener('change', (e) => {
      state.cableSection = Number(e.target.value);
      saveState();
      renderCalcTab();
    });

    const rebBtn = document.getElementById('bannerRebalanceBtn');
    if (rebBtn) rebBtn.addEventListener('click', rebalanceCurrentLoad);

    const upgBtn = document.getElementById('bannerUpgradeBtn');
    if (upgBtn) {
      upgBtn.addEventListener('click', () => {
        const targetId = upgBtn.dataset.cable;
        selectCalcCable(targetId, true);
        const tc = getCable(targetId);
        if (tc.phases === 3) {
          state.loadItems = Calc.autoBalanceItems(tc, state.loadItems, getFixtureMap());
          saveState();
          renderAll();
        }
        showToast(`${tc.shortName} hattına geçildi`);
      });
    }

    // 3. 3 Faz R-S-T Kartı (Sadece 3 fazlı kabloda göster -> Mono kabloda kalabalık yapma!)
    const phaseCard = document.getElementById('phaseSectionCard');
    if (cable.phases === 3) {
      phaseCard.style.display = 'block';
      document.getElementById('autoBalanceBtn').style.display = state.loadItems.length > 0 ? 'inline-flex' : 'none';
      document.getElementById('phaseBarsContainer').innerHTML = ev.phaseDetails.map((pd) => {
        const w = Math.min(100, pd.percent);
        const tagCls = pd.status === 'DANGER' ? 'tag-danger' : pd.status === 'CAUTION' ? 'tag-caution' : 'tag-safe';
        return `
          <div class="phase-item">
            <div class="phase-top">
              <span class="phase-name">
                <span class="pdot p${pd.index}"></span>
                ${esc(pd.label)}
              </span>
              <span class="phase-nums mono">
                ${pd.amps.toFixed(1)}A / ${pd.ratedAmps}A
                <span style="color:var(--text-muted); margin:0 4px;">•</span>
                ${pd.kwText} / ${pd.ratedKWText}
                <span class="tag ${tagCls}" style="margin-left:5px;">%${pd.percent}</span>
              </span>
            </div>
            <div class="bar-track">
              <div class="bar-fill ${pd.status}" style="width:${w}%;"></div>
              <div class="bar-mark-80"></div>
            </div>
            <div class="phase-foot mono">
              <span>${pd.hasHmi ? `HMI Ateşleme Pik: ~${pd.strikePeak}A` : `Güvenli limit: ${pd.safeLimit}A (${pd.safeKWText})`}</span>
              <span>Boşluk: ${pd.remainingSafeAmps > 0 ? `+${pd.remainingSafeAmps.toFixed(1)}A · +${pd.remainingSafeKWText}` : 'Dolu'}</span>
            </div>
          </div>
        `;
      }).join('') + `
        <div class="phase-summary-bar mono">
          <span>Nötr Akımı (I_N): <strong>${ev.neutralAmps}A</strong></span>
          <span>Faz Dengesizliği: <strong>%${ev.imbalancePercent}</strong></span>
        </div>
      `;
    } else {
      phaseCard.style.display = 'none';
    }

    // 4. Uyarılar (Yalnızca uyarı varsa görünür)
    const warnContainer = document.getElementById('warningsContainer');
    if (ev.warnings.length > 0) {
      warnContainer.style.display = 'flex';
      warnContainer.innerHTML = ev.warnings.map((w) => `
        <div class="warn-row ${w.level}">
          <div>
            <div class="warn-title">${esc(w.title)}</div>
            <div class="warn-desc">${esc(w.detail)}</div>
          </div>
        </div>
      `).join('');
    } else {
      warnContainer.style.display = 'none';
      warnContainer.innerHTML = '';
    }

    // 5. Bağlı Lambalar (Görselli + Amper & kW birlikte)
    document.getElementById('connectedCount').textContent = ev.totalUnits;
    const connList = document.getElementById('connectedList');
    if (state.loadItems.length === 0) {
      connList.innerHTML = `<div class="empty-box">Bu hatta henüz lamba yok. Lamba ekleyerek Amper &amp; kW riskini hemen kontrol edin.</div>`;
    } else {
      connList.innerHTML = state.loadItems.map((it) => {
        const f = fixtureMap[it.fixtureId];
        if (!f) return '';
        const fc = Calc.calcFixtureAmps(f, cable.voltage);
        const totalA = (fc.continuousAmps * it.qty).toFixed(1);
        const totalKW = Calc.formatKW(fc.watts * it.qty);
        const isIncompat = (f.minSocketAmps && f.minSocketAmps > cable.ratedAmps) || fc.continuousAmps > cable.ratedAmps;
        const phaseLabel = ['R', 'S', 'T'][it.phase] || 'R';

        return `
          <div class="lamp-row ${isIncompat ? 'incompat' : ''}">
            <button class="lamp-thumb lamp-thumb-sm" data-preview-fix="${f.id}" title="Görseli büyüt">
              <img src="${esc(getFixtureImage(f))}" alt="${esc(f.brand)} ${esc(f.model)}" />
            </button>
            <div class="lamp-row-info">
              <div class="lamp-row-title">
                <span class="tag tag-brand">${esc(f.brand)}</span>
                <span>${esc(f.model)}</span>
              </div>
              <div class="lamp-row-sub mono">
                Tekil: ${fc.continuousAmps.toFixed(1)}A · ${fc.kwText}
                ${isIncompat ? `<span style="color:var(--danger); font-weight:800;"> • MIN ${f.minSocketAmps}A GEREKİR</span>` : ''}
              </div>
            </div>
            <div class="lamp-row-right">
              <div class="power-readout mono">
                <span class="power-readout-a">${totalA} A</span>
                <span class="power-readout-kw">${totalKW}</span>
              </div>
              ${cable.phases === 3 ? `<button class="phase-pill-btn p${it.phase} mono" data-phase-uid="${it.uid}" title="Fazı değiştir">Faz ${phaseLabel}</button>` : ''}
              <div class="stepper">
                <button data-dec-uid="${it.uid}" aria-label="Azalt">−</button>
                <span class="mono">${it.qty}</span>
                <button data-inc-uid="${it.uid}" aria-label="Artır">+</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      connList.querySelectorAll('[data-dec-uid]').forEach((b) =>
        b.addEventListener('click', () => updateLoadItemQty(b.dataset.decUid, -1))
      );
      connList.querySelectorAll('[data-inc-uid]').forEach((b) =>
        b.addEventListener('click', () => updateLoadItemQty(b.dataset.incUid, 1))
      );
      connList.querySelectorAll('[data-phase-uid]').forEach((b) =>
        b.addEventListener('click', () => cycleLoadItemPhase(b.dataset.phaseUid))
      );
      connList.querySelectorAll('[data-preview-fix]').forEach((b) =>
        b.addEventListener('click', () => openLampLightbox(b.dataset.previewFix))
      );
    }

    // 6. Hızlı Lamba Seçici
    renderQuickPicker(cable, ev.phaseAmps);
  }

  function getBrandCounts() {
    const all = getAllFixtures();
    const counts = { Tümü: all.length };
    for (const b of NAMED_BRANDS) counts[b] = 0;
    counts['Diğer'] = 0;
    for (const f of all) {
      if (NAMED_BRANDS.includes(f.brand)) counts[f.brand] += 1;
      else counts['Diğer'] += 1;
    }
    return counts;
  }

  function renderQuickPicker(cable, currentPhaseAmps) {
    const counts = getBrandCounts();
    const brandContainer = document.getElementById('quickBrandPills');
    brandContainer.innerHTML = BRANDS.map((b) =>
      `<button class="brand-btn ${ui.quickBrand === b ? 'active' : ''}" data-qbrand="${esc(b)}"><span>${esc(b)}</span><span class="brand-cnt">${counts[b] || 0}</span></button>`
    ).join('');
    brandContainer.querySelectorAll('[data-qbrand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.quickBrand = btn.dataset.qbrand;
        renderQuickPicker(cable, currentPhaseAmps);
      });
    });

    const q = ui.quickSearch.trim().toLowerCase();
    const list = getAllFixtures().filter((f) => {
      const brandOk = ui.quickBrand === 'Tümü' || f.brand === ui.quickBrand || (ui.quickBrand === 'Diğer' && !NAMED_BRANDS.includes(f.brand));
      const kwStr = Calc.formatKW(f.watts);
      const searchOk = !q || `${f.brand} ${f.model} ${f.type} ${f.watts}w ${kwStr}`.toLowerCase().includes(q);
      return brandOk && searchOk;
    });

    const picker = document.getElementById('quickPickerList');
    if (list.length === 0) {
      picker.innerHTML = `<div class="empty-box">Uygun lamba bulunamadı. "+ Özel" butonuyla ekleyebilirsiniz.</div>`;
      return;
    }

    picker.innerHTML = list.map((f) => {
      const cap = Calc.calcMaxUnitsForCable(cable, f, currentPhaseAmps);
      const kwText = Calc.formatKW(f.watts);
      let statusTag = '';
      if (!cap.compatible) {
        statusTag = `<span class="tag tag-danger">Min ${f.minSocketAmps}A</span>`;
      } else if (cap.remainingSafeAdd > 0) {
        statusTag = `<span class="tag tag-safe">+${cap.remainingSafeAdd} sığar</span>`;
      } else if (cap.remainingCautionAdd > 0) {
        statusTag = `<span class="tag tag-caution">+${cap.remainingCautionAdd} sınırda</span>`;
      } else {
        statusTag = `<span class="tag tag-danger">Dolu</span>`;
      }

      const canAddSafely = cap.compatible && cap.remainingSafeAdd > 0;
      return `
        <div class="picker-item">
          <button class="lamp-thumb lamp-thumb-sm" data-preview-fix="${f.id}" title="Görseli büyüt">
            <img src="${esc(getFixtureImage(f))}" alt="${esc(f.brand)} ${esc(f.model)}" />
          </button>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              <span style="color:var(--accent);">${esc(f.brand)}</span> ${esc(f.model)}
            </div>
            <div class="mono" style="font-size:11.5px; color:var(--text-muted); margin-top:2px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span>${cap.unitAmps.toFixed(1)}A · ${kwText}</span>
              ${statusTag}
            </div>
          </div>
          <button class="add-circle-btn ${canAddSafely ? '' : 'muted'}" data-add-load="${f.id}" title="Hata ekle">+</button>
        </div>
      `;
    }).join('');

    picker.querySelectorAll('[data-add-load]').forEach((btn) => {
      btn.addEventListener('click', () => addFixtureToLoad(btn.dataset.addLoad));
    });
    picker.querySelectorAll('[data-preview-fix]').forEach((btn) => {
      btn.addEventListener('click', () => openLampLightbox(btn.dataset.previewFix));
    });
  }

  // ==================== RENDER: TAB 2 (KAÇ ADET? & KABLOLAR) ====================
  function renderCatalogTab() {
    document.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.subtab === state.catalogSubtab);
    });
    document.getElementById('subtab-lamps').style.display = state.catalogSubtab === 'lamps' ? 'block' : 'none';
    document.getElementById('subtab-cables').style.display = state.catalogSubtab === 'cables' ? 'block' : 'none';

    const catCable = getCable(state.catalogCableId);
    const catPower = Calc.calcCablePower(catCable);

    renderCableStrip('catalogCableSelector', catCable.id, (id) => {
      state.catalogCableId = id;
      saveState();
      renderCatalogTab();
    });

    // Tip dropdown
    const typeSel = document.getElementById('catalogTypeSelect');
    if (typeSel.options.length === 0) {
      typeSel.innerHTML = FIXTURE_TYPES.map((t) =>
        `<option value="${esc(t)}">${t === 'Tümü' ? 'Tüm Lamba Tipleri' : esc(t)}</option>`
      ).join('');
    }
    typeSel.value = ui.catalogType;

    // Marka butonları (adetli, sarılı ızgara)
    const counts = getBrandCounts();
    const brandBox = document.getElementById('catalogBrandPills');
    brandBox.innerHTML = BRANDS.map((b) =>
      `<button class="brand-btn ${ui.catalogBrand === b ? 'active' : ''}" data-cbrand="${esc(b)}"><span>${esc(b)}</span><span class="brand-cnt">${counts[b] || 0}</span></button>`
    ).join('');
    brandBox.querySelectorAll('[data-cbrand]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.catalogBrand = btn.dataset.cbrand;
        renderCatalogTab();
      });
    });

    // Lamba Kartları
    const q = ui.catalogSearch.trim().toLowerCase();
    const filtered = getAllFixtures().filter((f) => {
      const bOk = ui.catalogBrand === 'Tümü' || f.brand === ui.catalogBrand || (ui.catalogBrand === 'Diğer' && !NAMED_BRANDS.includes(f.brand));
      const tOk = ui.catalogType === 'Tümü' || f.type === ui.catalogType;
      const kwStr = Calc.formatKW(f.watts);
      const sOk = !q || `${f.brand} ${f.model} ${f.type} ${f.watts}w ${kwStr} ${f.notes || ''}`.toLowerCase().includes(q);
      return bOk && tOk && sOk;
    });

    const grid = document.getElementById('catalogGrid');
    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-box">Seçili filtreye uygun lamba bulunamadı.</div>`;
    } else {
      grid.innerHTML = filtered.map((f) => {
        const cap = Calc.calcMaxUnitsForCable(catCable, f);
        const kwText = Calc.formatKW(f.watts);
        return `
          <article class="catalog-card">
            <div style="display:flex; gap:13px; align-items:flex-start;">
              <button class="lamp-thumb lamp-thumb-lg" data-preview-fix="${f.id}" title="Görseli büyüt">
                <img src="${esc(getFixtureImage(f))}" alt="${esc(f.brand)} ${esc(f.model)}" />
              </button>
              <div style="flex:1; min-width:0;">
                <div class="ccard-head">
                  <div style="min-width:0;">
                    <span class="tag tag-brand">${esc(f.brand)}</span>
                    <span class="tag" style="margin-left:4px;">${esc(f.type)}</span>
                    <div class="ccard-title">${esc(f.model)}</div>
                  </div>
                  <div class="ccard-power mono">
                    <div class="ccard-amp">${cap.unitAmps.toFixed(1)} A</div>
                    <div class="ccard-kw">${kwText}</div>
                    <div class="ccard-pf">Min ${f.minSocketAmps}A</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="cap-banner ${cap.level}">
              <div>
                <div style="font-size:11px; color:var(--text-muted);">${esc(catCable.shortName)} (${catPower.ratedTotalKWText}) ile:</div>
                <div class="cap-val mono">${esc(cap.label)}</div>
              </div>
              <div class="mono" style="text-align:right; font-size:11.5px; color:var(--text-muted);">
                ${cap.compatible ? `Max: ${cap.maxAbsoluteTotal} adet` : `Min ${f.minSocketAmps}A`}
              </div>
            </div>

            <div class="ccard-note">${esc(cap.compatible ? (f.notes || cap.reason) : cap.reason)}</div>

            <div class="ccard-foot">
              <span class="mono" style="font-size:11.5px; color:var(--text-dim);">${esc(f.colorTemp || '')} • PF ${f.pf}</span>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-primary btn-sm" data-cat-addload="${f.id}">+ Hata Ekle</button>
                <button class="btn btn-soft btn-sm" data-cat-addtruck="${f.id}">+ Kamyon</button>
              </div>
            </div>
          </article>
        `;
      }).join('');

      grid.querySelectorAll('[data-preview-fix]').forEach((btn) => {
        btn.addEventListener('click', () => openLampLightbox(btn.dataset.previewFix));
      });
      grid.querySelectorAll('[data-cat-addload]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (state.loadItems.length === 0 && state.selectedCableId !== state.catalogCableId) {
            state.selectedCableId = state.catalogCableId;
            state.cableSection = getCable(state.selectedCableId).defaultCrossSection;
          }
          addFixtureToLoad(btn.dataset.catAddload);
        });
      });
      grid.querySelectorAll('[data-cat-addtruck]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const f = getFixtureMap()[btn.dataset.catAddtruck];
          if (f) addTruckItem({ category: 'Lamba', name: `${f.brand} ${f.model}`, fixtureId: f.id, qty: 1 });
        });
      });
    }

    // Kablo Standartları Alt Sekmesi
    const cableGrid = document.getElementById('cableGuideGrid');
    const sampleIds = ['arri-m18', 'arri-m40', 'arri-m90', 'aputure-600d-pro', 'aputure-1200d-pro', 'godox-mg2400bi'];
    const fMap = getFixtureMap();
    cableGrid.innerHTML = CABLES.map((c) => {
      const cp = Calc.calcCablePower(c);
      const quickCaps = sampleIds.map((id) => {
        const f = fMap[id];
        if (!f) return '';
        const cap = Calc.calcMaxUnitsForCable(c, f);
        const cls = cap.level === 'SAFE' ? 'tag-safe' : cap.level === 'CAUTION' ? 'tag-caution' : 'tag-danger';
        const shortModel = f.model.split('(')[0].trim().split(' ').slice(0, 2).join(' ');
        return `<span class="tag ${cls} mono">${esc(shortModel)}: ${cap.compatible ? (cap.maxSafeTotal > 0 ? cap.maxSafeTotal : '1*') : '0'}</span>`;
      }).join(' ');

      return `
        <article class="catalog-card">
          <div>
            <div class="ccard-head">
              <div>
                <span class="tag tag-brand mono">${esc(c.badge)}</span>
                <span class="tag mono" style="margin-left:4px;">${esc(c.connector)}</span>
                <div class="ccard-title">${esc(c.name)}</div>
              </div>
              <div class="ccard-power mono">
                <div class="ccard-amp">${c.phases === 3 ? `3×${c.ratedAmps}A` : `${c.ratedAmps}A`}</div>
                <div class="ccard-kw">${cp.ratedTotalKWText}</div>
                <div class="ccard-pf">${c.phases === 3 ? `5×${c.defaultCrossSection}` : `3×${c.defaultCrossSection}`}mm²</div>
              </div>
            </div>

            <div class="cap-banner SAFE" style="margin-top:12px;">
              <div>
                <div style="font-size:11px; color:var(--text-muted);">Sürekli Güvenli Kapasite (%${Math.round((c.safeRatio || 0.8) * 100)})</div>
                <div class="cap-val mono">${c.phases === 3 ? `3×${cp.safeAmpsPerPhase}A` : `${cp.safeAmpsPerPhase}A`} • ${cp.safeTotalKWText}</div>
              </div>
              <div class="mono" style="text-align:right; font-size:11.5px; color:var(--text-muted);">
                Max: ${cp.ratedTotalKWText}
              </div>
            </div>

            <p class="ccard-note" style="margin:10px 0 6px;">${esc(c.description)}</p>
            <div class="ccard-note" style="margin-bottom:10px;"><strong>Tipik Set Kullanımı:</strong> ${esc(c.typicalUse)}</div>
            <div style="display:flex; flex-wrap:wrap; gap:5px;">${quickCaps}</div>
          </div>

          <div class="ccard-foot">
            <button class="btn btn-primary btn-sm" style="flex:1;" data-use-cable="${c.id}">Hesaplayıcıda Seç</button>
            <button class="btn btn-soft btn-sm" data-add-cable-truck="${c.id}">+ Kamyona Ekle</button>
          </div>
        </article>
      `;
    }).join('');

    cableGrid.querySelectorAll('[data-use-cable]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectCalcCable(btn.dataset.useCable, true);
        setTab('calc');
        showToast(`${getCable(btn.dataset.useCable).shortName} aktif edildi`);
      });
    });
    cableGrid.querySelectorAll('[data-add-cable-truck]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = getCable(btn.dataset.addCableTruck);
        addTruckItem({
          category: 'Kablo',
          name: `${c.name} (${c.defaultLength}m - ${c.defaultCrossSection}mm²)`,
          cableId: c.id,
          qty: 2
        });
      });
    });
  }

  // ==================== RENDER: TAB 3 (KAMYON & PAYDOS) ====================
  function addTruckItem({ category, name, fixtureId = null, cableId = null, qty = 1 }) {
    const existing = state.truckItems.find(
      (i) => i.name.toLowerCase() === name.toLowerCase() && i.category === category
    );
    if (existing) {
      existing.qty += Number(qty) || 1;
    } else {
      state.truckItems.unshift({
        id: uid('inv'),
        category,
        name,
        fixtureId,
        cableId,
        qty: Math.max(1, Number(qty) || 1),
        status: 'pending',
        note: ''
      });
    }
    saveState();
    renderLiveBadges();
    if (state.activeTab === 'truck') renderTruckTab();
    showToast(`Kamyona eklendi: ${name}`);
  }

  function renderTruckTab() {
    document.getElementById('truckProjectHeading').textContent = state.projectName || 'Kamyon & Paydos';
    document.getElementById('truckRentalSubtitle').textContent = state.rentalHouse || 'Kamyon Envanteri ve Paydos Sayımı';

    const settingsCard = document.getElementById('truckSettingsCard');
    settingsCard.classList.toggle('open', ui.truckSettingsOpen);

    const projInput = document.getElementById('projectNameInput');
    const rentInput = document.getElementById('rentalHouseInput');
    if (document.activeElement !== projInput) projInput.value = state.projectName;
    if (document.activeElement !== rentInput) rentInput.value = state.rentalHouse;

    const tplSel = document.getElementById('templateSelect');
    if (tplSel.options.length === 0) {
      tplSel.innerHTML = TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('') +
        `<option value="empty">Boş Kamyon Listesi</option>`;
    }

    const total = state.truckItems.length;
    const countPending = state.truckItems.filter((i) => i.status === 'pending').length;
    const countOk = state.truckItems.filter((i) => i.status === 'ok').length;
    const countMissing = state.truckItems.filter((i) => i.status === 'missing').length;
    const countFaulty = state.truckItems.filter((i) => i.status === 'faulty').length;
    const checked = countOk + countMissing + countFaulty;
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

    document.getElementById('wrapProgressText').textContent = `%${pct} (${checked}/${total})`;
    document.getElementById('wrapProgressSub').textContent = countMissing > 0 || countFaulty > 0
      ? `Dikkat: ${countMissing} eksik, ${countFaulty} arızalı ekipman işaretlendi.`
      : countPending === 0 && total > 0
        ? 'Tüm kamyon sayımı eksiksiz tamamlandı.'
        : 'Ekipmanları tek dokunuşla Tamam, Eksik veya Arıza olarak işaretleyin.';

    const bar = document.getElementById('wrapProgressBar');
    bar.style.width = `${pct}%`;
    bar.className = `bar-fill ${countMissing > 0 || countFaulty > 0 ? 'CAUTION' : 'SAFE'}`;

    const counters = document.getElementById('wrapStatusCounters');
    const statDefs = [
      { key: 'all', num: total, lbl: 'Tümü', color: 'var(--text)' },
      { key: 'ok', num: countOk, lbl: 'Tamam', color: 'var(--safe)' },
      { key: 'missing', num: countMissing, lbl: 'Eksik', color: 'var(--caution)' },
      { key: 'faulty', num: countFaulty, lbl: 'Arızalı', color: 'var(--danger)' }
    ];
    counters.innerHTML = statDefs.map((s) => `
      <button class="stat-tab ${ui.truckStatusFilter === s.key ? 'active' : ''}" data-tstat="${s.key}">
        <span class="stat-tab-num mono" style="color:${s.color};">${s.num}</span>
        <span class="stat-tab-lbl">${s.lbl}</span>
      </button>
    `).join('');
    counters.querySelectorAll('[data-tstat]').forEach((b) => {
      b.addEventListener('click', () => {
        ui.truckStatusFilter = b.dataset.tstat;
        renderTruckTab();
      });
    });

    const catPills = document.getElementById('truckCategoryPills');
    catPills.innerHTML = TRUCK_CATEGORIES.map((c) =>
      `<button class="chip ${ui.truckCatFilter === c ? 'active' : ''}" data-tcat="${esc(c)}">${esc(c)}</button>`
    ).join('');
    catPills.querySelectorAll('[data-tcat]').forEach((b) => {
      b.addEventListener('click', () => {
        ui.truckCatFilter = b.dataset.tcat;
        renderTruckTab();
      });
    });

    const q = ui.truckSearch.trim().toLowerCase();
    const list = state.truckItems.filter((item) => {
      const sOk = ui.truckStatusFilter === 'all' || item.status === ui.truckStatusFilter;
      const cOk = ui.truckCatFilter === 'Tümü' || item.category === ui.truckCatFilter;
      const qOk = !q || `${item.name} ${item.category} ${item.note || ''}`.toLowerCase().includes(q);
      return sOk && cOk && qOk;
    });

    const fMap = getFixtureMap();
    const listEl = document.getElementById('truckList');
    if (list.length === 0) {
      listEl.innerHTML = `<div class="empty-box">Bu filtrede ekipman bulunmuyor.</div>`;
      return;
    }

    listEl.innerHTML = list.map((item) => {
      const f = item.fixtureId ? fMap[item.fixtureId] : null;
      return `
        <div class="inv-item st-${item.status}">
          <div class="inv-item-top">
            <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:190px;">
              ${f ? `
                <button class="lamp-thumb lamp-thumb-sm" data-preview-fix="${f.id}">
                  <img src="${esc(getFixtureImage(f))}" alt="${esc(item.name)}" />
                </button>
              ` : ''}
              <div>
                <span class="tag">${esc(item.category)}</span>
                <div style="font-weight:700; margin-top:3px;">${esc(item.name)}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <div class="stepper">
                <button data-inv-dec="${item.id}">−</button>
                <span class="mono">${item.qty}</span>
                <button data-inv-inc="${item.id}">+</button>
              </div>
              <div class="st-group">
                <button class="st-pill ${item.status === 'ok' ? 'active-ok' : ''}" data-inv-st="${item.id}|ok">Tamam</button>
                <button class="st-pill ${item.status === 'missing' ? 'active-missing' : ''}" data-inv-st="${item.id}|missing">Eksik</button>
                <button class="st-pill ${item.status === 'faulty' ? 'active-faulty' : ''}" data-inv-st="${item.id}|faulty">Arıza</button>
                <button class="st-pill" data-inv-del="${item.id}" title="Sil">✕</button>
              </div>
            </div>
          </div>
          ${(item.status === 'missing' || item.status === 'faulty' || item.note) ? `
            <div style="margin-top:8px;">
              <input class="input" style="min-height:34px; font-size:12px;" data-inv-note="${item.id}" value="${esc(item.note)}"
                placeholder="${item.status === 'faulty' ? 'Arıza detayı yazın (ör. Balast soketi gevşek / lamba patlak)...' : 'Eksik / konum notu yazın...'}" />
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-preview-fix]').forEach((b) =>
      b.addEventListener('click', () => openLampLightbox(b.dataset.previewFix))
    );
    listEl.querySelectorAll('[data-inv-dec]').forEach((b) => {
      b.addEventListener('click', () => {
        const it = state.truckItems.find((x) => x.id === b.dataset.invDec);
        if (it && it.qty > 1) {
          it.qty -= 1;
          saveState();
          renderTruckTab();
        }
      });
    });
    listEl.querySelectorAll('[data-inv-inc]').forEach((b) => {
      b.addEventListener('click', () => {
        const it = state.truckItems.find((x) => x.id === b.dataset.invInc);
        if (it) {
          it.qty += 1;
          saveState();
          renderTruckTab();
        }
      });
    });
    listEl.querySelectorAll('[data-inv-st]').forEach((b) => {
      b.addEventListener('click', () => {
        const [id, st] = b.dataset.invSt.split('|');
        const it = state.truckItems.find((x) => x.id === id);
        if (!it) return;
        it.status = it.status === st ? 'pending' : st;
        saveState();
        renderLiveBadges();
        renderTruckTab();
      });
    });
    listEl.querySelectorAll('[data-inv-note]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const it = state.truckItems.find((x) => x.id === inp.dataset.invNote);
        if (it) {
          it.note = inp.value;
          saveState();
        }
      });
    });
    listEl.querySelectorAll('[data-inv-del]').forEach((b) => {
      b.addEventListener('click', () => {
        state.truckItems = state.truckItems.filter((x) => x.id !== b.dataset.invDel);
        saveState();
        renderLiveBadges();
        renderTruckTab();
      });
    });
  }

  // ==================== RENDER: TAB 4 (SARF STOK) ====================
  function renderExpendablesTab() {
    const lowItems = state.expendables.filter((e) => Number(e.qty) <= Number(e.minQty));
    const banner = document.getElementById('lowStockBanner');
    if (lowItems.length > 0) {
      banner.style.display = 'block';
      banner.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div>
            <span class="status-pill">SİPARİŞ GEREKLİ • ${lowItems.length} KALEM</span>
            <div style="font-size:13px; color:var(--text-muted); margin-top:8px;">
              ${lowItems.map((x) => `<strong>${esc(x.name)}</strong> (${x.qty} ${esc(x.unit)})`).join(' • ')}
            </div>
          </div>
        </div>
      `;
    } else {
      banner.style.display = 'none';
    }

    const catBox = document.getElementById('expCategoryPills');
    catBox.innerHTML = EXP_CATEGORIES.map((c) =>
      `<button class="chip ${ui.expCatFilter === c ? 'active' : ''}" data-ecat="${esc(c)}">${esc(c)}</button>`
    ).join('');
    catBox.querySelectorAll('[data-ecat]').forEach((b) => {
      b.addEventListener('click', () => {
        ui.expCatFilter = b.dataset.ecat;
        renderExpendablesTab();
      });
    });

    const list = state.expendables.filter((e) => ui.expCatFilter === 'Tümü' || e.category === ui.expCatFilter);
    const listEl = document.getElementById('expendablesList');
    if (list.length === 0) {
      listEl.innerHTML = `<div class="empty-box">Bu kategoride sarf malzeme yok.</div>`;
      return;
    }

    listEl.innerHTML = list.map((e) => {
      const isLow = Number(e.qty) <= Number(e.minQty);
      return `
        <div class="exp-item ${isLow ? 'low-stock' : ''}">
          <div style="flex:1; min-width:170px;">
            <span class="tag">${esc(e.category)}</span>
            ${isLow ? `<span class="tag tag-danger" style="margin-left:4px;">KRİTİK STOK</span>` : ''}
            <div style="font-weight:700; margin-top:4px;">${esc(e.name)}</div>
            <div class="mono" style="font-size:11.5px; color:var(--text-muted);">Alt sınır: ${e.minQty} ${esc(e.unit)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:7px;">
            <div class="stepper">
              <button data-exp-dec="${e.id}">−</button>
              <span class="mono" style="min-width:60px; font-size:12px;">${e.qty} ${esc(e.unit)}</span>
              <button data-exp-inc="${e.id}">+</button>
            </div>
            <button class="st-pill" data-exp-del="${e.id}" title="Sil">✕</button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-exp-dec]').forEach((b) => {
      b.addEventListener('click', () => {
        const it = state.expendables.find((x) => x.id === b.dataset.expDec);
        if (it) {
          it.qty = Math.max(0, Math.round((Number(it.qty) - 1) * 10) / 10);
          saveState();
          renderLiveBadges();
          renderExpendablesTab();
        }
      });
    });
    listEl.querySelectorAll('[data-exp-inc]').forEach((b) => {
      b.addEventListener('click', () => {
        const it = state.expendables.find((x) => x.id === b.dataset.expInc);
        if (it) {
          it.qty = Math.round((Number(it.qty) + 1) * 10) / 10;
          saveState();
          renderLiveBadges();
          renderExpendablesTab();
        }
      });
    });
    listEl.querySelectorAll('[data-exp-del]').forEach((b) => {
      b.addEventListener('click', () => {
        state.expendables = state.expendables.filter((x) => x.id !== b.dataset.expDel);
        saveState();
        renderLiveBadges();
        renderExpendablesTab();
      });
    });
  }

  // ==================== REPORTS ====================
  function openReportModal(title, text) {
    document.getElementById('reportModalTitle').textContent = title;
    document.getElementById('reportPreviewText').textContent = text;
    openModal('reportModal');
  }

  function buildLoadReport() {
    const cable = getCable(state.selectedCableId);
    const fMap = getFixtureMap();
    const ev = Calc.evaluateLineLoad(
      cable,
      state.loadItems,
      fMap,
      { lengthMeters: state.cableLength, crossSection: state.cableSection },
      CABLES
    );
    const cp = ev.cablePower;
    const now = new Date().toLocaleString('tr-TR');
    const lines = [
      `SET ELEKTRİK, AMPER & kW RAPORU`,
      `Proje: ${state.projectName || '-'}`,
      `Tarih: ${now}`,
      `────────────────────────────────`,
      `Kablo / Hat: ${cable.name}`,
      `Hat Kapasitesi: ${cable.phases === 3 ? `3×${cable.ratedAmps}A` : `${cable.ratedAmps}A`} (${cp.ratedTotalKWText}) | Güvenli (%${Math.round((cable.safeRatio || 0.8) * 100)}): ${cp.safeTotalKWText}`,
      `Mesafe / Kesit: ${ev.lengthMeters}m / ${ev.crossSection}mm²`,
      `Durum: ${ev.verdict.badge}`,
      `Tepe Faz Akımı: ${ev.maxPhaseAmps}A / ${cable.ratedAmps}A (%${ev.peakUsagePercent})`,
      `Toplam Güç: ${ev.totalKWText} (${ev.totalWatts}W / ${ev.totalKVA} kVA)`,
      `Hat Sonu Voltaj: ${ev.deliveredVoltage}V (-%${ev.voltageDropPercent})`,
      ``
    ];

    if (cable.phases === 3) {
      lines.push(`FAZ DAĞILIMI (R-S-T):`);
      ev.phaseDetails.forEach((p) => {
        lines.push(`• ${p.label}: ${p.amps}A / ${p.ratedAmps}A • ${p.kwText} / ${p.ratedKWText} (%${p.percent} - ${p.status})`);
      });
      lines.push(`• Nötr Akımı: ${ev.neutralAmps}A | Faz Dengesizliği: %${ev.imbalancePercent}`);
      lines.push(``);
    }

    lines.push(`BAĞLI LAMBALAR (${ev.totalUnits} adet):`);
    state.loadItems.forEach((it) => {
      const f = fMap[it.fixtureId];
      if (!f) return;
      const fc = Calc.calcFixtureAmps(f, cable.voltage);
      const pTag = cable.phases === 3 ? ` [Faz ${['R', 'S', 'T'][it.phase]}]` : '';
      lines.push(`• ${it.qty}× ${f.brand} ${f.model}${pTag} — ${(fc.continuousAmps * it.qty).toFixed(1)}A • ${Calc.formatKW(fc.watts * it.qty)}`);
    });

    if (ev.warnings.length > 0) {
      lines.push(``);
      lines.push(`UYARILAR:`);
      ev.warnings.forEach((w) => lines.push(`! ${w.title}: ${w.detail}`));
    }

    return lines.join('\n');
  }

  function buildTruckReport() {
    const now = new Date().toLocaleString('tr-TR');
    const ok = state.truckItems.filter((i) => i.status === 'ok');
    const missing = state.truckItems.filter((i) => i.status === 'missing');
    const faulty = state.truckItems.filter((i) => i.status === 'faulty');
    const pending = state.truckItems.filter((i) => i.status === 'pending');

    const lines = [
      `PAYDOS & KAMYON ENVANTER RAPORU`,
      `Proje: ${state.projectName || '-'}`,
      `Kamyon / Kiralama: ${state.rentalHouse || '-'}`,
      `Tarih: ${now}`,
      `────────────────────────────────`,
      `Özet: ${ok.length} Tamam | ${missing.length} Eksik | ${faulty.length} Arızalı | ${pending.length} Sayılmadı`,
      ``
    ];

    if (missing.length > 0) {
      lines.push(`EKSİK EKİPMANLAR (${missing.length}):`);
      missing.forEach((i) => lines.push(`• ${i.qty}× ${i.name}${i.note ? ` — Not: ${i.note}` : ''}`));
      lines.push(``);
    }

    if (faulty.length > 0) {
      lines.push(`ARIZALI / BAKIM GEREKTİREN (${faulty.length}):`);
      faulty.forEach((i) => lines.push(`• ${i.qty}× ${i.name}${i.note ? ` — Arıza: ${i.note}` : ''}`));
      lines.push(``);
    }

    if (pending.length > 0) {
      lines.push(`SAYILMAYANLAR (${pending.length}):`);
      pending.forEach((i) => lines.push(`• ${i.qty}× ${i.name}`));
      lines.push(``);
    }

    lines.push(`KAMYONA YÜKLENENLER (${ok.length} kalem):`);
    ok.forEach((i) => lines.push(`• ${i.qty}× ${i.name} [${i.category}]`));
    return lines.join('\n');
  }

  function buildOrderReport() {
    const now = new Date().toLocaleDateString('tr-TR');
    const low = state.expendables.filter((e) => Number(e.qty) <= Number(e.minQty));
    const lines = [
      `SARF MALZEME & JELATİN SİPARİŞ LİSTESİ`,
      `Proje: ${state.projectName || '-'} (${now})`,
      `────────────────────────────────`
    ];
    if (low.length === 0) {
      lines.push(`Tüm sarf stokları güvenli seviyenin üzerinde.`);
    } else {
      lines.push(`SİPARİŞ GEREKENLER (${low.length} kalem):`);
      low.forEach((e) => lines.push(`• ${e.name} — Kalan: ${e.qty} ${e.unit} (Alt sınır: ${e.minQty})`));
    }
    return lines.join('\n');
  }

  // ==================== MODAL HELPERS & EVENTS ====================
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function populateTruckPresetSelect() {
    const cat = document.getElementById('truckItemCategorySelect').value;
    const wrap = document.getElementById('truckPresetLampWrap');
    const sel = document.getElementById('truckPresetLampSelect');
    if (cat === 'Lamba') {
      wrap.style.display = 'block';
      sel.innerHTML = `<option value="">— Katalogdan seç veya aşağıya yaz —</option>` +
        getAllFixtures().map((f) => `<option value="fix:${f.id}">${esc(f.brand)} ${esc(f.model)} (${Calc.formatKW(f.watts)})</option>`).join('');
    } else if (cat === 'Kablo') {
      wrap.style.display = 'block';
      sel.innerHTML = `<option value="">— Kablo standardı seç —</option>` +
        CABLES.map((c) => `<option value="cab:${c.id}">${esc(c.name)} (${Calc.calcCablePower(c).ratedTotalKWText})</option>`).join('');
    } else {
      wrap.style.display = 'none';
      sel.innerHTML = '';
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  function bindStaticEvents() {
    document.querySelectorAll('.side-nav-btn, .bnav-btn').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });

    document.getElementById('sidebarLiveCard').addEventListener('click', () => setTab('calc'));
    document.getElementById('mobileLiveChip').addEventListener('click', () => setTab('calc'));

    const themeNames = { studio: 'Stüdyo teması', light: 'Açık tema (Gün ışığı)', night: 'Gece kırmızı set modu' };
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTheme(btn.dataset.theme);
        showToast(themeNames[btn.dataset.theme] || 'Tema güncellendi');
      });
    });
    document.getElementById('mobileThemeBtn').addEventListener('click', () => {
      const order = ['studio', 'light', 'night'];
      const next = order[(order.indexOf(state.theme) + 1) % order.length];
      setTheme(next);
      showToast(themeNames[next]);
    });

    // Mobil Lamba Seçici Çekmecesi
    const drawer = document.getElementById('pickerDrawerWrap');
    document.getElementById('openMobilePickerBtn').addEventListener('click', () => drawer.classList.add('open'));
    document.getElementById('closeMobilePickerBtn').addEventListener('click', () => drawer.classList.remove('open'));
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) drawer.classList.remove('open');
    });

    // Hesaplayıcı butonları
    document.getElementById('autoBalanceBtn').addEventListener('click', rebalanceCurrentLoad);
    document.getElementById('clearLoadBtn').addEventListener('click', () => {
      if (state.loadItems.length === 0) return;
      state.loadItems = [];
      saveState();
      renderAll();
      showToast('Hat yükü temizlendi');
    });

    document.getElementById('quickLampSearch').addEventListener('input', (e) => {
      ui.quickSearch = e.target.value;
      renderCalcTab();
    });

    document.getElementById('sendLoadToTruckBtn').addEventListener('click', () => {
      if (state.loadItems.length === 0) {
        showToast('Önce hatta lamba ekleyin');
        return;
      }
      const fMap = getFixtureMap();
      const cable = getCable(state.selectedCableId);
      const grouped = new Map();
      state.loadItems.forEach((it) => {
        grouped.set(it.fixtureId, (grouped.get(it.fixtureId) || 0) + it.qty);
      });
      grouped.forEach((qty, fid) => {
        const f = fMap[fid];
        if (f) addTruckItem({ category: 'Lamba', name: `${f.brand} ${f.model}`, fixtureId: fid, qty });
      });
      addTruckItem({
        category: 'Kablo',
        name: `${cable.name} (${state.cableLength}m - ${state.cableSection}mm²)`,
        cableId: cable.id,
        qty: 1
      });
      showToast('Hattaki lambalar ve kablo kamyona aktarıldı');
    });

    // Katalog kontrolleri
    document.querySelectorAll('[data-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.catalogSubtab = btn.dataset.subtab;
        saveState();
        renderCatalogTab();
      });
    });
    document.getElementById('catalogSearch').addEventListener('input', (e) => {
      ui.catalogSearch = e.target.value;
      renderCatalogTab();
    });
    document.getElementById('catalogTypeSelect').addEventListener('change', (e) => {
      ui.catalogType = e.target.value;
      renderCatalogTab();
    });

    // Lightbox aksiyonları
    document.getElementById('lbAddLoadBtn').addEventListener('click', () => {
      if (!ui.lightboxFixtureId) return;
      addFixtureToLoad(ui.lightboxFixtureId);
      closeModal('lampLightboxModal');
    });
    document.getElementById('lbAddTruckBtn').addEventListener('click', () => {
      const f = getFixtureMap()[ui.lightboxFixtureId];
      if (!f) return;
      addTruckItem({ category: 'Lamba', name: `${f.brand} ${f.model}`, fixtureId: f.id, qty: 1 });
      closeModal('lampLightboxModal');
    });

    // Kamyon kontrolleri
    document.getElementById('toggleTruckSettingsBtn').addEventListener('click', () => {
      ui.truckSettingsOpen = !ui.truckSettingsOpen;
      renderTruckTab();
    });
    document.getElementById('projectNameInput').addEventListener('input', (e) => {
      state.projectName = e.target.value;
      document.getElementById('truckProjectHeading').textContent = state.projectName || 'Kamyon & Paydos';
      saveState();
    });
    document.getElementById('rentalHouseInput').addEventListener('input', (e) => {
      state.rentalHouse = e.target.value;
      document.getElementById('truckRentalSubtitle').textContent = state.rentalHouse || 'Kamyon Envanteri ve Paydos Sayımı';
      saveState();
    });
    document.getElementById('applyTemplateBtn').addEventListener('click', () => {
      const val = document.getElementById('templateSelect').value;
      if (val === 'empty') {
        state.truckItems = [];
      } else {
        const tpl = TEMPLATES.find((t) => t.id === val);
        if (!tpl) return;
        state.truckItems = tpl.items.map((item) => ({
          id: uid('inv'),
          category: item.category,
          name: item.name,
          fixtureId: item.fixtureId || null,
          cableId: item.cableId || null,
          qty: item.qty,
          status: 'pending',
          note: ''
        }));
      }
      ui.truckStatusFilter = 'all';
      ui.truckSettingsOpen = false;
      saveState();
      renderLiveBadges();
      renderTruckTab();
      showToast('Kamyon şablonu yüklendi');
    });
    document.getElementById('truckToCalcBtn').addEventListener('click', () => {
      const fMap = getFixtureMap();
      const lamps = state.truckItems.filter((i) => i.fixtureId && fMap[i.fixtureId]);
      if (lamps.length === 0) {
        showToast('Kamyonda katalogla eşleşen lamba yok');
        return;
      }
      const cable = getCable(state.selectedCableId);
      const newItems = lamps.map((i) => ({ uid: uid('ld'), fixtureId: i.fixtureId, qty: i.qty, phase: 0 }));
      state.loadItems = cable.phases === 3 ? Calc.autoBalanceItems(cable, newItems, fMap) : newItems;
      saveState();
      setTab('calc');
      showToast(`${lamps.length} çeşit kamyon lambası yük hesabına aktarıldı`);
    });
    document.getElementById('resetWrapBtn').addEventListener('click', () => {
      state.truckItems.forEach((i) => { i.status = 'pending'; i.note = ''; });
      ui.truckStatusFilter = 'all';
      saveState();
      renderLiveBadges();
      renderTruckTab();
      showToast('Paydos sayımı sıfırlandı');
    });
    document.getElementById('truckSearch').addEventListener('input', (e) => {
      ui.truckSearch = e.target.value;
      renderTruckTab();
    });

    // Raporlar
    document.getElementById('exportLoadReportBtn').addEventListener('click', () => {
      openReportModal('Elektrik, Amper & kW Raporu', buildLoadReport());
    });
    document.getElementById('exportTruckReportBtn').addEventListener('click', () => {
      openReportModal('Paydos & Arıza Raporu', buildTruckReport());
    });
    document.getElementById('exportOrderListBtn').addEventListener('click', () => {
      openReportModal('Sarf Malzeme Sipariş Listesi', buildOrderReport());
    });
    document.getElementById('copyReportBtn').addEventListener('click', async () => {
      const text = document.getElementById('reportPreviewText').textContent;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Panoya kopyalandı! WhatsApp’a yapıştırabilirsiniz.');
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Panoya kopyalandı!');
      }
    });
    document.getElementById('printReportBtn').addEventListener('click', () => {
      document.body.classList.add('printing-report');
      const cleanup = () => document.body.classList.remove('printing-report');
      window.addEventListener('afterprint', cleanup, { once: true });
      window.print();
      setTimeout(cleanup, 1500);
    });

    // Modallar
    document.getElementById('openCustomLampBtn1').addEventListener('click', () => openModal('customLampModal'));
    document.getElementById('openCustomLampBtn2').addEventListener('click', () => openModal('customLampModal'));
    document.getElementById('openAddTruckItemBtn').addEventListener('click', () => {
      populateTruckPresetSelect();
      openModal('addTruckItemModal');
    });
    document.getElementById('openAddExpBtn').addEventListener('click', () => openModal('addExpModal'));

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal-backdrop').forEach((bg) => {
      bg.addEventListener('click', (e) => {
        if (e.target === bg) bg.classList.remove('open');
      });
    });

    // Özel Lamba Ekleme (Opsiyonel fotoğraf yükleme destekli)
    document.getElementById('customLampForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const photoFile = document.getElementById('customLampPhotoInput').files?.[0] || null;
      const imageDataUrl = await readFileAsDataUrl(photoFile);
      const type = fd.get('type');
      const newFix = {
        id: uid('custom'),
        brand: String(fd.get('brand')).trim() || 'Diğer',
        model: String(fd.get('model')).trim(),
        type,
        watts: Math.max(10, Number(fd.get('watts')) || 100),
        pf: Math.min(1, Math.max(0.5, Number(fd.get('pf')) || 0.95)),
        inrushMultiplier: type === 'HMI' ? 1.15 : 1.0,
        minSocketAmps: Number(fd.get('minSocketAmps')) || 16,
        socketLabel: `${fd.get('minSocketAmps')}A`,
        image: imageDataUrl || undefined,
        notes: String(fd.get('notes')).trim() || 'Kullanıcı tarafından eklendi.'
      };
      state.customFixtures.unshift(newFix);
      saveState();
      e.target.reset();
      closeModal('customLampModal');
      renderAll();
      showToast(`Özel lamba eklendi: ${newFix.brand} ${newFix.model}`);
    });

    // Kamyona Ekipman Formu
    document.getElementById('truckItemCategorySelect').addEventListener('change', populateTruckPresetSelect);
    document.getElementById('truckPresetLampSelect').addEventListener('change', (e) => {
      const val = e.target.value;
      const nameInput = document.getElementById('truckItemNameInput');
      if (val.startsWith('fix:')) {
        const f = getFixtureMap()[val.slice(4)];
        if (f) nameInput.value = `${f.brand} ${f.model}`;
      } else if (val.startsWith('cab:')) {
        const c = getCable(val.slice(4));
        if (c) nameInput.value = `${c.name} (${c.defaultLength}m)`;
      }
    });
    document.getElementById('addTruckItemForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const presetVal = document.getElementById('truckPresetLampSelect').value || '';
      addTruckItem({
        category: fd.get('category'),
        name: String(fd.get('name')).trim(),
        fixtureId: presetVal.startsWith('fix:') ? presetVal.slice(4) : null,
        cableId: presetVal.startsWith('cab:') ? presetVal.slice(4) : null,
        qty: Number(fd.get('qty')) || 1
      });
      e.target.reset();
      closeModal('addTruckItemModal');
    });

    // Sarf Malzeme Formu
    document.getElementById('addExpForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.expendables.unshift({
        id: uid('exp'),
        name: String(fd.get('name')).trim(),
        category: fd.get('category'),
        unit: fd.get('unit'),
        qty: Number(fd.get('qty')) || 0,
        minQty: Number(fd.get('minQty')) || 1
      });
      saveState();
      e.target.reset();
      closeModal('addExpModal');
      renderLiveBadges();
      renderExpendablesTab();
      showToast('Sarf malzeme eklendi');
    });
  }

  function renderAll() {
    renderLiveBadges();
    renderCalcTab();
    renderCatalogTab();
    renderTruckTab();
    renderExpendablesTab();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTheme(state.theme);
    bindStaticEvents();
    setTab(state.activeTab);

    if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
      navigator.serviceWorker.register('./sw.js?v=10').then((reg) => reg.update()).catch(() => {});
    }
  });
})();
