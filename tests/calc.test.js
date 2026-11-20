const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/data-cables.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/data-fixtures.js'), 'utf8'), sandbox);

const cables = sandbox.window.SET_CABLES;
const fixtures = sandbox.window.SET_FIXTURES;
const cableMap = Object.fromEntries(cables.map((c) => [c.id, c]));
const fixtureMap = Object.fromEntries(fixtures.map((f) => [f.id, f]));

const calc = require('../js/calc.js');

console.log('Testler başlatılıyor...');

// 0. 5 adet tek fazlı Türkiye set kablosu olduğunu doğrula (Türk Kablo Üçlü + 16A, 32A, 63A, 125A)
assert.strictEqual(cables.length, 5, '5 adet tek fazlı kablo (Türk Üçlü, 16A, 32A, 63A, 125A) olmalı');
assert.ok(cables.every((c) => c.phases === 1), 'Tüm kablolar tek fazlı (230V) olmalı');

// 0b. Türk Kablo (Üçlü Grup Priz) testleri: Güvenli 10A (2.30 kW), 12.8A üstü DANGER, HMI uyarısı
{
  const turk = cableMap['turk-uclu'];
  const p = calc.calcCablePower(turk);
  assert.strictEqual(p.safeAmpsPerPhase, 10, 'Türk kablo sürekli güvenli limit 10A olmalı');
  assert.strictEqual(p.safeTotalKWText, '2.30 kW');

  // 3× Aputure 600d Pro (~9.9A) -> SAFE, 4× (~13.2A) -> DANGER
  const s3 = calc.evaluateLineLoad(turk, [{ fixtureId: 'aputure-600d-pro', qty: 3, phase: 0 }], fixtureMap, {}, cables);
  const s4 = calc.evaluateLineLoad(turk, [{ fixtureId: 'aputure-600d-pro', qty: 4, phase: 0 }], fixtureMap, {}, cables);
  assert.strictEqual(s3.status, 'SAFE');
  assert.strictEqual(s4.status, 'DANGER');
  assert.strictEqual(s4.recommendedCable.id, '32a-mono');

  // 2× Aputure 1200d Pro (~13.2A) -> DANGER
  const d2 = calc.evaluateLineLoad(turk, [{ fixtureId: 'aputure-1200d-pro', qty: 2, phase: 0 }], fixtureMap, {}, cables);
  assert.strictEqual(d2.status, 'DANGER');

  // 1× ARRI M18 (HMI) Türk kabloda HMI balast uyarısıyla CAUTION ve 16A set kablosu önerisi
  const hmiOnTurk = calc.evaluateLineLoad(turk, [{ fixtureId: 'arri-m18', qty: 1, phase: 0 }], fixtureMap, {}, cables);
  assert.strictEqual(hmiOnTurk.status, 'CAUTION');
  assert.strictEqual(hmiOnTurk.recommendedCable.id, '16a-mono');
}

// 1. ARRI M18 16A'da tek başına SAFE, 2 adet DANGER
{
  const c16 = cableMap['16a-mono'];
  const m18 = fixtureMap['arri-m18'];
  const maxInfo = calc.calcMaxUnitsForCable(c16, m18);
  assert.strictEqual(maxInfo.compatible, true);
  assert.strictEqual(maxInfo.maxSafeTotal, 1, '16A hatta güvenli max 1 adet M18 olmalı');

  const res1 = calc.evaluateLineLoad(c16, [{ fixtureId: 'arri-m18', qty: 1, phase: 0 }], fixtureMap, {}, cables);
  assert.strictEqual(res1.status, 'SAFE');

  const res2 = calc.evaluateLineLoad(c16, [{ fixtureId: 'arri-m18', qty: 2, phase: 0 }], fixtureMap, {}, cables);
  assert.strictEqual(res2.status, 'DANGER');
  assert.strictEqual(res2.recommendedCable.id, '32a-mono', '2× M18 için 32A kablo önerilmeli');
}

