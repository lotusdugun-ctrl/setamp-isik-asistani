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
    fastMult: 1,
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

  function getDeptVisualMeta(dept) {
    const d = String(dept || '').toLowerCase();
    if (d.includes('kamera') || d.includes('dit')) return { icon: '🎥', cls: 'dept-blue' };
    if (d.includes('ronin') || d.includes('steadicam') || d.includes('drone')) return { icon: '🎯', cls: 'dept-cyan' };
    if (d.includes('reji') || d.includes('monitör')) return { icon: '🎬', cls: 'dept-purple' };
    if (d.includes('ses')) return { icon: '🎙️', cls: 'dept-green' };
    if (d.includes('jeneratör')) return { icon: '⚡', cls: 'dept-amber' };
    if (d.includes('sanat') || d.includes('makyaj') || d.includes('kostüm')) return { icon: '🎨', cls: 'dept-pink' };
    if (d.includes('prodüksiyon') || d.includes('catering') || d.includes('karavan')) return { icon: '📋', cls: 'dept-indigo' };
    if (d.includes('grip')) return { icon: '🔧', cls: 'dept-orange' };
    return { icon: '📍', cls: 'dept-cyan' };
  }

  function getQuickItemColorClass(name) {
    const n = String(name || '').toLowerCase();
    if (/16a|türk|makara|kablo kanalı/.test(n)) return 'qitem-cable';
    if (/32a|63a|125a|pano|gecekondu/.test(n)) return 'qitem-power';
    if (/c-stand|cstand|çelik|a100|ayak/.test(n)) return 'qitem-stand';
    if (/kum torbası|flag|bayrak/.test(n)) return 'qitem-grip';
    return 'qitem-acc';
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

    // 0. Renkli 4-Sütunlu Birim Seçici Izgara (Kaydırmasız)
    const deptStrip = document.getElementById('distroDeptQuickStrip');
    if (deptStrip) {
      const priorityDepts = [
        'Kamera / DIT',
        'Ronin / Steadicam',
        'Reji / Monitör',
        'Ses',
        'Jeneratör',
        'Sanat',
        'Prodüksiyon',
        'Grip',
        'Makyaj / Saç'
      ];
      const chipDepts = [];
      const seenD = new Set();
      for (const d of priorityDepts) {
        if (allDepts.includes(d)) {
          seenD.add(d);
          chipDepts.push(d);
        }
      }
      for (const d of allDepts) {
        if (!seenD.has(d) && ((deptCounts[d] || 0) > 0 || d === dState.selectedDept || dState.customDepts.includes(d))) {
          seenD.add(d);
          chipDepts.push(d);
        }
      }
      deptStrip.innerHTML = chipDepts.map((d) => {
        const cnt = deptCounts[d] || 0;
        const shortLabel = d.split('/')[0].trim();
        const isActive = dState.selectedDept === d;
        const meta = getDeptVisualMeta(d);
        return `
          <button type="button" class="distro-dept-btn ${meta.cls} ${isActive ? 'active' : ''}" data-pick-dept="${esc(d)}">
            <span class="dd-left"><span>${meta.icon}</span> <span>${esc(shortLabel)}</span></span>
            ${cnt > 0 ? `<span class="mono dept-chip-cnt">${cnt}</span>` : ''}
          </button>
        `;
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

    const activeMeta = getDeptVisualMeta(dState.selectedDept);
    const activeDeptHint = document.getElementById('distroActiveDeptHint');
    if (activeDeptHint) {
      activeDeptHint.textContent = `${activeMeta.icon} ${dState.selectedDept.split('/')[0].trim()} (+${dState.fastMult || 1})`;
    }

    // 2A. Tek tıkla kaç adet verileceği (+1, +2, +3, +5, +10)
    const multRow = document.getElementById('distroFastMultRow');
    if (multRow) {
      const mults = [1, 2, 3, 5, 10];
      multRow.innerHTML = `<span class="distro-mult-lbl">Kaç adet?</span>` + mults.map((m) =>
        `<button type="button" class="distro-mult-btn mono ${(dState.fastMult || 1) === m ? 'active' : ''}" data-dmult="${m}">+${m}</button>`
      ).join('');
      multRow.querySelectorAll('[data-dmult]').forEach((b) => {
        b.addEventListener('click', () => {
          dState.fastMult = Number(b.dataset.dmult) || 1;
          renderDistroPanel();
        });
      });
    }

    // 2B. Renkli Tek Dokunuşla ANINDA VER hızlı malzeme butonları
    const itemPicker = document.getElementById('distroQuickItemPicker');
    if (itemPicker) {
      const curMult = dState.fastMult || 1;
      itemPicker.innerHTML = getAllQuickItems().slice(0, 12).map((q) => {
        const stock = findTruckTotalQty(q.name);
        const outQty = getOutCountForLoanName(q.name);
        const rem = stock !== null ? Math.max(0, stock - outQty) : null;
        const colCls = getQuickItemColorClass(q.name);
        return `
          <button type="button" class="distro-instant-tile ${colCls}" data-instant-item="${esc(q.name)}" title="${esc(dState.selectedDept)} birimine +${curMult} ${esc(q.name)} ver">
            <span class="dit-top">
              <span class="dit-plus mono">+${curMult}</span>
              <span class="dit-name">${esc(q.short || q.name)}</span>
            </span>
            <span class="dit-sub mono">${rem !== null ? `Kamyon: ${rem}` : 'Hızlı Ver'}</span>
          </button>
        `;
      }).join('');
      itemPicker.querySelectorAll('[data-instant-item]').forEach((b) => {
        b.addEventListener('click', () => {
          const itemName = b.dataset.instantItem;
          const noteInp = document.getElementById('distroNoteInput');
          const note = noteInp ? noteInp.value.trim() : '';
          const inp = document.getElementById('distroCustomItemInput');
          if (inp) inp.value = itemName;
          addLoan(dState.selectedDept, itemName, dState.fastMult || 1, note);
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

    // 3. Başlık Özeti + Birime Göre / Malzemeye Göre Görünüm Seçici
    const activeDepts = allDepts.filter((d) => (deptCounts[d] || 0) > 0);
    const hdrEl = document.getElementById('distroHeaderSummary');
    if (hdrEl) {
      hdrEl.textContent = outCount > 0
        ? `Kimde Ne Var? (${outCount} adet)`
        : 'Kimde Ne Var?';
    }

    if (dState.filterDept !== 'Tümü' && (deptCounts[dState.filterDept] || 0) === 0) {
      dState.filterDept = 'Tümü';
    }

    document.querySelectorAll('[data-dview]').forEach((b) => {
      b.classList.toggle('active', b.dataset.dview === dState.viewMode);
    });

    const filterRow = document.getElementById('distroDeptFilterRow');
    if (filterRow) {
      if (dState.viewMode === 'byDept' && activeDepts.length > 1) {
        filterRow.style.display = 'flex';
        filterRow.innerHTML = [
          `<button type="button" class="quick-strip-chip ${dState.filterDept === 'Tümü' ? 'active' : ''}" data-filter-dept="Tümü">Tüm Birimler (${outCount})</button>`,
          ...activeDepts.map((d) => {
            const shortD = d.split('/')[0].trim();
            return `<button type="button" class="quick-strip-chip ${dState.filterDept === d ? 'active' : ''}" data-filter-dept="${esc(d)}">${esc(shortD)} (${deptCounts[d]})</button>`;
          })
        ].join('');
        filterRow.querySelectorAll('[data-filter-dept]').forEach((b) => {
          b.addEventListener('click', () => {
            dState.filterDept = b.dataset.filterDept;
            renderDistroPanel();
          });
        });
      } else {
        filterRow.style.display = 'none';
        filterRow.innerHTML = '';
      }
    }

    // 4. Net "Kimde Ne Var?" Liste Alanı (Birime Göre veya Malzemeye Göre)
    const listContainer = document.getElementById('distroSummaryList');
    if (!listContainer) return;

    const visibleLoans = dState.viewMode === 'byDept'
      ? dState.loans.filter((l) => dState.filterDept === 'Tümü' || l.dept === dState.filterDept)
      : dState.loans;

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
        const remaining = truckQty !== null ? Math.max(0, truckQty - g.totalOut) : null;
        const overStock = truckQty !== null && truckQty - g.totalOut < 0;

        const stockBadges = truckQty !== null
          ? `<span class="tag ${overStock ? 'tag-danger' : 'tag-caution'} mono">Dışarıda: ${g.totalOut}</span>
             <span class="tag ${overStock ? 'tag-danger' : 'tag-safe'} mono">Kamyonda: ${remaining}/${truckQty}</span>`
          : `<span class="tag tag-caution mono">Dışarıda: ${g.totalOut} adet</span>`;

        const rows = g.entries.map((l) => {
          const dm = getDeptVisualMeta(l.dept);
          return `
          <div class="distro-entry-row">
            <div style="flex:1; min-width:110px;">
              <div class="inv-item-line">
                <span class="inv-qty-box mono">${l.qty}×</span>
                <strong style="font-size:13px;">${dm.icon} ${esc(l.dept)}</strong>
              </div>
              <div class="mono" style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">
                Saat ${l.time}${l.note ? ` · ${esc(l.note)}` : ''}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
              ${l.qty > 1 ? `<button type="button" class="btn btn-soft btn-xs mono" data-ln-dec="${l.id}" title="1 adet azalt">−1</button>` : ''}
              <button type="button" class="btn btn-soft btn-xs mono" data-ln-inc="${l.id}" title="1 adet daha ekle">+1</button>
              <button type="button" class="st-pill active-ok" data-ln-ret="${l.id}">✓ Geldi</button>
            </div>
          </div>
        `;
        }).join('');

        return `
          <div class="distro-group-card ${overStock ? 'over-stock' : ''}">
            <div class="distro-group-head">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <strong style="font-size:13.5px;">🔌 ${esc(itemName)}</strong>
                ${stockBadges}
              </div>
              <button type="button" class="btn btn-soft btn-xs" data-item-ret-all="${esc(itemName)}">Tümünü Geri Al</button>
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
        const dm = getDeptVisualMeta(dept);
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
                <div class="inv-item-line">
                  <span class="inv-qty-box mono">${l.qty}×</span>
                  <strong style="font-size:13px;">${esc(l.itemName)}</strong>
                </div>
                <div class="mono" style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">
                  ${esc(stockSub)} · Saat ${l.time}${l.note ? ` · ${esc(l.note)}` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
                ${l.qty > 1 ? `<button type="button" class="btn btn-soft btn-xs mono" data-ln-dec="${l.id}" title="1 adet azalt">−1</button>` : ''}
                <button type="button" class="btn btn-soft btn-xs mono" data-ln-inc="${l.id}" title="1 adet daha ekle">+1</button>
                <button type="button" class="st-pill active-ok" data-ln-ret="${l.id}">✓ Geldi</button>
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="distro-group-card ${dm.cls}">
            <div class="distro-group-head">
              <div style="font-weight:700; font-size:13.5px;">${dm.icon} ${esc(dept)} <span class="tag tag-caution mono" style="margin-left:5px;">${sum} adet</span></div>
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
    listContainer.querySelectorAll('[data-item-ret-all]').forEach((b) =>
      b.addEventListener('click', () => returnAllForTruckItem(b.dataset.itemRetAll))
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

  function returnAllForTruckItem(truckItemName) {
    const matching = dState.loans.filter((l) => doesLoanMatchTruckItem(l.itemName, truckItemName));
    if (matching.length === 0) return;
    const totalReturned = matching.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    dState.loans = dState.loans.filter((l) => !doesLoanMatchTruckItem(l.itemName, truckItemName));
    saveDistroState();
    renderDistroPanel();
    if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
    toast(`Kamyona geri alındı: ${totalReturned}× ${truckItemName}`);
  }

  function getQuickDepts() {
    const priority = [
      'Kamera / DIT',
      'Ronin / Steadicam',
      'Reji / Monitör',
      'Ses',
      'Jeneratör',
      'Sanat',
      'Prodüksiyon',
      'Grip'
    ];
    const seen = new Set();
    const out = [];
    for (const d of [...dState.customDepts, ...priority]) {
      if (!seen.has(d)) {
        seen.add(d);
        out.push(d);
      }
    }
    return out.slice(0, 8);
  }

  function getLoansSummaryLines() {
    if (dState.loans.length === 0) return [];
    const lines = [];
    const allDepts = getAllDepartments();
    for (const dept of allDepts) {
      const items = dState.loans.filter((l) => l.dept === dept);
      if (items.length === 0) continue;
      const sum = items.reduce((s, x) => s + x.qty, 0);
      lines.push(`▸ ${dept} (${sum} adet): ${items.map((it) => `${it.qty}× ${it.itemName}`).join(', ')}`);
    }
    return lines;
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
    quickLend(dept, itemName, qty = 1) {
      addLoan(dept || dState.selectedDept, itemName, qty, '');
    },
    returnAllForTruckItem,
    getQuickDepts,
    getLoansSummaryLines,
    getTotalOutCount,
    getActiveDeptCount,
    getOutInfoForItem
  };
})();
