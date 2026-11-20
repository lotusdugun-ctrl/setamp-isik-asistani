const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'js/app.js'), 'utf8');
const solarUiJs = fs.readFileSync(path.join(rootDir, 'js/solar-ui.js'), 'utf8');
const distroUiJs = fs.readFileSync(path.join(rootDir, 'js/distro-ui.js'), 'utf8');

// 1. Tüm getElementById çağrılarının index.html içinde karşılığı olduğunu doğrula
const ids = [...(appJs + '\n' + solarUiJs + '\n' + distroUiJs).matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
const dynamicIds = new Set([
  'bannerRebalanceBtn',
  'bannerUpgradeBtn',
  'toggleCableSettingsBtn',
  'cableLengthInput',
  'cableSectionSelect',
  'cableSettingsPanel',
  'ctApproachStart',
  'ctApproachHalf',
  'ctEnterCloud',
  'ctCloudHalf',
  'ctExitCloud',
  'ctReset',
  'ctClearHist',
  'fetchWeatherBtnInline'
]);
const missingIds = [...new Set(ids)].filter((id) => !dynamicIds.has(id) && !html.includes(`id="${id}"`));
assert.strictEqual(missingIds.length, 0, `Eksik HTML ID'leri bulundu: ${missingIds.join(', ')}`);
console.log(`✅ DOM ID bütünlüğü doğrulandı (${new Set(ids).size} benzersiz ID eşleşti).`);

// 2. index.html içindeki tüm yerel referansların diskte var olduğunu doğrula
const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1].split('?')[0]);
for (const ref of refs) {
  const full = path.join(rootDir, ref.slice(2));
  assert.ok(fs.existsSync(full), `Eksik dosya referansı: ${ref}`);
}
console.log(`✅ Tüm HTML dosya referansları diskte doğrulandı (${refs.length} dosya).`);

// 3. Tüm lamba görsellerinin (JPG & SVG) diskte var olduğunu doğrula
const imgPaths = [...appJs.matchAll(/['"](\.\/assets\/lamps\/[^'"]+)['"]/g)].map((m) => m[1]);
const uniqueImgs = [...new Set(imgPaths)];
assert.ok(uniqueImgs.length >= 9, 'En az 9 lamba görseli bekleniyor');
for (const p of uniqueImgs) {
  const full = path.join(rootDir, p.slice(2));
  assert.ok(fs.existsSync(full), `Eksik lamba görseli: ${p}`);
  assert.ok(fs.statSync(full).size > 200, `Boş lamba görseli: ${p}`);
}
console.log(`✅ Tüm lamba görselleri diskte doğrulandı (${uniqueImgs.length} görsel: JPG stüdyo + SVG).`);

// 4. Şablon referansları ve kW hesapları
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(rootDir, 'js/data-cables.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(rootDir, 'js/data-fixtures.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(rootDir, 'js/data-templates.js'), 'utf8'), sandbox);

const calc = require('../js/calc.js');
const cableMap = Object.fromEntries(sandbox.window.SET_CABLES.map((c) => [c.id, c]));
assert.strictEqual(calc.calcCablePower(cableMap['turk-uclu']).safeTotalKWText, '2.30 kW');
assert.strictEqual(calc.calcCablePower(cableMap['16a-mono']).ratedTotalKWText, '3.68 kW');
assert.strictEqual(calc.calcCablePower(cableMap['16a-mono']).safeTotalKWText, '2.94 kW');
assert.strictEqual(calc.calcCablePower(cableMap['32a-mono']).ratedTotalKWText, '7.36 kW');
assert.strictEqual(calc.calcCablePower(cableMap['63a-mono']).ratedTotalKWText, '14.5 kW');
assert.strictEqual(calc.calcCablePower(cableMap['125a-mono']).ratedTotalKWText, '28.8 kW');
console.log('✅ Kablo kW dönüşümleri doğrulandı (Üçlü Güv: 2.30 kW, 16A: 3.68 kW, 32A: 7.36 kW, 63A: 14.5 kW, 125A: 28.8 kW).');

const cableIds = new Set(sandbox.window.SET_CABLES.map((c) => c.id));
const fixtureIds = new Set(sandbox.window.SET_FIXTURES.map((f) => f.id));
for (const tpl of sandbox.window.TRUCK_TEMPLATES) {
  for (const item of tpl.items) {
    if (item.fixtureId) assert.ok(fixtureIds.has(item.fixtureId), `Geçersiz fixtureId: ${item.fixtureId}`);
    if (item.cableId) assert.ok(cableIds.has(item.cableId), `Geçersiz cableId: ${item.cableId}`);
  }
}
console.log(`✅ Kamyon şablon referansları doğrulandı (${sandbox.window.TRUCK_TEMPLATES.length} şablon).`);

// 5. sw.js içindeki tüm cache dosyalarının diskte var olduğunu doğrula
const swJs = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
const swAssets = [...swJs.matchAll(/['"](\.\/[^'"]+)['"]/g)].map((m) => m[1]).filter((a) => a !== './');
for (const a of swAssets) {
  const full = path.join(rootDir, a.slice(2));
  assert.ok(fs.existsSync(full), `sw.js eksik dosya: ${a}`);
}
console.log(`✅ Service Worker önbellek dosyaları doğrulandı (${swAssets.length} dosya).`);
