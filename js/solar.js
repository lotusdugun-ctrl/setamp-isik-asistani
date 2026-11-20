// SetAmp — Çevrimdışı Astronomik Güneş Konumu, Altın/Mavi Saat & Pencere Cephe Motoru
// NOAA güneş konumu algoritması (her tarih ve koordinat için < 0.05° doğruluk, sıfır internet gereksinimi)
(function (root) {
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  const TR_CITIES = [
    { id: 'istanbul', name: 'İstanbul', lat: 41.0082, lng: 28.9784, tz: 3 },
    { id: 'ankara', name: 'Ankara', lat: 39.9334, lng: 32.8597, tz: 3 },
    { id: 'izmir', name: 'İzmir', lat: 38.4237, lng: 27.1428, tz: 3 },
    { id: 'antalya', name: 'Antalya', lat: 36.8969, lng: 30.7133, tz: 3 },
    { id: 'bodrum', name: 'Bodrum / Muğla', lat: 37.0344, lng: 27.4305, tz: 3 },
    { id: 'kapadokya', name: 'Kapadokya / Nevşehir', lat: 38.6431, lng: 34.8289, tz: 3 },
    { id: 'alacati', name: 'Çeşme / Alaçatı', lat: 38.2849, lng: 26.3771, tz: 3 },
    { id: 'kas', name: 'Kaş / Kalkan', lat: 36.2018, lng: 29.6377, tz: 3 },
    { id: 'bursa', name: 'Bursa', lat: 40.1885, lng: 29.0610, tz: 3 },
    { id: 'canakkale', name: 'Çanakkale', lat: 40.1553, lng: 26.4142, tz: 3 },
    { id: 'adana', name: 'Adana', lat: 37.0000, lng: 35.3213, tz: 3 },
    { id: 'gaziantep', name: 'Gaziantep', lat: 37.0662, lng: 37.3833, tz: 3 },
    { id: 'mardin', name: 'Mardin', lat: 37.3212, lng: 40.7245, tz: 3 },
    { id: 'sanliurfa', name: 'Şanlıurfa', lat: 37.1674, lng: 38.7955, tz: 3 },
    { id: 'trabzon', name: 'Trabzon', lat: 41.0027, lng: 39.7168, tz: 3 },
    { id: 'eskisehir', name: 'Eskişehir', lat: 39.7767, lng: 30.5206, tz: 3 },
    { id: 'kars', name: 'Kars', lat: 40.6013, lng: 43.0975, tz: 3 }
  ];

  const COMPASS_8 = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
  const COMPASS_FULL = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];

  function normalizeDeg(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function azimuthToCompass(deg, full = false) {
    const idx = Math.round(normalizeDeg(deg) / 45) % 8;
    return full ? COMPASS_FULL[idx] : COMPASS_8[idx];
  }

  function formatMinutes(totalMin) {
    if (totalMin === null || totalMin === undefined || Number.isNaN(totalMin)) return '—';
    const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function formatDuration(mins) {
    if (!mins || mins <= 0) return '0 dk';
    const r = Math.round(mins);
    const h = Math.floor(r / 60);
    const m = r % 60;
    if (h === 0) return `${m} dk`;
    if (m === 0) return `${h} sa`;
    return `${h} sa ${m} dk`;
  }

  /**
   * Yıl, Ay (1-12), Gün, Yerel Dakika (0-1440) ve Saat Dilimi (UTC+3 = 3) için Julian Günü
   */
  function toJulianDay(year, month, day, localMinutes, tzHours = 3) {
    const utcHours = localMinutes / 60 - tzHours;
    let y = year;
    let m = month;
    if (m <= 2) {
      y -= 1;
      m += 12;
    }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    const jd0 = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
    return jd0 + utcHours / 24;
  }

  /**
   * NOAA Solar Position: belirli tarih + dakika + koordinat için Azimut (°), Yükseklik (°), Gölge ve Işık Karakteri
   */
  function getSolarPosition(year, month, day, localMinutes, lat, lng, tzHours = 3) {
    const jd = toJulianDay(year, month, day, localMinutes, tzHours);
    const jc = (jd - 2451545.0) / 36525.0; // Julian Century

    const geomMeanLongSun = normalizeDeg(280.46646 + jc * (36000.76983 + jc * 0.0003032));
    const geomMeanAnomSun = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    const eccentEarthOrbit = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);

    const sinM = Math.sin(geomMeanAnomSun * DEG2RAD);
    const sin2M = Math.sin(2 * geomMeanAnomSun * DEG2RAD);
    const sin3M = Math.sin(3 * geomMeanAnomSun * DEG2RAD);

    const sunEqOfCtr = sinM * (1.914602 - jc * (0.004817 + 0.000014 * jc))
      + sin2M * (0.019993 - 0.000101 * jc)
      + sin3M * 0.000289;

    const sunTrueLong = geomMeanLongSun + sunEqOfCtr;
    const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * DEG2RAD);

    const meanObliqEcliptic = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
    const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * DEG2RAD);

    const sunDeclin = Math.asin(Math.sin(obliqCorr * DEG2RAD) * Math.sin(sunAppLong * DEG2RAD)) * RAD2DEG;

    const varY = Math.pow(Math.tan((obliqCorr / 2) * DEG2RAD), 2);
    const eqOfTime = 4 * RAD2DEG * (
      varY * Math.sin(2 * geomMeanLongSun * DEG2RAD)
      - 2 * eccentEarthOrbit * sinM
      + 4 * eccentEarthOrbit * varY * sinM * Math.cos(2 * geomMeanLongSun * DEG2RAD)
      - 0.5 * varY * varY * Math.sin(4 * geomMeanLongSun * DEG2RAD)
      - 1.25 * eccentEarthOrbit * eccentEarthOrbit * sin2M
    );

    const trueSolarTime = ((localMinutes + eqOfTime + 4 * lng - 60 * tzHours) % 1440 + 1440) % 1440;
    const hourAngle = trueSolarTime / 4 < 0 ? trueSolarTime / 4 + 180 : trueSolarTime / 4 - 180;

    const latRad = lat * DEG2RAD;
    const decRad = sunDeclin * DEG2RAD;
    const haRad = hourAngle * DEG2RAD;

    const cosZenith = Math.min(1, Math.max(-1,
      Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
    ));
    const zenith = Math.acos(cosZenith) * RAD2DEG;
    const rawElevation = 90 - zenith;

    // Atmosferik kırılma düzeltmesi (ufuk civarında hassas gündoğumu/günbatımı)
    let refraction = 0;
    if (rawElevation > 85) {
      refraction = 0;
    } else if (rawElevation > 5) {
      const te = Math.tan(rawElevation * DEG2RAD);
      refraction = (58.1 / te - 0.07 / Math.pow(te, 3) + 0.000086 / Math.pow(te, 5)) / 3600;
    } else if (rawElevation > -0.575) {
      refraction = (1735 + rawElevation * (-518.2 + rawElevation * (103.4 + rawElevation * (-12.79 + rawElevation * 0.711)))) / 3600;
    } else {
      refraction = -20.772 / Math.tan(rawElevation * DEG2RAD) / 3600;
    }
    const elevation = rawElevation + refraction;

    // Azimut (Kuzey = 0°, Doğu = 90°, Güney = 180°, Batı = 270°)
    let azimuth = 180;
    const denom = Math.cos(latRad) * Math.sin(zenith * DEG2RAD);
    if (Math.abs(denom) > 1e-6) {
      const cosAz = Math.min(1, Math.max(-1, (Math.sin(latRad) * cosZenith - Math.sin(decRad)) / denom));
      const azAngle = Math.acos(cosAz) * RAD2DEG;
      azimuth = hourAngle > 0 ? normalizeDeg(azAngle + 180) : normalizeDeg(540 - azAngle);
    }

    const shadowAzimuth = normalizeDeg(azimuth + 180);
    const shadowRatio = elevation > 1.5 ? 1 / Math.tan(elevation * DEG2RAD) : null;

    // Işık karakteri ve tahmini Kelvin
    let phaseLabel = 'Gece';
    let phaseKey = 'NIGHT';
    let estKelvin = '—';
    let setTip = 'Doğal gün ışığı yok; yapay ışık veya ay ışığı kurulumu gerekir.';

    if (elevation < -6) {
      phaseLabel = 'Gece / Karanlık';
      phaseKey = 'NIGHT';
      estKelvin = '—';
      setTip = 'Gökyüzü tamamen karanlık. Gece dış/iç ışık planına geçin.';
    } else if (elevation < 0) {
      phaseLabel = 'Mavi Saat (Alacakaranlık)';
      phaseKey = 'BLUE';
      estKelvin = '8500K–11000K';
      setTip = 'Gökyüzü dengeli koyu mavi. Pratik ve sokak ışıklarıyla mükemmel kontrast; süre çok kısadır!';
    } else if (elevation < 6) {
      phaseLabel = 'Altın Saat (Golden Hour)';
      phaseKey = 'GOLDEN';
      estKelvin = '2900K–4000K';
      setTip = 'Sıcak, yatay ve uzun gölgeli sinematik ışık. Düşük açıdan pencerelere derinlemesine girer.';
    } else if (elevation < 22) {
      phaseLabel = 'Eğik Gün Işığı';
      phaseKey = 'LOW_DAY';
      estKelvin = '4600K–5300K';
      setTip = 'Güzel yan/arka açı verir; pencerelerden içeri direkt ışık vurabilir, difüzyon veya neg fill hazırlayın.';
    } else if (elevation < 55) {
      phaseLabel = 'Standart Gün Işığı';
      phaseKey = 'DAY';
      estKelvin = '5500K–5800K';
      setTip = 'Dengeli gün ışığı. Dış çekimde bounce/reflektör veya 8x8/12x12 difüzyon ile yüz yumuşatılır.';
    } else {
      phaseLabel = 'Sert Tepe Güneşi';
      phaseKey = 'HIGH_NOON';
      estKelvin = '5800K–6000K';
      setTip = 'Güneş çok tepede — göz altlarında sert gölge oluşturur. 12x12 / 20x20 overhead silk veya gölge çadırı önerilir.';
    }

    return {
      azimuth: Math.round(azimuth * 10) / 10,
      elevation: Math.round(elevation * 10) / 10,
      rawElevation: Math.round(rawElevation * 10) / 10,
      compass: azimuthToCompass(azimuth, false),
      compassFull: azimuthToCompass(azimuth, true),
      shadowAzimuth: Math.round(shadowAzimuth * 10) / 10,
      shadowCompass: azimuthToCompass(shadowAzimuth, false),
      shadowRatio: shadowRatio !== null ? Math.round(shadowRatio * 100) / 100 : null,
      phaseLabel,
      phaseKey,
      estKelvin,
      setTip,
      isDaylight: elevation >= 0
    };
  }

  /**
   * Belirli bir güneş yüksekliği eşiğinden geçiş dakikasını ikili arama ile bulur (< 0.5 dk hassasiyet)
   */
  function findCrossingMinute(year, month, day, lat, lng, tzHours, targetElev, startMin, endMin, rising) {
    const f = (m) => getSolarPosition(year, month, day, m, lat, lng, tzHours).elevation - targetElev;
    let lo = startMin;
    let hi = endMin;
    const flo = f(lo);
    const fhi = f(hi);
    if (rising && !(flo <= 0 && fhi >= 0)) return null;
    if (!rising && !(flo >= 0 && fhi <= 0)) return null;

    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const fmid = f(mid);
      if ((rising && fmid < 0) || (!rising && fmid > 0)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  /**
   * Seçilen günün tüm set ışık takvimini (Mavi Saat, Gündoğumu, Altın Saat, Tepe, Günbatımı) ve saatlik yayını hesaplar
   */
  function getDaySolarSummary(year, month, day, lat, lng, tzHours = 3) {
    // 10 dakikalık adımlarla gün içi tepe noktasını bul
    let noonMin = 720;
    let maxElev = -90;
    for (let m = 0; m <= 1440; m += 10) {
      const pos = getSolarPosition(year, month, day, m, lat, lng, tzHours);
      if (pos.elevation > maxElev) {
        maxElev = pos.elevation;
        noonMin = m;
      }
    }
    // Tepe noktasını 1 dakika hassasiyetine indir
    let bestNoon = noonMin;
    for (let m = Math.max(0, noonMin - 12); m <= Math.min(1440, noonMin + 12); m += 1) {
      const pos = getSolarPosition(year, month, day, m, lat, lng, tzHours);
      if (pos.elevation > maxElev) {
        maxElev = pos.elevation;
        bestNoon = m;
      }
    }
    noonMin = bestNoon;
    const noonPos = getSolarPosition(year, month, day, noonMin, lat, lng, tzHours);

    // Atmosferik kırılma dahil görünür gündoğumu/günbatımı: güneş diskinin üst kenarı ufukta (~ -0.3° görünür / -0.833° ham)
    const blueStartAM = findCrossingMinute(year, month, day, lat, lng, tzHours, -6, 0, noonMin, true);
    const sunriseMin = findCrossingMinute(year, month, day, lat, lng, tzHours, -0.3, 0, noonMin, true);
    const goldenEndAM = findCrossingMinute(year, month, day, lat, lng, tzHours, 6, 0, noonMin, true);

    const goldenStartPM = findCrossingMinute(year, month, day, lat, lng, tzHours, 6, noonMin, 1440, false);
    const sunsetMin = findCrossingMinute(year, month, day, lat, lng, tzHours, -0.3, noonMin, 1440, false);
    const blueEndPM = findCrossingMinute(year, month, day, lat, lng, tzHours, -6, noonMin, 1440, false);

    const sunrisePos = sunriseMin !== null ? getSolarPosition(year, month, day, sunriseMin, lat, lng, tzHours) : null;
    const sunsetPos = sunsetMin !== null ? getSolarPosition(year, month, day, sunsetMin, lat, lng, tzHours) : null;

    // Gündoğumu - günbatımı arası 20 dakikalık nokta yayı (pusula çizimi için)
    const arcPoints = [];
    const arcStart = sunriseMin !== null ? Math.floor(sunriseMin) : 360;
    const arcEnd = sunsetMin !== null ? Math.ceil(sunsetMin) : 1080;
    for (let m = arcStart; m <= arcEnd; m += 15) {
      const p = getSolarPosition(year, month, day, m, lat, lng, tzHours);
      arcPoints.push({ minute: m, azimuth: p.azimuth, elevation: p.elevation, phaseKey: p.phaseKey });
    }
    if (sunsetMin !== null) {
      const pEnd = getSolarPosition(year, month, day, sunsetMin, lat, lng, tzHours);
      arcPoints.push({ minute: sunsetMin, azimuth: pEnd.azimuth, elevation: Math.max(0, pEnd.elevation), phaseKey: 'GOLDEN' });
    }

    // Tam saatlik işaretçiler (pusula yayı üstünde 08, 10, 12, 14, 16...)
    const hourMarks = [];
    for (let h = 5; h <= 21; h++) {
      const p = getSolarPosition(year, month, day, h * 60, lat, lng, tzHours);
      if (p.elevation >= 0) {
        hourMarks.push({ hour: h, label: String(h).padStart(2, '0'), azimuth: p.azimuth, elevation: p.elevation });
      }
    }

    return {
      blueStartAM,
      sunriseMin,
      goldenEndAM,
      noonMin,
      goldenStartPM,
      sunsetMin,
      blueEndPM,
      daylightMinutes: (sunriseMin !== null && sunsetMin !== null) ? (sunsetMin - sunriseMin) : 0,
      sunriseAzimuth: sunrisePos ? sunrisePos.azimuth : null,
      sunriseCompass: sunrisePos ? sunrisePos.compass : '—',
      sunsetAzimuth: sunsetPos ? sunsetPos.azimuth : null,
      sunsetCompass: sunsetPos ? sunsetPos.compass : '—',
      noonElevation: noonPos.elevation,
      noonAzimuth: noonPos.azimuth,
      arcPoints,
      hourMarks
    };
  }

  /**
   * Mekan / Pencere Cephesi Hesabı:
   * Belirli bir yöne bakan (facingDeg: 0=K, 90=D, 180=G, 270=B) pencere veya dış cephenin
   * gün içinde hangi saatler arasında direkt güneş alacağını hesaplar.
   */
  function getWindowSunWindow(year, month, day, lat, lng, tzHours, facingDeg, selectedMinute) {
    const face = normalizeDeg(facingDeg);
    const halfFov = 75; // Cephenin önündeki etkin direkt güneş açısı (±75°)
    let startMin = null;
    let endMin = null;

    function isHitting(pos) {
      if (pos.elevation < 2) return false; // 2° altı ufuk/bina engeli
      const diff = Math.abs(((pos.azimuth - face + 540) % 360) - 180);
      return diff <= halfFov;
    }

    for (let m = 240; m <= 1320; m += 5) {
      const pos = getSolarPosition(year, month, day, m, lat, lng, tzHours);
      if (isHitting(pos)) {
        if (startMin === null) startMin = m;
        endMin = m;
      }
    }

    const curPos = getSolarPosition(year, month, day, selectedMinute, lat, lng, tzHours);
    const hittingNow = isHitting(curPos);

    return {
      facingDeg: face,
      facingCompass: azimuthToCompass(face, false),
      facingFull: azimuthToCompass(face, true),
      hasDirectSun: startMin !== null,
      startMin,
      endMin,
      durationMin: startMin !== null && endMin !== null ? (endMin - startMin) : 0,
      hittingNow,
      rangeText: startMin !== null ? `${formatMinutes(startMin)} – ${formatMinutes(endMin)}` : 'Direkt güneş almaz (gölge cephe)'
    };
  }

  const api = {
    TR_CITIES,
    normalizeDeg,
    azimuthToCompass,
    formatMinutes,
    formatDuration,
    getSolarPosition,
    getDaySolarSummary,
    getWindowSunWindow
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SetSolar = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
