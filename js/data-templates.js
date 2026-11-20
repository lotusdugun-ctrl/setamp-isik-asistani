// Kamyon Envanter Şablonları ve Standart Sarf Malzemeleri (Modül 3 — Tek Fazlı 230V Set Standardı)
window.TRUCK_TEMPLATES = [
  {
    id: 'dizi-standart',
    name: 'Dizi Standart Işık Kamyonu',
    description: 'İç/dış mekan dizi setleri için dengeli ARRI + Aputure + Godox + Astera + 16A/32A/63A kablo paketi.',
    items: [
      // Lambalar
      { category: 'Lamba', name: 'ARRI M18 (1.8K HMI) + Balast', fixtureId: 'arri-m18', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'ARRI M40 (4K HMI) + Balast', fixtureId: 'arri-m40', qty: 1, status: 'pending', note: '' },
      { category: 'Lamba', name: 'ARRI SkyPanel S60-C', fixtureId: 'arri-skypanel-s60', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Aputure LS 1200d Pro', fixtureId: 'aputure-1200d-pro', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Aputure LS 600d Pro', fixtureId: 'aputure-600d-pro', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Godox KNOWLED M600Bi', fixtureId: 'godox-m600bi', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Godox KNOWLED MG1200Bi', fixtureId: 'godox-mg1200bi', qty: 1, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Astera Titan Tube (8\'li Kasa)', fixtureId: 'astera-titan-case', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Astera NYX Bulb (8\'li Kasa)', fixtureId: 'astera-nyx-case', qty: 1, status: 'pending', note: '' },
      // Kablolar & Dağıtım
      { category: 'Kablo', name: '16A Uzatma Kablo (20m - 3×2.5mm²)', cableId: '16a-mono', qty: 15, status: 'pending', note: '' },
      { category: 'Kablo', name: 'Türk Kablo (Üçlü Grup Priz - 5m)', cableId: 'turk-uclu', qty: 8, status: 'pending', note: '' },
      { category: 'Kablo', name: '32A Kablo (25m - 3×6mm²)', cableId: '32a-mono', qty: 6, status: 'pending', note: '' },
      { category: 'Kablo', name: '63A Kablo (25m - 3×16mm²)', cableId: '63a-mono', qty: 3, status: 'pending', note: '' },
      { category: 'Kablo', name: '63A -> 32A/16A Dağıtım Kutusu (Distro)', cableId: '63a-mono', qty: 1, status: 'pending', note: '' },
      { category: 'Kablo', name: '32A -> 16A Ara Distro Kutusu', cableId: '32a-mono', qty: 2, status: 'pending', note: '' },
      { category: 'Kablo', name: '32A -> 16A / 63A -> 32A Adaptör / Çevirici', cableId: '32a-mono', qty: 4, status: 'pending', note: '' },
      { category: 'Kablo', name: 'Kablo Yolu (Ramp / Yellow Jacket)', qty: 6, status: 'pending', note: '' },
      // Grip & Stand
      { category: 'Stand & Grip', name: 'C-Stand (40" + Kol + Grip Head)', qty: 14, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'Combo Stand (3 Kademeli)', qty: 6, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'Wind-Up / Crank Stand (M40/1200d)', qty: 2, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: '4x4 Floppy (Siyah Bayrak)', qty: 6, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: '8x8 Frame Seti (Full Grid / Ultra Bounce / Siyah)', qty: 1, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'Cardellini / Süper Klemp / Maşa Seti', qty: 12, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'Kum Torbası (10kg)', qty: 20, status: 'pending', note: '' }
    ]
  },
  {
    id: 'reklam-led',
    name: 'Reklam / Stüdyo Modern LED Paketi',
    description: 'Tamamen LED + CRMX/DMX ağırlıklı yüksek çıkışlı güncel reklam seti kamyonu.',
    items: [
      { category: 'Lamba', name: 'Aputure Electro Storm XT26', fixtureId: 'aputure-xt26', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Aputure STORM 1200x', fixtureId: 'aputure-storm-1200x', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Godox KNOWLED MG2400Bi', fixtureId: 'godox-mg2400bi', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Creamsource Vortex8', fixtureId: 'creamsource-vortex8', qty: 4, status: 'pending', note: '' },
      { category: 'Lamba', name: 'ARRI SkyPanel X21', fixtureId: 'arri-skypanel-x21', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Godox KNOWLED F800R (8x4 Mat)', fixtureId: 'godox-f800r', qty: 1, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Astera Titan Tube (8\'li Kasa)', fixtureId: 'astera-titan-case', qty: 2, status: 'pending', note: '' },
      { category: 'Kablo', name: '16A Uzatma Kablo (20m - 3×2.5mm²)', cableId: '16a-mono', qty: 16, status: 'pending', note: '' },
      { category: 'Kablo', name: '32A Kablo (25m - 3×6mm²)', cableId: '32a-mono', qty: 6, status: 'pending', note: '' },
      { category: 'Kablo', name: '63A Kablo (25m - 3×16mm²)', cableId: '63a-mono', qty: 3, status: 'pending', note: '' },
      { category: 'Kablo', name: '63A -> 32A/16A Distro Kutusu', cableId: '63a-mono', qty: 2, status: 'pending', note: '' },
      { category: 'Kablo', name: '5-Pin DMX Kablosu (10m/20m) + CRMX TX', qty: 10, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'C-Stand (40")', qty: 16, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'High Roller / Combo Stand', qty: 8, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: '12x12 Frame Seti (1/2 Grid + Ultrabounce + Bleached)', qty: 1, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: '4x4 Floppy & Diff Frame', qty: 8, status: 'pending', note: '' }
    ]
  },
  {
    id: 'sinema-buyuk',
    name: 'Büyük Sinema HMI + LED Kamyonu',
    description: 'Büyük dış çekim ve gece sahneleri için M90/M40/Evoke 2400B + 125A/63A/32A ağır hat paketi.',
    items: [
      { category: 'Lamba', name: 'ARRI M90 (9K HMI) + Balast', fixtureId: 'arri-m90', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'ARRI M40 (4K HMI) + Balast', fixtureId: 'arri-m40', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'ARRI M18 (1.8K HMI) + Balast', fixtureId: 'arri-m18', qty: 3, status: 'pending', note: '' },
      { category: 'Lamba', name: 'ARRI SkyPanel S360-C', fixtureId: 'arri-skypanel-s360', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Nanlux Evoke 2400B', fixtureId: 'nanlux-evoke-2400b', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'ARRI True Blue T5 (5K Tungsten)', fixtureId: 'arri-t5', qty: 2, status: 'pending', note: '' },
      { category: 'Lamba', name: 'Astera Titan Tube (8\'li Kasa)', fixtureId: 'astera-titan-case', qty: 3, status: 'pending', note: '' },
      { category: 'Kablo', name: '125A Ana Kablo (25m - 3×35mm²)', cableId: '125a-mono', qty: 4, status: 'pending', note: '' },
      { category: 'Kablo', name: '125A -> 63A/32A Ana Distro Kutusu', cableId: '125a-mono', qty: 1, status: 'pending', note: '' },
      { category: 'Kablo', name: '63A Kablo (25m - 3×16mm²)', cableId: '63a-mono', qty: 6, status: 'pending', note: '' },
      { category: 'Kablo', name: '32A Kablo (25m - 3×6mm²)', cableId: '32a-mono', qty: 6, status: 'pending', note: '' },
      { category: 'Kablo', name: '16A Uzatma Kablo (20m - 3×2.5mm²)', cableId: '16a-mono', qty: 24, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'Mombo Combo / Crank Stand (M90/S360)', qty: 4, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: '20x20 Frame Seti (Full Grid / Siyah / Unbleached)', qty: 1, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: '12x12 Frame Seti', qty: 2, status: 'pending', note: '' },
      { category: 'Stand & Grip', name: 'C-Stand (40")', qty: 20, status: 'pending', note: '' }
    ]
  }
];

window.DEFAULT_EXPENDABLES = [
  { id: 'exp-gaffer-siyah', name: 'Siyah Gaffer Bant (50mm)', category: 'Bant', unit: 'Rulo', qty: 6, minQty: 2 },
  { id: 'exp-gaffer-beyaz', name: 'Beyaz / Gri Gaffer Bant', category: 'Bant', unit: 'Rulo', qty: 3, minQty: 1 },
  { id: 'exp-izole', name: 'Elektrik İzole Bant (Siyah/Renkli)', category: 'Bant', unit: 'Rulo', qty: 8, minQty: 3 },
  { id: 'exp-blackwrap', name: 'Blackwrap (Siyah Folyo 60cm)', category: 'Kontrol', unit: 'Rulo', qty: 2, minQty: 1 },
  { id: 'exp-216', name: 'Lee 216 White Diffusion (Full)', category: 'Difüzyon', unit: 'Metre', qty: 7, minQty: 3 },
  { id: 'exp-250', name: 'Lee 250 Half White Diffusion', category: 'Difüzyon', unit: 'Metre', qty: 5, minQty: 3 },
  { id: 'exp-251', name: 'Lee 251 Quarter White Diffusion', category: 'Difüzyon', unit: 'Metre', qty: 6, minQty: 2 },
  { id: 'exp-opal', name: 'Lee 410 Opal Frost', category: 'Difüzyon', unit: 'Metre', qty: 4, minQty: 2 },
  { id: 'exp-cto-full', name: 'Full CTO (Lee 204)', category: 'Renk Jelatini', unit: 'Metre', qty: 5, minQty: 2 },
  { id: 'exp-cto-half', name: '1/2 & 1/4 CTO (Lee 205/206)', category: 'Renk Jelatini', unit: 'Metre', qty: 4, minQty: 2 },
  { id: 'exp-ctb', name: 'Full / 1/2 CTB (Lee 201/202)', category: 'Renk Jelatini', unit: 'Metre', qty: 3, minQty: 2 },
  { id: 'exp-plus-minus-g', name: 'Plus / Minus Green (1/4 - 1/2)', category: 'Renk Jelatini', unit: 'Metre', qty: 2, minQty: 2 },
  { id: 'exp-mandal', name: 'Tahta Mandal (C47)', category: 'Aksesuar', unit: 'Paket', qty: 3, minQty: 1 },
  { id: 'exp-kablo-bagi', name: 'Kablo Bağı / Cırt Kelepçe (Siyah)', category: 'Aksesuar', unit: 'Paket', qty: 2, minQty: 1 },
  { id: 'exp-eldiven', name: 'Isı Korumalı Işıkçı Eldiveni', category: 'Güvenlik', unit: 'Çift', qty: 2, minQty: 1 }
];
