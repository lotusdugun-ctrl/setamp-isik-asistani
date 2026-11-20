// SetAmp — Diğer Birimlere Dağıtılan Kablo & Aksesuar Takibi (Genişletilmiş Set Birimleri + Özel Birim/Malzeme + Kamyon Stok Eşleştirme)
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
    { name: '16A Uzatma Kablo (20m)', matches: ['16a uzatma', '16a monofaze uzatma', 'stinger'] },
    { name: 'Türk Kablo (Üçlü Priz)', matches: ['türk kablo', 'üçlü', "3'lü", 'çoklu priz', 'örümcek'] },
    { name: 'Kablo Yolu (Ramp)', matches: ['kablo yolu', 'ramp', 'yellow jacket'] },
    { name: '32A Kablo', matches: ['32a kablo', '32a monofaze', '32a trifaze'] },
    { name: '63A Kablo', matches: ['63a kablo', '63a trifaze'] },
    { name: '125A Ana Kablo', matches: ['125a ana kablo', '125a kablo', '125a trifaze'] },
    { name: 'Distro Kutusu', matches: ['distro'] },
    { name: 'Adaptör / Çevirici', matches: ['adaptör', 'çevirici'] },
    { name: 'C-Stand', matches: ['c-stand'] },
    { name: 'Combo Stand', matches: ['combo stand'] },
    { name: 'Kum Torbası', matches: ['kum torbası'] },
    { name: 'Cardellini / Klemp', matches: ['cardellini', 'klemp', 'maşa'] },
    { name: '4x4 Floppy', matches: ['floppy'] },
    { name: 'DMX Kablosu', matches: ['dmx'] }
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
      // v1'den eski zimmet kayıtlarını kayıpsız taşı
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
    loans: saved.loans, // [{ id, dept, itemName, qty, note, time }]
    customDepts: saved.customDepts,
    customItems: saved.customItems,
    selectedDept: 'Kamera / DIT',
    selectedItemName: '16A Uzatma Kablo (20m)',
    filterDept: 'Tümü',
    viewMode: 'byItem',
    addingDept: false
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
        list.push({ name: ci, matches: [ci.toLowerCase()] });
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

  /**
   * Kamyon envanterinden ilgili ekipmanın toplam stok sayısını bulur (eski ve yeni şablon isimleriyle uyumlu)
   */
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
      if (n.includes('distro') && !norm.includes('distro')) return false;
      if (n.includes('adaptör') && !norm.includes('adaptör') && !norm.includes('çevirici')) return false;
      if (n.includes('kablo yolu') && !norm.includes('kablo yolu') && !norm.includes('ramp')) return false;
      return keys.some((k) => n.includes(k));
    });
    if (matches.length === 0) return null;
    return matches.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
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
    toast(`Yeni birim eklendi: ${clean}`);
  }

  function addLoan(dept, itemName, qty, note = '') {
    const cleanItem = String(itemName || '').trim();
    const cleanNote = String(note || '').trim();
    const addQty = Math.max(1, Number(qty) || 1);
    if (!cleanItem) return;

    // Yeni yazılan malzemeyi hızlı seçim listesine hatırla
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
    toast(`Tamamı geri alındı: ${item.qty}× ${item.itemName} (${item.dept})`);
  }

  function getTotalOutCount() {
    return dState.loans.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
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

    // 1. Birim Seçici (Tüm set birimleri + "+ Yeni Birim" butonu)
    const deptPicker = document.getElementById('distroDeptPicker');
    if (deptPicker) {
      deptPicker.innerHTML = allDepts.map((d) => {
        const cnt = deptCounts[d] || 0;
        return `<button type="button" class="brand-btn ${dState.selectedDept === d ? 'active' : ''}" data-pick-dept="${esc(d)}"><span>${esc(d)}</span>${cnt > 0 ? `<span class="brand-cnt">${cnt}</span>` : ''}</button>`;
      }).join('') + `<button type="button" class="brand-btn" id="distroToggleNewDeptBtn" style="border-style:dashed;">+ Yeni Birim</button>`;

      deptPicker.querySelectorAll('[data-pick-dept]').forEach((b) => {
        b.addEventListener('click', () => {
          dState.selectedDept = b.dataset.pickDept;
          renderDistroPanel();
        });
      });

      const newDeptBtn = document.getElementById('distroToggleNewDeptBtn');
      if (newDeptBtn) {
        newDeptBtn.addEventListener('click', () => {
          dState.addingDept = !dState.addingDept;
          renderDistroPanel();
          if (dState.addingDept) {
            const inp = document.getElementById('distroNewDeptInput');
            if (inp) inp.focus();
          }
        });
      }
    }

    const newDeptWrap = document.getElementById('distroNewDeptWrap');
    if (newDeptWrap) {
      newDeptWrap.style.display = dState.addingDept ? 'flex' : 'none';
    }

    // 2. Hızlı Malzeme Butonları (Kablo Yolu, Distro, Adaptör, 16A–125A, Türk Kablo, Stand/Grip + Özel)
    const itemPicker = document.getElementById('distroQuickItemPicker');
    if (itemPicker) {
      itemPicker.innerHTML = getAllQuickItems().map((q) => {
        const stock = findTruckTotalQty(q.name);
        return `<button type="button" class="len-chip ${dState.selectedItemName === q.name ? 'active' : ''}" data-pick-item="${esc(q.name)}">${esc(q.name)}${stock !== null ? ` (${stock})` : ''}</button>`;
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

    // Kamyon envanterindeki TÜM malzemelerden doğrudan seçme menüsü
    const invSelect = document.getElementById('distroFromTruckSelect');
    if (invSelect) {
      const inv = getTruckInventory();
      invSelect.innerHTML = `<option value="">Kamyon envanterinden seç (${inv.length} kalem)...</option>` +
        inv.map((it) => `<option value="${esc(it.name)}">[${esc(it.category)}] ${esc(it.name)} (${it.qty} adet)</option>`).join('');
    }

    const customInp = document.getElementById('distroCustomItemInput');
    if (customInp && !customInp.value) {
      customInp.value = dState.selectedItemName;
    }

    // 3. Aktif Dışarıdaki Birim Filtre Çubuğu
    const filterRow = document.getElementById('distroDeptFilterRow');
    if (filterRow) {
      const activeDepts = allDepts.filter((d) => (deptCounts[d] || 0) > 0);
      const filters = ['Tümü', ...activeDepts];
      if (!filters.includes(dState.filterDept)) dState.filterDept = 'Tümü';
      filterRow.innerHTML = filters.map((f) => {
        const cnt = f === 'Tümü' ? outCount : (deptCounts[f] || 0);
        return `<button class="brand-btn ${dState.filterDept === f ? 'active' : ''}" data-fdept="${esc(f)}"><span>${esc(f)}</span><span class="brand-cnt">${cnt}</span></button>`;
      }).join('');
      filterRow.querySelectorAll('[data-fdept]').forEach((b) => {
        b.addEventListener('click', () => {
          dState.filterDept = b.dataset.fdept;
          renderDistroPanel();
        });
      });
    }

    document.querySelectorAll('[data-dview]').forEach((b) => {
      b.classList.toggle('active', b.dataset.dview === dState.viewMode);
    });

    // 4. Liste Alanı (Malzemeye Göre veya Birime Göre)
    const listContainer = document.getElementById('distroSummaryList');
    if (!listContainer) return;

    const visibleLoans = dState.loans.filter((l) => dState.filterDept === 'Tümü' || l.dept === dState.filterDept);

    if (visibleLoans.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-box">
          Şu an diğer birimlerde bekleyen ekipman yok. Yukarıdan birim (Ronin, Prodüksiyon, Jeneratör vb.) ve malzeme (Kablo Yolu, Üçlü Priz, Uzatma vb.) seçip <strong>Ver</strong> diyebilirsin.
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
          : `<span class="tag tag-caution mono">Dışarıda: ${g.totalOut} adet</span>`;

        const rows = g.entries.map((l) => `
          <div class="distro-entry-row">
            <div style="flex:1; min-width:140px;">
              <strong style="font-size:13px;">${esc(l.dept)}</strong>
              <span class="mono" style="font-size:11px; color:var(--text-dim); margin-left:6px;">${l.time}</span>
              ${l.note ? `<div style="font-size:11.5px; color:var(--text-muted);">${esc(l.note)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <div class="stepper">
                <button data-ln-dec="${l.id}" title="1 adet geri geldi">−</button>
                <span class="mono">${l.qty}</span>
                <button data-ln-inc="${l.id}" title="1 adet daha verildi">+</button>
              </div>
              <button class="st-pill active-ok" data-ln-ret="${l.id}" title="Hepsi geri geldi">Geldi</button>
            </div>
          </div>
        `).join('');

        return `
          <div class="distro-group-card ${overStock ? 'over-stock' : ''}">
            <div class="distro-group-head">
              <div style="font-weight:700; font-size:14px;">${esc(itemName)}</div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">${stockBadges}</div>
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
        const rows = entries.map((l) => `
          <div class="distro-entry-row">
            <div style="flex:1; min-width:140px;">
              <strong style="font-size:13px;">${esc(l.itemName)}</strong>
              <span class="mono" style="font-size:11px; color:var(--text-dim); margin-left:6px;">${l.time}</span>
              ${l.note ? `<div style="font-size:11.5px; color:var(--text-muted);">${esc(l.note)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <div class="stepper">
                <button data-ln-dec="${l.id}">−</button>
                <span class="mono">${l.qty}</span>
                <button data-ln-inc="${l.id}">+</button>
              </div>
              <button class="st-pill active-ok" data-ln-ret="${l.id}">Geldi</button>
            </div>
          </div>
        `).join('');

        return `
          <div class="distro-group-card">
            <div class="distro-group-head">
              <div style="font-weight:700; font-size:14px;">${esc(dept)}</div>
              <span class="tag tag-caution mono">Toplam ${sum} adet dışarıda</span>
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
  }

  function bindDistroEvents() {
    const form = document.getElementById('distroAddForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemInp = document.getElementById('distroCustomItemInput');
        const qtyInp = document.getElementById('distroQtyInput');
        const noteInp = document.getElementById('distroNoteInput');
        const name = itemInp ? itemInp.value.trim() : dState.selectedItemName;
        const qty = qtyInp ? Number(qtyInp.value) : 1;
        const note = noteInp ? noteInp.value.trim() : '';
        if (!name) return;
        addLoan(dState.selectedDept, name, qty, note);
        if (qtyInp) qtyInp.value = '1';
        if (noteInp) noteInp.value = '';
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

    const invSelect = document.getElementById('distroFromTruckSelect');
    if (invSelect) {
      invSelect.addEventListener('change', (e) => {
        if (!e.target.value) return;
        dState.selectedItemName = e.target.value;
        const inp = document.getElementById('distroCustomItemInput');
        if (inp) inp.value = e.target.value;
        e.target.value = '';
        renderDistroPanel();
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
        toast('Tüm birim zimmetleri teslim alındı olarak temizlendi');
      });
    }
  }

  window.SetDistroUI = {
    init() {
      bindDistroEvents();
      renderDistroPanel();
    },
    render: renderDistroPanel,
    getTotalOutCount
  };
})();
