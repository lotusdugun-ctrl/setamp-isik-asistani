const assert = require('assert');
const solar = require('../js/solar.js');

console.log('Güneş astronomi testleri başlatılıyor...');

// İstanbul (41.0082, 28.9784, UTC+3)
const IST = { lat: 41.0082, lng: 28.9784, tz: 3 };

// 1. 21 Haziran (Yaz Gündönümü): Gündoğumu ~05:32 (KD ~58°), Tepe ~13:06 (~72.4°), Günbatımı ~20:40 (KB ~302°)
{
  const jun = solar.getDaySolarSummary(2026, 6, 21, IST.lat, IST.lng, IST.tz);
  console.log('İstanbul 21 Haz:', {
    sunrise: solar.formatMinutes(jun.sunriseMin),
    sunriseAz: jun.sunriseAzimuth,
    noon: solar.formatMinutes(jun.noonMin),
    noonElev: jun.noonElevation,
    sunset: solar.formatMinutes(jun.sunsetMin),
    sunsetAz: jun.sunsetAzimuth
  });
  assert.ok(jun.sunriseMin >= 325 && jun.sunriseMin <= 340, '21 Haz gündoğumu ~05:32 olmalı');
  assert.ok(jun.sunriseAzimuth >= 54 && jun.sunriseAzimuth <= 63, '21 Haz gündoğumu ~58° KD olmalı');
  assert.ok(jun.noonElevation >= 71.5 && jun.noonElevation <= 73.5, '21 Haz tepe yüksekliği ~72.4° olmalı');
  assert.ok(jun.sunsetMin >= 1234 && jun.sunsetMin <= 1250, '21 Haz günbatımı ~20:40 olmalı');
  assert.ok(jun.sunsetAzimuth >= 297 && jun.sunsetAzimuth <= 306, '21 Haz günbatımı ~302° KB olmalı');
}

// 2. 21 Aralık (Kış Gündönümü): Gündoğumu ~08:25 (GD ~121°), Tepe ~13:02 (~25.6°), Günbatımı ~17:39 (GB ~239°)
{
  const dec = solar.getDaySolarSummary(2026, 12, 21, IST.lat, IST.lng, IST.tz);
  console.log('İstanbul 21 Ara:', {
    sunrise: solar.formatMinutes(dec.sunriseMin),
    sunriseAz: dec.sunriseAzimuth,
    noon: solar.formatMinutes(dec.noonMin),
    noonElev: dec.noonElevation,
    sunset: solar.formatMinutes(dec.sunsetMin),
    sunsetAz: dec.sunsetAzimuth
  });
  assert.ok(dec.sunriseMin >= 498 && dec.sunriseMin <= 512, '21 Ara gündoğumu ~08:25 olmalı');
  assert.ok(dec.sunriseAzimuth >= 117 && dec.sunriseAzimuth <= 125, '21 Ara gündoğumu ~121° GD olmalı');
  assert.ok(dec.noonElevation >= 24.8 && dec.noonElevation <= 26.5, '21 Ara tepe yüksekliği ~25.6° olmalı');
  assert.ok(dec.sunsetMin >= 1052 && dec.sunsetMin <= 1066, '21 Ara günbatımı ~17:39 olmalı');
  assert.ok(dec.sunsetAzimuth >= 234 && dec.sunsetAzimuth <= 243, '21 Ara günbatımı ~239° GB olmalı');
}

// 3. 20 Kasım: Gündoğumu ~07:56, Günbatımı ~17:44, Güney pencere gün ortası direkt güneş almalı, Kuzey pencere kışın almamalı
{
  const nov = solar.getDaySolarSummary(2026, 11, 20, IST.lat, IST.lng, IST.tz);
  console.log('İstanbul 20 Kas:', {
    blueAM: solar.formatMinutes(nov.blueStartAM),
    sunrise: solar.formatMinutes(nov.sunriseMin),
    goldenAM: solar.formatMinutes(nov.goldenEndAM),
    noon: solar.formatMinutes(nov.noonMin),
    goldenPM: solar.formatMinutes(nov.goldenStartPM),
    sunset: solar.formatMinutes(nov.sunsetMin),
    bluePM: solar.formatMinutes(nov.blueEndPM)
  });
  assert.ok(nov.blueStartAM < nov.sunriseMin && nov.sunriseMin < nov.goldenEndAM);
  assert.ok(nov.goldenStartPM < nov.sunsetMin && nov.sunsetMin < nov.blueEndPM);

  const southWin = solar.getWindowSunWindow(2026, 11, 20, IST.lat, IST.lng, IST.tz, 180, 780);
  const northWin = solar.getWindowSunWindow(2026, 11, 20, IST.lat, IST.lng, IST.tz, 0, 780);
  assert.strictEqual(southWin.hasDirectSun, true, 'Güney pencere güneş almalı');
  assert.strictEqual(southWin.hittingNow, true, 'Saat 13:00 te Güney pencereye direkt güneş vurmalı');
  assert.strictEqual(northWin.hasDirectSun, false, 'Kasım ayında Kuzey cephe direkt güneş almamalı');
}

console.log('✅ Tüm astronomik güneş, altın/mavi saat ve pencere cephe testleri başarıyla geçti!');
