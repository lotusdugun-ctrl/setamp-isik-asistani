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
    { name: 'Türk Kablo (Üçlü Grup Priz)', short: 'Türk Kablo', matches: ['türk kablo', 'üçlü', "3'lü", 'çoklu priz'] },
    { name: '16A Kablo', short: '16A Kablo', matches: ['16a kablo', '16a uzatma', '16a monofaze', 'stinger'] },
    { name: '32A Kablo', short: '32A Kablo', matches: ['32a kablo', '32a monofaze', '32a trifaze'] },
    { name: '63A Kablo', short: '63A Kablo', matches: ['63a kablo', '63a trifaze'] },
    { name: 'Çelik Ayak (A100)', short: 'A100 Ayak', matches: ['çelik a100', 'çelik ayak', 'a100'] },
    { name: 'Uzun / Kısa C-Stand', short: 'C-Stand', matches: ['c-stand', 'cstand'] },
    { name: '1000W Mizar', short: "1000'lik Mizar", matches: ['mizar 1000', '1000w mizar', '1000 lik mizar', 'mizar'] },
    { name: '650W Mizar', short: "650'lik Mizar", matches: ['mizar 650', '650w mizar', '650 lik mizar'] },
    { name: 'Kum Torbası', short: 'Kum Torbası', matches: ['kum torbası'] },
    { name: 'Plastik Maşa / Kardelini', short: 'Maşa/Kardelini', matches: ['plastik maşa', 'kardelini', 'cardellini', 'klemp'] },
    { name: 'Kablo Kanalı (Kablo Yolu)', short: 'Kablo Yolu', matches: ['kablo kanalı', 'kablo yolu', 'ramp', 'yellow jacket'] },
    { name: '16A / 32A Makara', short: 'Makara', matches: ['makara'] },
    { name: 'Autopol', short: 'Autopol', matches: ['autopol'] },
    { name: 'Flag (Siyah Bayrak)', short: 'Flag', matches: ['flag', 'floppy'] },
    { name: 'V-Mount Akü', short: 'V-Mount Akü', matches: ['v-mount', 'v mound', 'akü'] },
    { name: 'Amaran 80c / 300c', short: 'Amaran 80/300c', matches: ['80c', '300c', 'amaran'] },
    { name: 'Astera Titan Set', short: 'Titan Tüp', matches: ['astera', 'titan'] },
    { name: '63A Gecekondu Pano', short: 'Gecekondu', matches: ['gecekondu', '63a pano'] }
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
    if (/16a|türk|makara|kablo/.test(n) && !/32a|63a|125a/.test(n)) return 'qitem-cable';
    if (/32a|63a|125a|pano|gecekondu|mizar|amaran|titan|lamba/.test(n)) return 'qitem-power';
    if (/c-stand|cstand|çelik|a100|ayak|autopol/.test(n)) return 'qitem-stand';
    if (/kum torbası|flag|bayrak/.test(n)) return 'qitem-grip';
    return 'qitem-acc';
  }

  // ==================== AKILLI TEK CÜMLE ÇOKLU MALZEME ÇÖZÜMLEYİCİ ====================
  const DEPT_EXTRACT_RULES = [
    { dept: 'Prodüksiyon', re: /\b(?:prod[üu]ksiyon|produksiyon|prod)\s*(?:ekibi(?:ne)?|birimi(?:ne)?)?\b/i },
    { dept: 'Kamera / DIT', re: /\b(?:kamera(?:\s*ekibi)?|dit|focus)\b/i },
    { dept: 'Ronin / Steadicam', re: /\b(?:ronin|steadicam|stedi|gimbal)\s*(?:ekibi)?\b/i },
    { dept: 'Drone / Jimmy Jib', re: /\b(?:drone|dron|jimmy\s*jib|jib)\s*(?:ekibi)?\b/i },
    { dept: 'Reji / Monitör', re: /\b(?:reji|monit[öo]r(?:\s*ekibi)?)\b/i },
    { dept: 'Ses', re: /\b(?:ses(?:\s*ekibi)?|ses[çc]i)\b/i },
    { dept: 'Sanat', re: /\b(?:sanat(?:\s*ekibi)?|dekor)\b/i },
    { dept: 'Makyaj / Saç', re: /\b(?:makyaj|sa[çc]\s*ekibi|kuaf[öo]r)\b/i },
    { dept: 'Kostüm', re: /\b(?:kost[üu]m(?:\s*ekibi)?)\b/i },
    { dept: 'Jeneratör', re: /\b(?:jenerat[öo]r(?:c[üu])?|jen)\b/i },
    { dept: 'Grip', re: /\b(?:grip(?:\s*ekibi)?|[şs]aryo)\b/i },
    { dept: 'Karavan / Mekan', re: /\b(?:karavan|mekan)\b/i },
    { dept: 'Catering / Çaycı', re: /\b(?:catering|[çc]ayc[ıi]|[çc]ay\s*oca[ğg][ıi])\b/i }
  ];

  const ITEM_EXTRACT_PATTERNS = [
    { name: '1000W Mizar', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:1000\s*['’]?\s*l[iıuü]k\s*mizar|mizar\s*1000\s*w?|1000\s*w\s*mizar)/gi },
    { name: '650W Mizar', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:650\s*['’]?\s*l[iıuü]k\s*mizar|mizar\s*650\s*w?|650\s*w\s*mizar)/gi },
    { name: '300W Mizar', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:300\s*['’]?\s*l[iıuü]k\s*mizar|mizar\s*300\s*w?|300\s*w\s*mizar)/gi },
    { name: '1000W Mizar', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?\bmizar\b/gi },
    { name: 'Türk Kablo (Üçlü Grup Priz)', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:t[üu]rk+\s*(?:kablo(?:su)?|priz[i]?)?|[üu][çc]l[üu]\s*(?:grup\s*)?(?:priz|kablo)?)/gi },
    { name: 'Kablo Kanalı (Kablo Yolu)', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?kablo\s*(?:kanal[ıi]|yolu)/gi },
    { name: '16A / 32A Makara', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:(?:16|32)\s*a?\s*)?\bmakara\b/gi },
    { name: '63A Gecekondu Pano', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:63\s*a?\s*)?gecekondu(?:\s*pano)?/gi },
    { name: '16A / 32A Pano', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:(?:16|32|63)\s*a?\s*)?\bpano\b/gi },
    { name: '16A Kablo', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?16\s*a?(?:\s*['’]?\s*l[iıuü]k)?(?:\s*kablo)?\b/gi },
    { name: '32A Kablo', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:5\s*x\s*)?32\s*a?(?:\s*['’]?\s*l[iıuü]k)?(?:\s*kablo)?\b/gi },
    { name: '63A Kablo', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?63\s*a?(?:\s*['’]?\s*l[iıuü]k)?(?:\s*kablo)?\b/gi },
    { name: '125A Kablo', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?125\s*a?(?:\s*['’]?\s*l[iıuü]k)?(?:\s*kablo)?\b/gi },
    { name: 'Çelik Ayak (A100)', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:[çc]elik\s*a\s*100(?:\s*ayak)?|a\s*100(?:\s*[çc]elik)?(?:\s*ayak|\s*aya[ğg][ıi])?|[çc]elik\s*ayak)/gi },
    { name: 'B250 Ayak', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?b\s*250(?:\s*ayak)?/gi },
    { name: 'Baba Ayak', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?baba\s*ayak/gi },
    { name: 'Bodur Çelik', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?bodur(?:\s*[çc]elik)?(?:\s*ayak)?/gi },
    { name: 'Uzun / Kısa C-Stand', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:uzun\s*|k[ıi]sa\s*)?c[\s\-]*stand/gi },
    { name: 'Autopol', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:uzun\s*|orta\s*|k[ıi]sa\s*)?autopol/gi },
    { name: 'Kum Torbası', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?kum\s*torbas[ıi]/gi },
    { name: 'Plastik Maşa / Kardelini', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:plastik\s*ma[şs]a|ma[şs]a|kardelini|cardellini)/gi },
    { name: 'Oynar Kafa', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?oynar\s*kafa/gi },
    { name: 'Magic Arm', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:magic|macig)\s*arm/gi },
    { name: 'Flag (Siyah Bayrak)', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:flag|bayrak|floppy)/gi },
    { name: 'V-Mount Akü', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:v[\s\-]*moun[td]\s*)?ak[üu]/gi },
    { name: 'Magliner', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?magliner/gi },
    { name: 'Amaran 80c', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:amaran\s*)?80\s*c\b/gi },
    { name: 'Amaran 150c', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:amaran\s*)?150\s*c\b/gi },
    { name: 'Amaran 300c', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:amaran\s*)?300\s*c\b/gi },
    { name: 'Aputure 700x', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:aputure\s*|storm\s*)?700\s*x\b/gi },
    { name: 'Aputure 1000c', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:aputure\s*|storm\s*)?1000\s*c\b/gi },
    { name: 'Aputure XT52', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:aputure\s*|storm\s*)?xt\s*52/gi },
    { name: 'Godox MG4K', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:godox\s*)?mg\s*4k/gi },
    { name: 'Astera Titan Set', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:astera|titan(?:\s*t[üu]p|\s*set)?)/gi },
    { name: 'MC Pro Set', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?mc\s*pro/gi },
    { name: 'Dedo 24V', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?dedo(?:light)?/gi },
    { name: 'Godox Bulb', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:godox\s*)?bulb/gi },
    { name: 'SkyPanel S60', re: /(?:(\d+)\s*(?:x|×|adet|tane)?\s*)?(?:skypanel|\bs60\b)/gi }
  ];

  function parseQuickLoanSentence(rawText, fallbackDept) {
    let work = String(rawText || '').trim();
    if (!work) return { dept: fallbackDept || dState.selectedDept, explicitDept: false, isReturn: false, returnAllDept: false, note: '', items: [] };

    let detectedDept = fallbackDept || dState.selectedDept;
    let explicitDept = false;
    for (const rule of DEPT_EXTRACT_RULES) {
      if (rule.re.test(work)) {
        detectedDept = rule.dept;
        explicitDept = true;
        work = work.replace(rule.re, ' ');
        break;
      }
    }

    const isReturn = /\b(?:geri\s*geldi|geldi|iade|teslim\s*ett[iı]|getirdi)\b/i.test(work);
    const returnAllDept = isReturn && /\b(?:hepsi|tamam[ıi]|t[üu]m[üu])\b/i.test(work);
    if (isReturn) {
      work = work.replace(/\b(?:geri\s*geldi|geldi|iade|teslim\s*ett[iı]|getirdi|hepsi|tamam[ıi]|t[üu]m[üu])\b/gi, ' ');
    }

    let note = '';
    const icinMatch = work.match(/\b([a-zA-ZğüşöçıİĞÜŞÖÇ]+(?:\s+[a-zA-ZğüşöçıİĞÜŞÖÇ]+)?)\s+i[çc]in\b/i);
    if (icinMatch) {
      note = `${icinMatch[1].trim()} için`;
      work = work.replace(icinMatch[0], ' ');
    }

    // Dolgu kelimelerini temizle
    work = work.replace(/\b(?:ald[ıi](?:lar)?|verildi|verdik|g[öo]t[üu]rd[üu]|istedi|laz[ıi]m|sette|birim[ie]?)\b/gi, ' ');

    const extracted = [];
    const addOrMerge = (name, qty) => {
      const q = Math.max(1, Number(qty) || 1);
      const ex = extracted.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (ex) ex.qty += q;
      else extracted.push({ name, qty: q });
    };

    for (const pat of ITEM_EXTRACT_PATTERNS) {
      pat.re.lastIndex = 0;
      work = work.replace(pat.re, (_, qStr) => {
        addOrMerge(pat.name, qStr ? Number(qStr) : 1);
        return ' , ';
      });
    }

    // Kalan parçalarda özel malzeme varsa ekle
    const leftovers = work
      .split(/[,+;/]|\bve\b|\bile\b|\bart[ıi]\b/i)
      .map((s) => s.replace(/^[\s\-•:]+|[\s\-•:]+$/g, '').trim())
      .filter((s) => s.length >= 3 && !/^\d+$/.test(s));

    for (const piece of leftovers) {
      const m = piece.match(/^(\d+)\s*(?:x|×|adet|tane)?\s+(.+)$/i);
      if (m && m[2].trim().length >= 2) {
        addOrMerge(m[2].trim(), Number(m[1]) || 1);
      } else {
        addOrMerge(piece, 1);
      }
    }

    return {
      dept: detectedDept,
      explicitDept,
      isReturn,
      returnAllDept,
      note,
      items: extracted
    };
  }

  function applyReturnFromSentence(parsed) {
    if (parsed.returnAllDept) {
      returnAllForDept(parsed.dept);
      return true;
    }
    let returnedCount = 0;
    for (const it of parsed.items) {
      const idx = dState.loans.findIndex(
        (l) => ( !parsed.explicitDept || l.dept === parsed.dept ) && doesLoanMatchTruckItem(l.itemName, it.name)
      );
      const fallbackIdx = idx !== -1 ? idx : dState.loans.findIndex((l) => doesLoanMatchTruckItem(l.itemName, it.name));
      if (fallbackIdx !== -1) {
        dState.loans[fallbackIdx].qty -= it.qty;
        if (dState.loans[fallbackIdx].qty <= 0) dState.loans.splice(fallbackIdx, 1);
        returnedCount += 1;
      }
    }
    if (returnedCount > 0) {
      saveDistroState();
      renderDistroPanel();
      if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
      toast(`✓ Geri alındı (${returnedCount} kalem)`);
      return true;
    }
    toast('Eşleşen dışarıda malzeme bulunamadı');
    return false;
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
        let shortLabel = d.split('/')[0].trim();
        if (shortLabel === 'Prodüksiyon') shortLabel = 'Prodük.';
        const isActive = dState.selectedDept === d;
        const meta = getDeptVisualMeta(d);
        return `
          <button type="button" class="distro-dept-btn ${meta.cls} ${isActive ? 'active' : ''}" data-pick-dept="${esc(d)}">
            <span class="dd-left"><span class="dd-ic">${meta.icon}</span><span>${esc(shortLabel)}</span></span>
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
      activeDeptHint.textContent = `${activeMeta.icon} ${dState.selectedDept.split('/')[0].trim()}`;
    }

    // 2A. Tek tıkla kaç adet verileceği (+1, +2, +3, +5)
    const multRow = document.getElementById('distroFastMultRow');
    if (multRow) {
      const mults = [1, 2, 3, 5];
      multRow.innerHTML = mults.map((m) =>
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

    // 0. Başka Ekibe Verilen sekmesi içindeki Birleşik Akıllı Çubuk (Hem Tek Cümle Hem Malzeme Arama)
    const dSentInp = document.getElementById('distroSentenceInput');
    const dSentPrev = document.getElementById('distroSentencePreview');
    const dSentCommit = document.getElementById('distroSentenceCommitBtn');
    const dVoiceBtn = document.getElementById('distroVoiceBtn');
    const dSugBox = document.getElementById('distroItemSuggest');

    const renderOmniSuggest = (raw) => {
      if (!dSugBox) return;
      const q = raw.trim().toLowerCase();
      // Sadece tekil malzeme araması gibi görünüyorsa öneri menüsü aç
      if (q.length < 2 || q.split(/\s+/).length > 3) {
        dSugBox.style.display = 'none';
        return;
      }
      const candidates = buildDistroSuggestCandidates()
        .filter((c) => `${c.name} ${c.category}`.toLowerCase().includes(q))
        .slice(0, 6);
      if (candidates.length === 0) {
        dSugBox.style.display = 'none';
        return;
      }
      const mult = dState.fastMult || 1;
      dSugBox.style.display = 'block';
      dSugBox.innerHTML = candidates.map((c, idx) => {
        const truckQty = findTruckTotalQty(c.name);
        const outQty = getOutCountForLoanName(c.name);
        const stockTxt = truckQty !== null ? `Kalan: ${truckQty - outQty}/${truckQty}` : c.category;
        return `
          <button type="button" class="pro-suggest-item" data-domni-idx="${idx}">
            <span class="pro-suggest-name">+${mult}× ${esc(c.name)} → ${esc(dState.selectedDept.split('/')[0].trim())}</span>
            <span class="pro-suggest-meta mono">${esc(stockTxt)}</span>
          </button>
        `;
      }).join('');
      dSugBox.querySelectorAll('[data-domni-idx]').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => {
          const picked = candidates[Number(btn.dataset.domniIdx)];
          if (!picked) return;
          addLoan(dState.selectedDept, picked.name, dState.fastMult || 1, '');
          if (dSentInp) dSentInp.value = '';
          if (dSentPrev) dSentPrev.style.display = 'none';
          dSugBox.style.display = 'none';
        });
      });
    };

    const updateInlineSentencePreview = () => {
      if (!dSentInp || !dSentPrev) return;
      const raw = dSentInp.value.trim();
      renderOmniSuggest(raw);
      if (!raw) {
        dSentPrev.style.display = 'none';
        dSentPrev.innerHTML = '';
        return;
      }
      const parsed = parseQuickLoanSentence(raw, dState.selectedDept);
      if (parsed.explicitDept) dState.selectedDept = parsed.dept;
      const dm = getDeptVisualMeta(parsed.dept);
      if (parsed.returnAllDept) {
        dSentPrev.style.display = 'flex';
        dSentPrev.innerHTML = `<span class="tag tag-safe mono">✓ İADE: ${dm.icon} ${esc(parsed.dept)} tüm malzemeler geri alınacak</span>`;
        return;
      }
      if (parsed.items.length === 0) {
        dSentPrev.style.display = 'block';
        dSentPrev.innerHTML = `<span style="color:var(--text-muted);">Birim: <strong>${dm.icon} ${esc(parsed.dept)}</strong> — malzeme adını yazmaya devam edin...</span>`;
        return;
      }
      dSentPrev.style.display = 'flex';
      dSentPrev.innerHTML = `
        <span class="tag ${parsed.isReturn ? 'tag-safe' : 'tag-brand'} mono">${parsed.isReturn ? '↩ İADE:' : ''} ${dm.icon} ${esc(parsed.dept)}</span>
        ${parsed.note ? `<span class="tag mono">📝 ${esc(parsed.note)}</span>` : ''}
        ${parsed.items.map((it) => `<span class="tag ${parsed.isReturn ? 'tag-caution' : 'tag-safe'} mono">${parsed.isReturn ? '✓' : '+'}${it.qty}× ${esc(it.name)}</span>`).join('')}
      `;
    };

    const commitInlineSentence = () => {
      if (!dSentInp) return;
      const raw = dSentInp.value.trim();
      if (!raw) return;
      const parsed = parseQuickLoanSentence(raw, dState.selectedDept);
      if (parsed.isReturn) {
        if (applyReturnFromSentence(parsed)) {
          dSentInp.value = '';
          if (dSentPrev) dSentPrev.style.display = 'none';
          if (dSugBox) dSugBox.style.display = 'none';
        }
        return;
      }
      if (parsed.items.length === 0) {
        toast('Malzeme algılanamadı — örn: prodüksiyon 1000 lik mizar türk kablo');
        return;
      }
      const mult = parsed.items.length === 1 && !/\d/.test(raw) ? (dState.fastMult || 1) : 1;
      for (const it of parsed.items) {
        addLoan(parsed.dept, it.name, it.qty * mult, parsed.note);
      }
      dSentInp.value = '';
      if (dSentPrev) {
        dSentPrev.style.display = 'none';
        dSentPrev.innerHTML = '';
      }
      if (dSugBox) dSugBox.style.display = 'none';
      toast(`${parsed.dept}: ${parsed.items.length} çeşit malzeme kaydedildi`);
    };

    if (dSentInp) {
      dSentInp.addEventListener('input', updateInlineSentencePreview);
      dSentInp.addEventListener('blur', () => {
        setTimeout(() => { if (dSugBox) dSugBox.style.display = 'none'; }, 160);
      });
      dSentInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitInlineSentence();
        }
      });
    }
    if (dSentCommit) {
      dSentCommit.addEventListener('click', commitInlineSentence);
    }
    if (dVoiceBtn && dSentInp) {
      bindVoiceDictation(dVoiceBtn, dSentInp, updateInlineSentencePreview);
    }

    // Global Hızlı Not / Çoklu Ekibe Verme Modalı
    bindQuickCaptureModal();
  }

  // ==================== SESLİ DİKTE & GLOBAL HIZLI SET NOTU MODALI ====================
  const qcState = {
    dept: 'Prodüksiyon',
    manualItems: [] // [{ name, qty }]
  };

  function bindVoiceDictation(btnEl, inputEl, onResultCallback) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      btnEl.addEventListener('click', () => {
        inputEl.focus();
        toast('Klavyedeki mikrofon tuşunu veya yazmayı kullanabilirsiniz');
      });
      return;
    }
    let rec = null;
    btnEl.addEventListener('click', () => {
      try {
        if (rec) {
          rec.stop();
          rec = null;
          btnEl.classList.remove('listening');
          return;
        }
        rec = new SpeechRec();
        rec.lang = 'tr-TR';
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        btnEl.classList.add('listening');
        toast('🎙️ Dinleniyor... (Ör: Prodüksiyon yemek için 1000 lik Mizar Türk kablo A100 ayak)');
        rec.onresult = (ev) => {
          const transcript = Array.from(ev.results).map((r) => r[0].transcript).join(' ');
          inputEl.value = transcript;
          if (onResultCallback) onResultCallback();
        };
        rec.onend = () => {
          btnEl.classList.remove('listening');
          rec = null;
        };
        rec.onerror = () => {
          btnEl.classList.remove('listening');
          rec = null;
        };
        rec.start();
      } catch (_) {
        btnEl.classList.remove('listening');
      }
    });
  }

  function getCombinedQcDraft() {
    const sentInp = document.getElementById('qcSentenceInput');
    const noteInp = document.getElementById('qcManualNoteInput');
    const raw = sentInp ? sentInp.value.trim() : '';
    const parsed = parseQuickLoanSentence(raw, qcState.dept);
    const finalDept = parsed.explicitDept ? parsed.dept : qcState.dept;
    const manualNote = noteInp ? noteInp.value.trim() : '';
    const finalNote = [parsed.note, manualNote].filter(Boolean).join(' · ');

    const combined = [];
    const mergeItem = (name, qty, source) => {
      const ex = combined.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (ex) ex.qty += qty;
      else combined.push({ name, qty, source });
    };
    for (const it of parsed.items) mergeItem(it.name, it.qty, 'sentence');
    for (const it of qcState.manualItems) mergeItem(it.name, it.qty, 'manual');

    return {
      dept: finalDept,
      explicitDept: parsed.explicitDept,
      isReturn: parsed.isReturn,
      returnAllDept: parsed.returnAllDept,
      note: finalNote,
      items: combined
    };
  }

  function renderQuickCaptureModal() {
    const draft = getCombinedQcDraft();
    qcState.dept = draft.dept;

    // 0. Dışarıda Olanlar Hızlı İade Şeridi
    const activeLoansBox = document.getElementById('qcActiveLoansStrip');
    if (activeLoansBox) {
      if (dState.loans.length === 0) {
        activeLoansBox.style.display = 'none';
        activeLoansBox.innerHTML = '';
      } else {
        activeLoansBox.style.display = 'block';
        activeLoansBox.innerHTML = `
          <div class="qc-aloans-head">
            <span>📤 ŞU AN DIŞARIDA OLANLAR (DOKUN → ✓ GELDİ)</span>
            <span class="mono">${getTotalOutCount()} adet</span>
          </div>
          <div class="qc-aloans-chips">
            ${dState.loans.slice(0, 10).map((l) => {
              const sDept = l.dept.split('/')[0].trim();
              return `<button type="button" class="qc-aloan-chip mono" data-qc-retloan="${l.id}" title="Tek tıkla geri alındı işaretle"><strong>${esc(sDept)}:</strong> ${l.qty}× ${esc(l.itemName)} <span class="qc-ret-check">✓ Geldi</span></button>`;
            }).join('')}
          </div>
        `;
        activeLoansBox.querySelectorAll('[data-qc-retloan]').forEach((b) => {
          b.addEventListener('click', () => {
            returnAllForLoan(b.dataset.qcRetloan);
            renderQuickCaptureModal();
          });
        });
      }
    }

    const deptGrid = document.getElementById('qcDeptGrid');
    if (deptGrid) {
      const depts = [
        'Prodüksiyon',
        'Kamera / DIT',
        'Ronin / Steadicam',
        'Reji / Monitör',
        'Ses',
        'Jeneratör',
        'Sanat',
        'Grip'
      ];
      deptGrid.innerHTML = depts.map((d) => {
        let sName = d.split('/')[0].trim();
        if (sName === 'Prodüksiyon') sName = 'Prodük.';
        const meta = getDeptVisualMeta(d);
        const isActive = draft.dept === d;
        return `
          <button type="button" class="distro-dept-btn ${meta.cls} ${isActive ? 'active' : ''}" data-qc-dept="${esc(d)}">
            <span class="dd-left"><span>${meta.icon}</span><span>${esc(sName)}</span></span>
          </button>
        `;
      }).join('');
      deptGrid.querySelectorAll('[data-qc-dept]').forEach((b) => {
        b.addEventListener('click', () => {
          qcState.dept = b.dataset.qcDept;
          renderQuickCaptureModal();
        });
      });
    }

    const itemsGrid = document.getElementById('qcItemsGrid');
    if (itemsGrid) {
      const countByLower = new Map();
      for (const it of draft.items) {
        countByLower.set(it.name.toLowerCase(), it.qty);
      }
      itemsGrid.innerHTML = DEFAULT_QUICK_ITEMS.slice(0, 15).map((q) => {
        const colCls = getQuickItemColorClass(q.name);
        const curQty = countByLower.get(q.name.toLowerCase()) || 0;
        return `
          <button type="button" class="qc-multi-chip ${colCls} ${curQty > 0 ? 'selected' : ''}" data-qc-additem="${esc(q.name)}">
            <span>+ ${esc(q.short || q.name)}</span>
            ${curQty > 0 ? `<span class="qc-chip-cnt mono">${curQty}×</span>` : ''}
          </button>
        `;
      }).join('');
      itemsGrid.querySelectorAll('[data-qc-additem]').forEach((b) => {
        b.addEventListener('click', () => {
          const name = b.dataset.qcAdditem;
          const ex = qcState.manualItems.find((x) => x.name.toLowerCase() === name.toLowerCase());
          if (ex) ex.qty += 1;
          else qcState.manualItems.push({ name, qty: 1 });
          renderQuickCaptureModal();
        });
      });
    }

    const prevBox = document.getElementById('qcPreviewBox');
    const commitBtn = document.getElementById('qcCommitBtn');
    const dm = getDeptVisualMeta(draft.dept);
    if (prevBox) {
      if (draft.items.length === 0) {
        prevBox.innerHTML = `
          <div style="font-size:12px; color:var(--text-muted); text-align:center; padding:4px 0;">
            Seçili Birim: <strong style="color:var(--text);">${dm.icon} ${esc(draft.dept)}</strong> — Yukarıya tek cümle yazın veya malzemelere dokunun.
          </div>
        `;
      } else {
        prevBox.innerHTML = `
          <div class="qc-prev-head">
            <span>Kaydedilecek: <strong>${dm.icon} ${esc(draft.dept)}</strong> ${draft.note ? `<span class="tag mono">📝 ${esc(draft.note)}</span>` : ''}</span>
            <span class="mono" style="font-size:11px; color:var(--safe); font-weight:800;">${draft.items.length} kalem</span>
          </div>
          <div class="qc-prev-pills">
            ${draft.items.map((it) => `
              <span class="qc-prev-pill mono">
                <strong>${it.qty}×</strong> ${esc(it.name)}
                <button type="button" class="qc-pill-rem" data-qc-rem="${esc(it.name)}" title="Çıkar">✕</button>
              </span>
            `).join('')}
          </div>
        `;
        prevBox.querySelectorAll('[data-qc-rem]').forEach((b) => {
          b.addEventListener('click', () => {
            const target = b.dataset.qcRem.toLowerCase();
            qcState.manualItems = qcState.manualItems.filter((x) => x.name.toLowerCase() !== target);
            const sentInp = document.getElementById('qcSentenceInput');
            if (sentInp && sentInp.value) {
              // Eğer cümleden geldiyse cümleyi temizle ve kalanları manualItems'a aktar
              const rest = draft.items.filter((x) => x.name.toLowerCase() !== target);
              sentInp.value = '';
              qcState.manualItems = rest.map((r) => ({ name: r.name, qty: r.qty }));
            }
            renderQuickCaptureModal();
          });
        });
      }
    }
    if (commitBtn) {
      if (draft.isReturn) {
        commitBtn.textContent = draft.returnAllDept
          ? `↩ ${draft.dept.split('/')[0].trim()} Tümünü Geri Al ve İşe Dön`
          : `↩ Geri Alındı İşaretle (${draft.items.length} Kalem) ve İşe Dön`;
      } else {
        commitBtn.textContent = draft.items.length > 0
          ? `✓ ${draft.dept.split('/')[0].trim()} İçin Kaydet (${draft.items.length} Kalem) ve İşe Dön`
          : '✓ Kaydet ve İşe Dön';
      }
    }
  }

  function openQuickCaptureModal() {
    const modal = document.getElementById('quickCaptureModal');
    if (!modal) return;
    modal.classList.add('open');
    renderQuickCaptureModal();
    const inp = document.getElementById('qcSentenceInput');
    if (inp) setTimeout(() => inp.focus(), 60);
  }

  function bindQuickCaptureModal() {
    ['openQuickCaptureTopBtn', 'openQuickCaptureSideBtn', 'openQuickCaptureTruckBtn', 'fabQuickCaptureBtn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', openQuickCaptureModal);
    });

    const sentInp = document.getElementById('qcSentenceInput');
    const noteInp = document.getElementById('qcManualNoteInput');
    const clearBtn = document.getElementById('qcClearDraftBtn');
    const commitBtn = document.getElementById('qcCommitBtn');
    const voiceBtn = document.getElementById('qcVoiceBtn');

    const commitQcDraft = () => {
      const draft = getCombinedQcDraft();
      if (draft.isReturn && (draft.returnAllDept || draft.items.length > 0)) {
        if (applyReturnFromSentence(draft)) {
          if (sentInp) sentInp.value = '';
          if (noteInp) noteInp.value = '';
          qcState.manualItems = [];
          const modal = document.getElementById('quickCaptureModal');
          if (modal) modal.classList.remove('open');
        }
        return;
      }
      if (draft.items.length === 0) {
        toast('Önce malzeme yazın veya listeden dokunun');
        return;
      }
      for (const it of draft.items) {
        addLoan(draft.dept, it.name, it.qty, draft.note);
      }
      if (sentInp) sentInp.value = '';
      if (noteInp) noteInp.value = '';
      qcState.manualItems = [];
      const modal = document.getElementById('quickCaptureModal');
      if (modal) modal.classList.remove('open');
      toast(`✓ ${draft.dept}: ${draft.items.map((x) => `${x.qty}× ${x.name}`).join(', ')} kaydedildi!`);
    };

    if (sentInp) {
      sentInp.addEventListener('input', renderQuickCaptureModal);
      sentInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitQcDraft();
        }
      });
    }
    if (noteInp) {
      noteInp.addEventListener('input', renderQuickCaptureModal);
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (sentInp) sentInp.value = '';
        if (noteInp) noteInp.value = '';
        qcState.manualItems = [];
        renderQuickCaptureModal();
      });
    }
    if (commitBtn) {
      commitBtn.addEventListener('click', commitQcDraft);
    }
    if (voiceBtn && sentInp) {
      bindVoiceDictation(voiceBtn, sentInp, renderQuickCaptureModal);
    }

    document.querySelectorAll('[data-qc-sample]').forEach((b) => {
      b.addEventListener('click', () => {
        if (sentInp) {
          sentInp.value = b.dataset.qcSample;
          renderQuickCaptureModal();
        }
      });
    });
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
