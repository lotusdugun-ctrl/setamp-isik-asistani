// SetAmp — Diğer Birimlere Dağıtılan Kablo & Aksesuar Takibi (Sade 2-Dokunuş Arayüz + Kamyon Stok Eşleştirme)
(function () {
  const DISTRO_STORAGE_KEY = 'setamp_dept_loans_v2';
  const LEGACY_STORAGE_KEY = 'setamp_dept_loans_v1';

  const DEFAULT_DEPARTMENTS = [
    'Kamera / DIT',
    'Ronin / Steadicam',
    'Drone / Jimmy Jib',
    'Reji / Monitör',
    'Ses',
    'Sanat',
    'Makyaj / Saç',
    'Kostüm',
    'Prodüksiyon',
    'Catering / Çaycı',
    'Jeneratör',
    'Grip',
    'Karavan / Mekan'
  ];

  const DEFAULT_QUICK_ITEMS = [
    { name: '16A Kablo', short: '16A Kablo', matches: ['16a kablo', '16a uzatma', '16a monofaze', 'stinger'] },
    { name: 'Türk Kablo (Üçlü Grup Priz)', short: 'Türk Kablo', matches: ['türk kablo', 'üçlü', "3'lü", 'çoklu priz'] },
    { name: '32A Kablo', short: '32A Kablo', matches: ['32a kablo', '32a monofaze', '32a trifaze'] },
    { name: '63A Kablo', short: '63A Kablo', matches: ['63a kablo', '63a trifaze'] },
    { name: '125A Kablo', short: '125A Kablo', matches: ['125a kablo', '125a ana kablo', '125a trifaze'] },
    { name: '16A / 32A Makara', short: 'Makara', matches: ['makara'] },
    { name: '16A / 32A Pano', short: '16/32 Pano', matches: ['16a pano', '32a pano'] },
    { name: '63A Gecekondu Pano', short: 'Gecekondu', matches: ['gecekondu', '63a pano'] },
    { name: 'Kablo Kanalı (Kablo Yolu)', short: 'Kablo Kanalı', matches: ['kablo kanalı', 'kablo yolu', 'ramp', 'yellow jacket'] },
    { name: 'Uzun / Kısa C-Stand', short: 'C-Stand', matches: ['c-stand', 'cstand'] },
    { name: 'Çelik Ayak (A100)', short: 'Çelik A100', matches: ['çelik a100', 'çelik ayak', 'a100'] },
    { name: 'Kum Torbası', short: 'Kum Torbası', matches: ['kum torbası'] },
    { name: 'Plastik Maşa / Kardelini', short: 'Maşa/Kardelini', matches: ['plastik maşa', 'kardelini', 'cardellini', 'klemp'] },
    { name: 'Flag (Siyah Bayrak)', short: 'Flag', matches: ['flag', 'floppy'] },
    { name: 'V-Mount Akü', short: 'V-Mount Akü', matches: ['v-mount', 'v mound', 'akü'] },
    { name: 'Magliner', short: 'Magliner', matches: ['magliner'] }
  ];

  function uid() {
    return `ln-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nowHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function loadDistroState() {
    try {
      const raw = localStorage.getItem(DISTRO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          loans: Array.isArray(parsed.loans) ? parsed.loans : [],
          customDepts: Array.isArray(parsed.customDepts) ? parsed.customDepts : [],
          customItems: Array.isArray(parsed.customItems) ? parsed.customItems : []
        };
      }
      const oldRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (oldRaw) {
        const oldLoans = JSON.parse(oldRaw);
        if (Array.isArray(oldLoans)) {
          return { loans: oldLoans, customDepts: [], customItems: [] };
        }
      }
    } catch (_) {
      // ignore
    }
    return { loans: [], customDepts: [], customItems: [] };
  }

  const saved = loadDistroState();
  const dState = {
    loans: saved.loans,
    customDepts: saved.customDepts,
    customItems: saved.customItems,
    selectedDept: 'Kamera / DIT',
    selectedItemName: '16A Kablo',
    qtyDraft: 1,
    filterDept: 'Tümü',
    viewMode: 'byDept',
    addingDept: false,
    showNote: false
  };

  function saveDistroState() {
    try {
      localStorage.setItem(DISTRO_STORAGE_KEY, JSON.stringify({
        loans: dState.loans,
        customDepts: dState.customDepts,
        customItems: dState.customItems
      }));
    } catch (_) {
      // ignore
    }
  }

  function getAllDepartments() {
    const set = new Set([...DEFAULT_DEPARTMENTS, ...dState.customDepts]);
    for (const l of dState.loans) set.add(l.dept);
    return Array.from(set);
  }

  function getAllQuickItems() {
    const list = [...DEFAULT_QUICK_ITEMS];
    const existingLower = new Set(list.map((x) => x.name.toLowerCase()));
    for (const ci of dState.customItems) {
      if (!existingLower.has(ci.toLowerCase())) {
        list.push({ name: ci, short: ci, matches: [ci.toLowerCase()] });
        existingLower.add(ci.toLowerCase());
      }
    }
    return list;
  }

  function toast(msg) {
    if (window.SetAppToast) window.SetAppToast(msg);
  }

  function getTruckInventory() {
    return typeof window.SetAppGetTruckItems === 'function' ? window.SetAppGetTruckItems() : [];
  }

  function findTruckTotalQty(itemName) {
    const inv = getTruckInventory();
    const norm = itemName.trim().toLowerCase();
    const exact = inv.find((i) => i.name.trim().toLowerCase() === norm);
    if (exact) return Number(exact.qty) || 0;

    const q = getAllQuickItems().find((qi) => qi.name.toLowerCase() === norm);
    const keys = q ? q.matches : [norm.split('(')[0].trim()].filter(Boolean);
    if (keys.length === 0) return null;

    const matches = inv.filter((i) => {
      const n = i.name.toLowerCase();
      if (n.includes('5x32') && !norm.includes('5x32')) return false;
      if (n.includes('makara') && !norm.includes('makara')) return false;
      if (n.includes('pano') && !norm.includes('pano') && !norm.includes('gecekondu')) return false;
      if (n.includes('çatal') && !norm.includes('çatal')) return false;
      if (n.includes('distro') && !norm.includes('distro')) return false;
      if (n.includes('adaptör') && !norm.includes('adaptör') && !norm.includes('çevirici')) return false;
      if ((n.includes('kablo yolu') || n.includes('kablo kanalı')) && !norm.includes('kablo yolu') && !norm.includes('kablo kanalı') && !norm.includes('ramp')) return false;
      return keys.some((k) => n.includes(k));
    });
    if (matches.length === 0) return null;
    return matches.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
  }

  function doesLoanMatchTruckItem(loanItemName, truckItemName) {
    const ln = String(loanItemName || '').trim().toLowerCase();
    const tn = String(truckItemName || '').trim().toLowerCase();
    if (!ln || !tn) return false;
    if (ln === tn) return true;
    if (tn.includes('5x32') && !ln.includes('5x32')) return false;
    if (tn.includes('makara') && !ln.includes('makara')) return false;
    if (tn.includes('pano') && !ln.includes('pano') && !ln.includes('gecekondu')) return false;
    if (tn.includes('çatal') && !ln.includes('çatal')) return false;
    if (tn.includes('distro') && !ln.includes('distro')) return false;
    if (tn.includes('adaptör') && !ln.includes('adaptör') && !ln.includes('çevirici')) return false;
    if ((tn.includes('kablo yolu') || tn.includes('kablo kanalı')) && !ln.includes('kablo yolu') && !ln.includes('kablo kanalı') && !ln.includes('ramp')) return false;

    const q = getAllQuickItems().find((qi) => qi.name.toLowerCase() === ln);
    if (q && q.matches.some((k) => tn.includes(k))) return true;
    const base = ln.split('(')[0].trim();
    return base.length >= 3 && tn.includes(base);
  }

  function getOutInfoForItem(truckItemName) {
    const byDept = new Map();
    let totalOut = 0;
    for (const l of dState.loans) {
      if (doesLoanMatchTruckItem(l.itemName, truckItemName)) {
        const qty = Number(l.qty) || 0;
        totalOut += qty;
        const shortDept = String(l.dept || '').split('/')[0].trim();
        byDept.set(shortDept, (byDept.get(shortDept) || 0) + qty);
      }
    }
    const summaryText = Array.from(byDept.entries()).map(([d, q]) => `${d}: ${q}`).join(', ');
    return { totalOut, summaryText };
  }

  function getOutCountForLoanName(itemName) {
    const norm = String(itemName || '').trim().toLowerCase();
    return dState.loans
      .filter((l) => l.itemName.trim().toLowerCase() === norm)
      .reduce((s, l) => s + (Number(l.qty) || 0), 0);
  }

  function updateLiveStockHint(itemName) {
    const hintEl = document.getElementById('distroLiveStockHint');
    if (!hintEl) return;
    const clean = String(itemName || '').trim();
    if (!clean) {
      hintEl.textContent = 'Malzeme seçildiğinde kamyon stoğu görünür.';
      hintEl.className = 'distro-stock-hint mono';
      return;
    }
    const truckQty = findTruckTotalQty(clean);
    const outQty = getOutCountForLoanName(clean);
    if (truckQty === null) {
      hintEl.textContent = outQty > 0
        ? `Özel kalem • Şu an dışarıda: ${outQty} adet`
        : 'Özel malzeme • Kamyon stoğundan bağımsız takip';
      hintEl.className = 'distro-stock-hint mono';
      return;
    }
    const remaining = truckQty - outQty;
    hintEl.textContent = `Kamyon Toplam: ${truckQty} • Dışarıda: ${outQty} • Kalan: ${remaining}`;
    hintEl.className = `distro-stock-hint mono ${remaining < 0 ? 'hint-danger' : outQty > 0 ? 'hint-caution' : 'hint-safe'}`;
  }

  function buildDistroSuggestCandidates() {
    const seen = new Set();
    const list = [];
    for (const q of getAllQuickItems()) {
      const k = q.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        list.push({ name: q.name, category: 'Hızlı' });
      }
    }
    for (const it of getTruckInventory()) {
      const k = it.name.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        list.push({ name: it.name, category: it.category || 'Kamyon' });
      }
    }
    return list;
  }

  function renderDistroSuggestMenu(queryText = '') {
    const box = document.getElementById('distroItemSuggest');
    if (!box) return;
    const q = queryText.trim().toLowerCase();
    const candidates = buildDistroSuggestCandidates()
      .filter((c) => !q || `${c.name} ${c.category}`.toLowerCase().includes(q))
      .slice(0, 7);

    if (candidates.length === 0) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    box.style.display = 'block';
    box.innerHTML = candidates.map((c, idx) => {
      const truckQty = findTruckTotalQty(c.name);
      const outQty = getOutCountForLoanName(c.name);
      const stockTxt = truckQty !== null ? `Kalan: ${truckQty - outQty}/${truckQty}` : c.category;
      return `
        <button type="button" class="pro-suggest-item" data-dsug-idx="${idx}">
          <span class="pro-suggest-name">${esc(c.name)}</span>
          <span class="pro-suggest-meta mono">${esc(stockTxt)}</span>
        </button>
      `;
    }).join('');

    box.querySelectorAll('[data-dsug-idx]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const picked = candidates[Number(btn.dataset.dsugIdx)];
        if (!picked) return;
        dState.selectedItemName = picked.name;
        const inp = document.getElementById('distroCustomItemInput');
        if (inp) inp.value = picked.name;
        box.style.display = 'none';
        renderDistroPanel();
      });
    });
  }

  function addCustomDepartment(name) {
    const clean = String(name || '').trim();
    if (!clean) return;
    if (!getAllDepartments().some((d) => d.toLowerCase() === clean.toLowerCase())) {
      dState.customDepts.push(clean);
    }
    dState.selectedDept = clean;
    dState.addingDept = false;
    saveDistroState();
    renderDistroPanel();
    toast(`Birim eklendi: ${clean}`);
  }

  function addLoan(dept, itemName, qty, note = '') {
    const cleanItem = String(itemName || '').trim();
    const cleanNote = String(note || '').trim();
    const addQty = Math.max(1, Number(qty) || 1);
    if (!cleanItem) return;

    const isKnown = getAllQuickItems().some((x) => x.name.toLowerCase() === cleanItem.toLowerCase());
    if (!isKnown) {
      dState.customItems.push(cleanItem);
      if (dState.customItems.length > 12) dState.customItems.shift();
    }

    const existing = dState.loans.find(
      (l) => l.dept === dept && l.itemName.toLowerCase() === cleanItem.toLowerCase() && (l.note || '') === cleanNote
    );
    if (existing) {
      existing.qty += addQty;
      existing.time = nowHHMM();
    } else {
      dState.loans.unshift({
        id: uid(),
        dept,
        itemName: cleanItem,
        qty: addQty,
        note: cleanNote,
        time: nowHHMM()
      });
    }
    dState.selectedItemName = cleanItem;
    dState.qtyDraft = 1;
    saveDistroState();
    renderDistroPanel();
    if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
    toast(`${dept}: +${addQty} ${cleanItem}`);
  }

  function adjustLoan(loanId, delta) {
    const idx = dState.loans.findIndex((l) => l.id === loanId);
    if (idx === -1) return;
    dState.loans[idx].qty += delta;
    const item = dState.loans[idx];
    if (item.qty <= 0) {
      dState.loans.splice(idx, 1);
      toast(`Teslim alındı: ${item.dept} (${item.itemName})`);
    }
    saveDistroState();
    renderDistroPanel();
    if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
  }

  function returnAllForLoan(loanId) {
    const idx = dState.loans.findIndex((l) => l.id === loanId);
    if (idx === -1) return;
    const item = dState.loans[idx];
    dState.loans.splice(idx, 1);
    saveDistroState();
    renderDistroPanel();
    if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
    toast(`Geri alındı: ${item.qty}× ${item.itemName} (${item.dept})`);
  }

  function returnAllForDept(dept) {
    const clean = String(dept || '');
    const count = dState.loans.filter((l) => l.dept === clean).reduce((s, l) => s + (Number(l.qty) || 0), 0);
    if (count === 0) return;
    dState.loans = dState.loans.filter((l) => l.dept !== clean);
    saveDistroState();
    renderDistroPanel();
    if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
    toast(`${clean}: ${count} adet malzeme kamyona geri alındı`);
  }

  function getTotalOutCount() {
    return dState.loans.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  }

  function getActiveDeptCount() {
    return new Set(dState.loans.map((l) => l.dept)).size;
  }

  function buildDistroReport() {
    const now = new Date().toLocaleString('tr-TR');
    const totalOut = getTotalOutCount();
    const allDepts = getAllDepartments();
    const lines = [
      `DIŞ BİRİMLERDEKİ KABLO & AKSESUAR LİSTESİ`,
      `Tarih: ${now}`,
      `Toplam Dışarıda: ${totalOut} adet`,
      `────────────────────────────────`
    ];

    if (dState.loans.length === 0) {
      lines.push(`Diğer birimlerde bekleyen ışık ekipmanı yok — her şey kamyonda.`);
      return lines.join('\n');
    }

    lines.push(`MALZEME BAZLI TOPLAM ÖZET:`);
    const itemMap = new Map();
    for (const l of dState.loans) {
      if (!itemMap.has(l.itemName)) itemMap.set(l.itemName, { totalOut: 0, byDept: new Map() });
      const rec = itemMap.get(l.itemName);
      rec.totalOut += l.qty;
      rec.byDept.set(l.dept, (rec.byDept.get(l.dept) || 0) + l.qty);
    }
    itemMap.forEach((rec, name) => {
      const truckQty = findTruckTotalQty(name);
      const stockInfo = truckQty !== null ? ` (Kamyon toplam: ${truckQty}, Kalan: ${Math.max(0, truckQty - rec.totalOut)})` : '';
      const breakdown = Array.from(rec.byDept.entries()).map(([d, q]) => `${d}: ${q}`).join(', ');
      lines.push(`• ${name}: ${rec.totalOut} dışarıda${stockInfo} → [${breakdown}]`);
    });

    lines.push(``);
    lines.push(`BİRİMLERDEN TOPLANACAKLAR:`);
    for (const dept of allDepts) {
      const items = dState.loans.filter((l) => l.dept === dept);
      if (items.length === 0) continue;
      const sum = items.reduce((s, x) => s + x.qty, 0);
      lines.push(`▸ ${dept} (${sum} adet):`);
      items.forEach((it) => {
        lines.push(`   - ${it.qty}× ${it.itemName} (${it.time})${it.note ? ` — ${it.note}` : ''}`);
      });
    }

    return lines.join('\n');
  }

  function renderDistroPanel() {
    const outCount = getTotalOutCount();
    const badgeEl = document.getElementById('distroSubtabCount');
    if (badgeEl) badgeEl.textContent = outCount;

    const allDepts = getAllDepartments();
    const deptCounts = {};
    for (const d of allDepts) deptCounts[d] = 0;
    for (const l of dState.loans) {
      deptCounts[l.dept] = (deptCounts[l.dept] || 0) + l.qty;
    }

    // 0. 1-Dokunuş Hızlı Birim Çipleri
    const deptStrip = document.getElementById('distroDeptQuickStrip');
    if (deptStrip) {
      const priorityDepts = [
        'Kamera / DIT',
        'Ronin / Steadicam',
        'Reji / Monitör',
        'Ses',
        'Sanat',
        'Prodüksiyon',
        'Jeneratör',
        'Grip',
        'Makyaj / Saç'
      ];
      const chipDepts = [];
      const seenD = new Set();
      for (const d of allDepts) {
        if ((deptCounts[d] || 0) > 0 || d === dState.selectedDept) {
          seenD.add(d);
          chipDepts.push(d);
        }
      }
      for (const d of priorityDepts) {
        if (!seenD.has(d) && allDepts.includes(d)) {
          seenD.add(d);
          chipDepts.push(d);
        }
      }
      deptStrip.innerHTML = chipDepts.map((d) => {
        const cnt = deptCounts[d] || 0;
        const shortLabel = d.split('/')[0].trim();
        const isActive = dState.selectedDept === d;
        return `<button type="button" class="quick-strip-chip ${isActive ? 'active' : ''}" data-pick-dept="${esc(d)}">${esc(shortLabel)}${cnt > 0 ? ` <span class="mono dept-chip-cnt">${cnt}</span>` : ''}</button>`;
      }).join('');
      deptStrip.querySelectorAll('[data-pick-dept]').forEach((b) => {
        b.addEventListener('click', () => {
          dState.selectedDept = b.dataset.pickDept;
          renderDistroPanel();
        });
      });
    }

    // 1. Sade Birim Dropdown (13 hazır birim + özel eklenenler)
    const deptSel = document.getElementById('distroDeptSelect');
    if (deptSel) {
      deptSel.innerHTML = allDepts.map((d) => {
        const cnt = deptCounts[d] || 0;
        return `<option value="${esc(d)}" ${dState.selectedDept === d ? 'selected' : ''}>${esc(d)}${cnt > 0 ? ` (${cnt} dışarıda)` : ''}</option>`;
      }).join('');
    }

    const newDeptWrap = document.getElementById('distroNewDeptWrap');
    if (newDeptWrap) newDeptWrap.style.display = dState.addingDept ? 'flex' : 'none';

    // 2. Temiz tek satır hızlı malzeme şeridi
    const itemPicker = document.getElementById('distroQuickItemPicker');
    if (itemPicker) {
      itemPicker.innerHTML = getAllQuickItems().map((q) => {
        const stock = findTruckTotalQty(q.name);
        const active = dState.selectedItemName.toLowerCase() === q.name.toLowerCase();
        return `<button type="button" class="quick-strip-chip ${active ? 'active' : ''}" data-pick-item="${esc(q.name)}">${esc(q.short || q.name)}${stock !== null ? ` <span class="mono" style="opacity:0.7;">(${stock})</span>` : ''}</button>`;
      }).join('');
      itemPicker.querySelectorAll('[data-pick-item]').forEach((b) => {
        b.addEventListener('click', () => {
          dState.selectedItemName = b.dataset.pickItem;
          const inp = document.getElementById('distroCustomItemInput');
          if (inp) inp.value = dState.selectedItemName;
          renderDistroPanel();
        });
      });
    }

    const customInp = document.getElementById('distroCustomItemInput');
    if (customInp && !customInp.value) {
      customInp.value = dState.selectedItemName;
    }
    updateLiveStockHint(customInp ? customInp.value : dState.selectedItemName);

    const qtyValEl = document.getElementById('distroQtyVal');
    if (qtyValEl) qtyValEl.textContent = dState.qtyDraft;

    const noteWrap = document.getElementById('distroNoteWrap');
    if (noteWrap) noteWrap.style.display = dState.showNote ? 'block' : 'none';

    // 3. Başlık Özeti (Her zaman doğrudan "Kimde Ne Var?" birim listesi)
    const activeDepts = allDepts.filter((d) => (deptCounts[d] || 0) > 0);
    const hdrEl = document.getElementById('distroHeaderSummary');
    if (hdrEl) {
      hdrEl.textContent = outCount > 0
        ? `Kimde Ne Var? (${outCount} adet)`
        : 'Kimde Ne Var?';
    }

    const filterRow = document.getElementById('distroDeptFilterRow');
    if (filterRow) {
      dState.filterDept = 'Tümü';
      filterRow.style.display = 'none';
      filterRow.innerHTML = '';
    }

    dState.viewMode = 'byDept';
    document.querySelectorAll('[data-dview]').forEach((b) => {
      b.classList.toggle('active', b.dataset.dview === dState.viewMode);
    });

    // 4. Net "Kimde Ne Var?" Liste Alanı
    const listContainer = document.getElementById('distroSummaryList');
    if (!listContainer) return;

    const visibleLoans = dState.loans.filter((l) => dState.filterDept === 'Tümü' || l.dept === dState.filterDept);
    if (visibleLoans.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-box" style="padding:18px 10px;">
          Şu an başka birimde ekipman yok — tüm malzemeler kamyonda.
        </div>
      `;
      return;
    }

    if (dState.viewMode === 'byItem') {
      const grouped = new Map();
      for (const l of visibleLoans) {
        if (!grouped.has(l.itemName)) grouped.set(l.itemName, { totalOut: 0, entries: [] });
        const g = grouped.get(l.itemName);
        g.totalOut += l.qty;
        g.entries.push(l);
      }

      listContainer.innerHTML = Array.from(grouped.entries()).map(([itemName, g]) => {
        const truckQty = findTruckTotalQty(itemName);
        const remaining = truckQty !== null ? truckQty - g.totalOut : null;
        const overStock = remaining !== null && remaining < 0;

        const stockBadges = truckQty !== null
          ? `<span class="tag mono">Toplam: ${truckQty}</span>
             <span class="tag ${overStock ? 'tag-danger' : 'tag-caution'} mono">Dışarıda: ${g.totalOut}</span>
             <span class="tag ${overStock ? 'tag-danger' : 'tag-safe'} mono">Kamyonda: ${remaining}</span>`
          : `<span class="tag tag-caution mono">${g.totalOut} adet dışarıda</span>`;

        const rows = g.entries.map((l) => `
          <div class="distro-entry-row">
            <div style="flex:1; min-width:110px;">
              <strong style="font-size:13px;">📍 ${esc(l.dept)}: ${l.qty} adet</strong>
              <span class="mono" style="font-size:10.5px; color:var(--text-dim); margin-left:5px;">Saat ${l.time}</span>
              ${l.note ? `<div style="font-size:11px; color:var(--text-muted);">${esc(l.note)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <div class="stepper">
                <button type="button" data-ln-dec="${l.id}">−</button>
                <span class="mono">${l.qty}</span>
                <button type="button" data-ln-inc="${l.id}">+</button>
              </div>
              <button type="button" class="st-pill active-ok" data-ln-ret="${l.id}">✓ Geri Geldi</button>
            </div>
          </div>
        `).join('');

        return `
          <div class="distro-group-card ${overStock ? 'over-stock' : ''}">
            <div class="distro-group-head">
              <div style="font-weight:700; font-size:13.5px;">${esc(itemName)}</div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">${stockBadges}</div>
            </div>
            <div class="distro-entries">${rows}</div>
          </div>
        `;
      }).join('');
    } else {
      const groupedDept = new Map();
      for (const l of visibleLoans) {
        if (!groupedDept.has(l.dept)) groupedDept.set(l.dept, []);
        groupedDept.get(l.dept).push(l);
      }

      listContainer.innerHTML = Array.from(groupedDept.entries()).map(([dept, entries]) => {
        const sum = entries.reduce((s, x) => s + x.qty, 0);
        const rows = entries.map((l) => {
          const totalOutForItem = getOutCountForLoanName(l.itemName);
          const truckQty = findTruckTotalQty(l.itemName);
          const remaining = truckQty !== null ? truckQty - totalOutForItem : null;
          const stockSub = truckQty !== null
            ? `Kamyonda kalan: ${remaining}/${truckQty}`
            : 'Kamyon dışı kalem';
          return `
            <div class="distro-entry-row">
              <div style="flex:1; min-width:110px;">
                <div style="font-size:13px;"><strong>${l.qty} × ${esc(l.itemName)}</strong></div>
                <div class="mono" style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">
                  ${esc(stockSub)} · Saat ${l.time}${l.note ? ` · ${esc(l.note)}` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                ${l.qty > 1 ? `<button type="button" class="btn btn-soft btn-xs mono" data-ln-dec="${l.id}" title="1 adet azalt">−1</button>` : ''}
                <button type="button" class="st-pill active-ok" data-ln-ret="${l.id}">✓ Geldi</button>
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="distro-group-card">
            <div class="distro-group-head">
              <div style="font-weight:700; font-size:13.5px;">📍 ${esc(dept)} <span class="tag tag-caution mono" style="margin-left:5px;">${sum} adet</span></div>
              <button type="button" class="btn btn-soft btn-xs" data-dept-ret-all="${esc(dept)}">Tümünü Geri Al</button>
            </div>
            <div class="distro-entries">${rows}</div>
          </div>
        `;
      }).join('');
    }

    listContainer.querySelectorAll('[data-ln-dec]').forEach((b) =>
      b.addEventListener('click', () => adjustLoan(b.dataset.lnDec, -1))
    );
    listContainer.querySelectorAll('[data-ln-inc]').forEach((b) =>
      b.addEventListener('click', () => adjustLoan(b.dataset.lnInc, 1))
    );
    listContainer.querySelectorAll('[data-ln-ret]').forEach((b) =>
      b.addEventListener('click', () => returnAllForLoan(b.dataset.lnRet))
    );
    listContainer.querySelectorAll('[data-dept-ret-all]').forEach((b) =>
      b.addEventListener('click', () => returnAllForDept(b.dataset.deptRetAll))
    );
  }

  function bindDistroEvents() {
    const deptSel = document.getElementById('distroDeptSelect');
    if (deptSel) {
      deptSel.addEventListener('change', (e) => {
        dState.selectedDept = e.target.value;
        renderDistroPanel();
      });
    }

    const newDeptToggle = document.getElementById('distroToggleNewDeptBtn');
    if (newDeptToggle) {
      newDeptToggle.addEventListener('click', () => {
        dState.addingDept = !dState.addingDept;
        renderDistroPanel();
        if (dState.addingDept) {
          const inp = document.getElementById('distroNewDeptInput');
          if (inp) inp.focus();
        }
      });
    }

    const addDeptBtn = document.getElementById('distroSaveNewDeptBtn');
    const newDeptInp = document.getElementById('distroNewDeptInput');
    if (addDeptBtn && newDeptInp) {
      const doAdd = () => {
        if (newDeptInp.value.trim()) {
          addCustomDepartment(newDeptInp.value);
          newDeptInp.value = '';
        }
      };
      addDeptBtn.addEventListener('click', doAdd);
      newDeptInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doAdd();
        }
      });
    }

    const decBtn = document.getElementById('distroQtyDec');
    const incBtn = document.getElementById('distroQtyInc');
    if (decBtn) {
      decBtn.addEventListener('click', () => {
        dState.qtyDraft = Math.max(1, dState.qtyDraft - 1);
        const v = document.getElementById('distroQtyVal');
        if (v) v.textContent = dState.qtyDraft;
      });
    }
    if (incBtn) {
      incBtn.addEventListener('click', () => {
        dState.qtyDraft = Math.min(99, dState.qtyDraft + 1);
        const v = document.getElementById('distroQtyVal');
        if (v) v.textContent = dState.qtyDraft;
      });
    }

    const noteToggle = document.getElementById('distroToggleNoteBtn');
    if (noteToggle) {
      noteToggle.addEventListener('click', () => {
        dState.showNote = !dState.showNote;
        renderDistroPanel();
        if (dState.showNote) {
          const inp = document.getElementById('distroNoteInput');
          if (inp) inp.focus();
        }
      });
    }

    const itemInp = document.getElementById('distroCustomItemInput');
    const sugBox = document.getElementById('distroItemSuggest');
    if (itemInp) {
      itemInp.addEventListener('focus', () => renderDistroSuggestMenu(itemInp.value));
      itemInp.addEventListener('input', (e) => {
        dState.selectedItemName = e.target.value;
        updateLiveStockHint(e.target.value);
        renderDistroSuggestMenu(e.target.value);
      });
      itemInp.addEventListener('blur', () => {
        setTimeout(() => { if (sugBox) sugBox.style.display = 'none'; }, 160);
      });
    }

    const form = document.getElementById('distroAddForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const noteInp = document.getElementById('distroNoteInput');
        const name = itemInp ? itemInp.value.trim() : dState.selectedItemName;
        const note = noteInp ? noteInp.value.trim() : '';
        if (!name) return;
        addLoan(dState.selectedDept, name, dState.qtyDraft, note);
        if (noteInp) noteInp.value = '';
        if (sugBox) sugBox.style.display = 'none';
      });
    }

    document.querySelectorAll('[data-dview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        dState.viewMode = btn.dataset.dview;
        renderDistroPanel();
      });
    });

    const repBtn = document.getElementById('exportDistroReportBtn');
    if (repBtn) {
      repBtn.addEventListener('click', () => {
        if (window.SetAppOpenReport) {
          window.SetAppOpenReport('Birimlere Dağıtılan Ekipman Raporu', buildDistroReport());
        }
      });
    }

    const clearAllBtn = document.getElementById('clearAllDistroBtn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (dState.loans.length === 0) return;
        dState.loans = [];
        saveDistroState();
        renderDistroPanel();
        if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
        toast('Tüm birim zimmetleri temizlendi');
      });
    }
  }

  window.SetDistroUI = {
    init() {
      bindDistroEvents();
      renderDistroPanel();
    },
    render: renderDistroPanel,
    prefillItem(itemName) {
      const clean = String(itemName || '').trim();
      if (!clean) return;
      dState.selectedItemName = clean;
      const inp = document.getElementById('distroCustomItemInput');
      if (inp) inp.value = clean;
      renderDistroPanel();
    },
    getTotalOutCount,
    getActiveDeptCount,
    getOutInfoForItem
  };
})();