// 2. ARRI M40 -> 16A'da ÇALIŞMAZ, 32A'da 1 adet SAFE, 63A'da 2 adet SAFE, 125A'da 4 adet SAFE
{
  const m40 = fixtureMap['arri-m40'];
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['16a-mono'], m40).compatible, false);
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['32a-mono'], m40).maxSafeTotal, 1);
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['63a-mono'], m40).maxSafeTotal, 2);
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['125a-mono'], m40).maxSafeTotal, 4);
}

// 3. ARRI M90 (44.9A) -> 32A'da ÇALIŞMAZ, 63A'da 1 adet SAFE, 125A'da 2 adet SAFE
{
  const m90 = fixtureMap['arri-m90'];
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['32a-mono'], m90).compatible, false);
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['63a-mono'], m90).maxSafeTotal, 1);
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['125a-mono'], m90).maxSafeTotal, 2);
}

// 4. ARRIMAX 18K (89.2A) -> 63A'da ÇALIŞMAZ, 125A'da 1 adet SAFE
{
  const k18 = fixtureMap['arri-18k'];
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['63a-mono'], k18).compatible, false);
  assert.strictEqual(calc.calcMaxUnitsForCable(cableMap['125a-mono'], k18).maxSafeTotal, 1);
}

// 5. Aputure Electro Storm XT26 (3200W ~14.5A) 16A'da SINIRDA (CAUTION), 32A'da SAFE
{
  const xt26 = fixtureMap['aputure-xt26'];
  const max16 = calc.calcMaxUnitsForCable(cableMap['16a-mono'], xt26);
  assert.strictEqual(max16.compatible, true);
  assert.strictEqual(max16.maxSafeTotal, 0);
  assert.strictEqual(max16.maxCautionTotal, 1);
  assert.strictEqual(max16.level, 'CAUTION');

  assert.strictEqual(calc.evaluateLineLoad(cableMap['16a-mono'], [{ fixtureId: 'aputure-xt26', qty: 1, phase: 0 }], fixtureMap, {}, cables).status, 'CAUTION');
  assert.strictEqual(calc.evaluateLineLoad(cableMap['32a-mono'], [{ fixtureId: 'aputure-xt26', qty: 1, phase: 0 }], fixtureMap, {}, cables).status, 'SAFE');
}

// 6. Godox KNOWLED M600Bi (730W ~3.34A) -> 16A'da 3 adet SAFE, 4 adet CAUTION, 5 adet DANGER
{
  const c16 = cableMap['16a-mono'];
  assert.strictEqual(calc.calcMaxUnitsForCable(c16, fixtureMap['godox-m600bi']).maxSafeTotal, 3);
  assert.strictEqual(calc.evaluateLineLoad(c16, [{ fixtureId: 'godox-m600bi', qty: 3, phase: 0 }], fixtureMap, {}, cables).status, 'SAFE');
  assert.strictEqual(calc.evaluateLineLoad(c16, [{ fixtureId: 'godox-m600bi', qty: 4, phase: 0 }], fixtureMap, {}, cables).status, 'CAUTION');
  assert.strictEqual(calc.evaluateLineLoad(c16, [{ fixtureId: 'godox-m600bi', qty: 5, phase: 0 }], fixtureMap, {}, cables).status, 'DANGER');
}

// 7. Uzun ince kabloda voltaj düşümü uyarısı (100m 1.5mm² kablo ile 1× M18 -> DANGER)
{
  const resDrop = calc.evaluateLineLoad(
    cableMap['16a-mono'],
    [{ fixtureId: 'arri-m18', qty: 1, phase: 0 }],
    fixtureMap,
    { lengthMeters: 100, crossSection: 1.5 },
    cables
  );
  assert.strictEqual(resDrop.status, 'DANGER');
  assert.ok(resDrop.voltageDropPercent > 8);
}

console.log('✅ Tüm tek fazlı elektrik, kW ve kablo kapasite testleri başarıyla geçti! (' + fixtures.length + ' lamba, ' + cables.length + ' kablo doğrulandı)');
