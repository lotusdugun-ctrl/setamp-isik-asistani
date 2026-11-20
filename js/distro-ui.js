// SetAmp — Diğer Birimlere Dağıtılan Kablo & Aksesuar Takibi (Toplam / Birim Bazlı Zimmet)
(function () {
  const DISTRO_STORAGE_KEY = 'setamp_dept_loans_v1';

  const DEPARTMENTS = [
    'Kamera / DIT',
    'Reji / Monitör',
    'Ses',
    'Sanat',
    'Makyaj / Saç',
    'Kostüm',
    'Prodüksiyon',
    'Grip / Diğer'
  ];

  const QUICK_ITEMS = [
    { name: '16A Uzatma Kablo (20m)', match: '16a uzatma' },
    { name: 'Türk Kablo (Üçlü Priz)', match: 'türk kablo' },
    { name: '32A Kablo', match: '32a kablo' },
    { name: '63A Kablo', match: '63a kablo' },
    { name: 'C-Stand', match: 'c-stand' },
    { name: 'Kum Torbası', match: 'kum torbası' },
    { name: 'Cardellini / Klemp', match: 'cardellini' },
    { name: '4x4 Floppy', match: 'floppy' }
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

  function loadLoans() {
    try {
      const raw = localStorage.getItem(DISTRO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {
      // ignore
    }
    return [];
  }

  const dState = {
    loans: loadLoans(), // [{ id, dept, itemName, qty, note, time }]
    selectedDept: 'Kamera / DIT',
    selectedItemName: '16A Uzatma Kablo (20m)',
    filterDept: 'Tümü',
    viewMode: 'byItem' // 'byItem' (Toplam & Hangi Birimde) | 'byDept' (Birime Göre Liste)
  };

  function saveLoans() {
    try {
      localStorage.setItem(DISTRO_STORAGE_KEY, JSON.stringify(dState.loans));
    } catch (_) {
      // ignore
    }
  }

  function toast(msg) {
    if (window.SetAppToast) window.SetAppToast(msg);
  }

  function getTruckInventory() {
    return typeof window.SetAppGetTruckItems === 'function' ? window.SetAppGetTruckItems() : [];
  }

  /**
   * Kamyon envanterinden ilgili ekipmanın toplam stok sayısını bulur (varsa)
   */
  function findTruckTotalQty(itemName) {
    const inv = getTruckInventory();
    const norm = itemName.trim().toLowerCase();
    // Önce birebir eşleşme
    let exact = inv.find((i) => i.name.trim().toLowerCase() === norm);
    if (exact) return Number(exact.qty) || 0;
    // Sonra anahtar kelime eşleşmesi (ör. "16A Uzatma Kablo (20m)" <-> "16A Uzatma Kablo (20m - 3×2.5mm²)")
    const q = QUICK_ITEMS.find((qi) => qi.name.toLowerCase() === norm);
    const key = q ? q.match : norm.split('(')[0].trim();
    if (!key) return null;
    const matches = inv.filter((i) => i.name.toLowerCase().includes(key));
    if (matches.length === 0) return null;
    return matches.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
  }

  function addLoan(dept, itemName, qty, note = '') {
    const cleanItem = String(itemName || '').trim();
    const cleanNote = String(note || '').trim();
    const addQty = Math.max(1, Number(qty) || 1);
    if (!cleanItem) return;

    // Aynı birim + aynı malzeme + aynı not varsa üstüne ekle
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
    saveLoans();
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
    saveLoans();
    renderDistroPanel();
    if (window.SetAppRefreshBadges) window.SetAppRefreshBadges();
  }

  function returnAllForLoan(loanId) {
    const idx = dState.loans.findIndex((l) => l.id === loanId);
    if (idx === -1) return;
    const item = dState.loans[idx];
    dState.loans.splice(idx, 1);
    saveLoans();
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

    // 1. Malzeme bazlı toplam özet
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

    // 2. Birim bazlı toplama listesi
    lines.push(``);
    lines.push(`BİRİMLERDEN TOPLANACAKLAR:`);
    for (const dept of DEPARTMENTS) {
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

    // 1. Hızlı Dağıtım Formu (Birim + Hızlı Malzeme seçiciler)
    const deptPicker = document.getElementById('distroDeptPicker');
    if (deptPicker) {
      deptPicker.innerHTML = DEPARTMENTS.map((d) =>
        `<button type="button" class="brand-btn ${dState.selectedDept === d ? 'active' : ''}" data-pick-dept="${esc(d)}">${esc(d)}</button>`
      ).join('');
      deptPicker.querySelectorAll('[data-pick-dept]').forEach((b) => {
        b.addEventListener('click', () => {
          dState.selectedDept = b.dataset.pickDept;
          renderDistroPanel();
        });
      });
    }

    const itemPicker = document.getElementById('distroQuickItemPicker');
    if (itemPicker) {
      itemPicker.innerHTML = QUICK_ITEMS.map((q) =>
        `<button type="button" class="len-chip ${dState.selectedItemName === q.name ? 'active' : ''}" data-pick-item="${esc(q.name)}">${esc(q.name)}</button>`
      ).join('');
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

    // 2. Birim Filtre Özet Çubuğu
    const deptCounts = {};
    for (const d of DEPARTMENTS) deptCounts[d] = 0;
    for (const l of dState.loans) {
      deptCounts[l.dept] = (deptCounts[l.dept] || 0) + l.qty;
    }

    const filterRow = document.getElementById('distroDeptFilterRow');
    if (filterRow) {
      const filters = ['Tümü', ...DEPARTMENTS.filter((d) => deptCounts[d] > 0)];
      if (!filters.includes(dState.filterDept)) dState.filterDept = 'Tümü';
      filterRow.innerHTML = filters.map((f) => {
        const cnt = f === 'Tümü' ? outCount : deptCounts[f];
        return `<button class="brand-btn ${dState.filterDept === f ? 'active' : ''}" data-fdept="${esc(f)}"><span>${esc(f)}</span><span class="brand-cnt">${cnt}</span></button>`;
      }).join('');
      filterRow.querySelectorAll('[data-fdept]').forEach((b) => {
        b.addEventListener('click', () => {
          dState.filterDept = b.dataset.fdept;
          renderDistroPanel();
        });
      });
    }

    // Görünüm modu butonları
    document.querySelectorAll('[data-dview]').forEach((b) => {
      b.classList.toggle('active', b.dataset.dview === dState.viewMode);
    });

    // 3. Liste Alanı (Malzeme Bazlı Özet VEYA Birim Bazlı Detay)
    const listContainer = document.getElementById('distroSummaryList');
    if (!listContainer) return;

    const visibleLoans = dState.loans.filter((l) => dState.filterDept === 'Tümü' || l.dept === dState.filterDept);

    if (visibleLoans.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-box">
          Şu an diğer birimlere dağıtılmış ekipman görünmüyor. Yukarıdan birim ve kablo/aksesuar seçip <strong>Ver</strong> diyerek saniyeler içinde kayıt tutabilirsin.
        </div>
      `;
      return;
    }

    if (dState.viewMode === 'byItem') {
      // Malzeme bazlı toplama: Toplam Kamyon Stoğu | Dışarıda | Kamyonda Kalan | Hangi Birimde Kaç Adet
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
      // Birim bazlı görünüm: Paydosta birim birim dolaşıp toplama listesi
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
        saveLoans();
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
