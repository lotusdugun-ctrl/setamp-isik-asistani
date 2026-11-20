// SetAmp — Güneş Pusulası, Altın/Mavi Saat, Pencere Cephe & Canlı Bulut Giriş/Çıkış Takip Arayüzü
(function () {
  const Solar = window.SetSolar;
  if (!Solar) return;

  const SOLAR_STORAGE_KEY = 'setamp_solar_state_v1';

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function parseIsoDate(iso) {
    const parts = (iso || todayIso()).split('-').map(Number);
    if (parts.length === 3 && parts[0] > 1990) {
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }

  function formatSec(sec) {
    const s = Math.max(0, Math.round(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function formatClock(msTimestamp) {
    const d = new Date(msTimestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function loadSolarState() {
    try {
      const raw = localStorage.getItem(SOLAR_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return {
          cityId: p.cityId || 'istanbul',
          locationName: p.locationName || 'İstanbul',
          lat: Number(p.lat) || 41.0082,
          lng: Number(p.lng) || 28.9784,
          tz: Number.isFinite(Number(p.tz)) ? Number(p.tz) : 3,
          dateIso: todayIso(),
          minute: nowMinutes(),
          windowFacing: Number.isFinite(Number(p.windowFacing)) ? Number(p.windowFacing) : 180,
          cloudHistory: Array.isArray(p.cloudHistory) ? p.cloudHistory.slice(0, 8) : []
        };
      }
    } catch (_) {
      // ignore
    }
    return {
      cityId: 'istanbul',
      locationName: 'İstanbul',
      lat: 41.0082,
      lng: 28.9784,
      tz: 3,
      dateIso: todayIso(),
      minute: nowMinutes(),
      windowFacing: 180,
      cloudHistory: []
    };
  }

  const sState = loadSolarState();

  // Canlı oturum verileri (pusula, hava durumu, bulut zamanlayıcı)
  const live = {
    compassEnabled: false,
    compassHeading: 0,
    weatherLoading: false,
    weatherError: null,
    weather: null, // { fetchedAt, cloudTotal, cloudLow, cloudMid, cloudHigh, windSpeedKmh, windDirDeg, hourly: [...] }
    // Bulut Giriş / Çıkış Saniye Zamanlayıcısı
    // phase: 'idle' | 'approach_measuring' | 'approach_countdown' | 'in_cloud_measuring' | 'in_cloud_countdown' | 'sun_open'
    cloudPhase: 'idle',
    tStart: null,       // ms
    tHalf: null,        // ms
    tTarget: null,      // ms (tahmini giriş veya çıkış anı)
    estDurationSec: 0,
    lastSunOpenStart: null,
    tickTimer: null
  };

  function saveSolarState() {
    try {
      localStorage.setItem(SOLAR_STORAGE_KEY, JSON.stringify({
        cityId: sState.cityId,
        locationName: sState.locationName,
        lat: sState.lat,
        lng: sState.lng,
        tz: sState.tz,
        windowFacing: sState.windowFacing,
        cloudHistory: sState.cloudHistory
      }));
    } catch (_) {
      // ignore
    }
  }

  function toast(msg) {
    if (window.SetAppToast) window.SetAppToast(msg);
  }

  // ==================== 360° GÜNEŞ PUSULASI SVG ====================
  function polarToXY(cx, cy, r, degFromNorth) {
    const rad = (degFromNorth - 90) * (Math.PI / 180);
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }

  function elevToRadius(elev, maxR) {
    const clamped = Math.max(0, Math.min(90, elev));
    return maxR * (1 - clamped / 90);
  }

  function buildCompassSVG(pos, summary, winInfo) {
    const size = 280;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 108;
    const rot = live.compassEnabled ? -live.compassHeading : 0;

    // 15° kadrandaki çentikler
    let ticks = '';
    for (let deg = 0; deg < 360; deg += 15) {
      const major = deg % 45 === 0;
      const p1 = polarToXY(cx, cy, maxR, deg);
      const p2 = polarToXY(cx, cy, maxR + (major ? 7 : 4), deg);
      ticks += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="var(--border-strong)" stroke-width="${major ? 1.5 : 1}"/>`;
    }

    // Yön yazıları
    const dirs = [
      { d: 0, t: 'K', main: true },
      { d: 45, t: 'KD', main: false },
      { d: 90, t: 'D', main: true },
      { d: 135, t: 'GD', main: false },
      { d: 180, t: 'G', main: true },
      { d: 225, t: 'GB', main: false },
      { d: 270, t: 'B', main: true },
      { d: 315, t: 'KB', main: false }
    ];
    let dirLabels = '';
    for (const item of dirs) {
      const p = polarToXY(cx, cy, maxR + 19, item.d);
      const fill = item.d === 0 ? 'var(--danger)' : item.main ? 'var(--text)' : 'var(--text-dim)';
      dirLabels += `<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" fill="${fill}" font-size="${item.main ? 12 : 9.5}" font-weight="${item.main ? 800 : 600}" font-family="var(--font-mono)">${item.t}</text>`;
    }

    // Pencere / Cephe açısı kama çizimi (±65° görsel kama)
    const wStart = polarToXY(cx, cy, maxR, winInfo.facingDeg - 65);
    const wEnd = polarToXY(cx, cy, maxR, winInfo.facingDeg + 65);
    const wMid = polarToXY(cx, cy, maxR - 2, winInfo.facingDeg);
    const winWedge = `
      <path d="M ${cx} ${cy} L ${wStart.x.toFixed(1)} ${wStart.y.toFixed(1)} A ${maxR} ${maxR} 0 0 1 ${wEnd.x.toFixed(1)} ${wEnd.y.toFixed(1)} Z"
        fill="${winInfo.hittingNow ? 'rgba(245, 183, 26, 0.14)' : 'rgba(56, 189, 248, 0.08)'}"
        stroke="${winInfo.hittingNow ? 'var(--accent)' : 'var(--info)'}" stroke-opacity="0.45" stroke-width="1"/>
      <line x1="${cx}" y1="${cy}" x2="${wMid.x.toFixed(1)}" y2="${wMid.y.toFixed(1)}"
        stroke="${winInfo.hittingNow ? 'var(--accent)' : 'var(--info)'}" stroke-width="1.4" stroke-dasharray="3 3" opacity="0.75"/>
    `;

    // Gündoğumu & Günbatımı ufuk ışınları
    let riseSetLines = '';
    if (summary.sunriseAzimuth !== null) {
      const pr = polarToXY(cx, cy, maxR, summary.sunriseAzimuth);
      riseSetLines += `<line x1="${cx}" y1="${cy}" x2="${pr.x.toFixed(1)}" y2="${pr.y.toFixed(1)}" stroke="#f59e0b" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.75"/>`;
    }
    if (summary.sunsetAzimuth !== null) {
      const ps = polarToXY(cx, cy, maxR, summary.sunsetAzimuth);
      riseSetLines += `<line x1="${cx}" y1="${cy}" x2="${ps.x.toFixed(1)}" y2="${ps.y.toFixed(1)}" stroke="#ef4444" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.75"/>`;
    }

    // Günlük güneş yayı eğrisi
    let arcPath = '';
    if (summary.arcPoints.length > 1) {
      const pts = summary.arcPoints.map((pt) => {
        const r = elevToRadius(pt.elevation, maxR);
        return polarToXY(cx, cy, r, pt.azimuth);
      });
      arcPath = `<polyline fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" opacity="0.9"/>`;
    }

    // Saat işaretleri (yay üzerinde her 2 saatte bir)
    let hourDots = '';
    for (const hm of summary.hourMarks) {
      if (hm.hour % 2 !== 0 && summary.hourMarks.length > 8) continue;
      const r = elevToRadius(hm.elevation, maxR);
      const p = polarToXY(cx, cy, r, hm.azimuth);
      const pl = polarToXY(cx, cy, Math.max(14, r - 12), hm.azimuth);
      hourDots += `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"/>
        <text x="${pl.x.toFixed(1)}" y="${(pl.y + 3).toFixed(1)}" text-anchor="middle" fill="var(--text-muted)" font-size="8.5" font-family="var(--font-mono)">${hm.label}</text>
      `;
    }

    // Canlı bulut rüzgarı sürüklenme oku (Open-Meteo'dan geldiyse)
    // Meteorolojik rüzgar yönü esiş yönünü (geldiği yön) verir; bulut +180° yönüne gider
    let windArrow = '';
    if (live.weather && Number.isFinite(live.weather.windDirDeg)) {
      const fromPt = polarToXY(cx, cy, maxR - 8, live.weather.windDirDeg);
      const toDir = Solar.normalizeDeg(live.weather.windDirDeg + 180);
      const toPt = polarToXY(cx, cy, maxR - 36, live.weather.windDirDeg);
      const tipLeft = polarToXY(toPt.x, toPt.y, 7, toDir - 150);
      const tipRight = polarToXY(toPt.x, toPt.y, 7, toDir + 150);
      windArrow = `
        <g opacity="0.85">
          <line x1="${fromPt.x.toFixed(1)}" y1="${fromPt.y.toFixed(1)}" x2="${toPt.x.toFixed(1)}" y2="${toPt.y.toFixed(1)}" stroke="var(--info)" stroke-width="2" stroke-dasharray="3 2"/>
          <polygon points="${toPt.x.toFixed(1)},${toPt.y.toFixed(1)} ${tipLeft.x.toFixed(1)},${tipLeft.y.toFixed(1)} ${tipRight.x.toFixed(1)},${tipRight.y.toFixed(1)}" fill="var(--info)"/>
        </g>
      `;
    }

    // Aktif seçili saatte Güneş noktası ve Gölge vektörü
    let sunMarker = '';
    if (pos.elevation >= -6) {
      const sunR = elevToRadius(Math.max(0, pos.elevation), maxR);
      const sp = polarToXY(cx, cy, sunR, pos.azimuth);
      const shadowR = Math.min(maxR * 0.72, pos.shadowRatio ? Math.min(maxR * 0.7, 26 * pos.shadowRatio) : 45);
      const shPt = polarToXY(cx, cy, shadowR, pos.shadowAzimuth);
      const sunColor = pos.phaseKey === 'BLUE' ? '#60a5fa' : pos.phaseKey === 'GOLDEN' ? '#fb923c' : '#f5b71a';

      sunMarker = `
        ${pos.elevation > 0 ? `<line x1="${cx}" y1="${cy}" x2="${shPt.x.toFixed(1)}" y2="${shPt.y.toFixed(1)}" stroke="var(--text-dim)" stroke-width="3" stroke-linecap="round" opacity="0.65"/>` : ''}
        <line x1="${sp.x.toFixed(1)}" y1="${sp.y.toFixed(1)}" x2="${cx}" y2="${cy}" stroke="${sunColor}" stroke-width="2" opacity="0.85"/>
        <circle cx="${sp.x.toFixed(1)}" cy="${sp.y.toFixed(1)}" r="9" fill="${sunColor}" opacity="0.25"/>
        <circle cx="${sp.x.toFixed(1)}" cy="${sp.y.toFixed(1)}" r="5.5" fill="${sunColor}" stroke="var(--bg)" stroke-width="1.5"/>
      `;
    }

    return `
      <svg class="sun-compass-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="360 derece güneş pusulası">
        <g transform="rotate(${rot.toFixed(1)} ${cx} ${cy})">
          <circle cx="${cx}" cy="${cy}" r="${maxR}" fill="var(--input-bg)" stroke="var(--border-strong)" stroke-width="1.5"/>
          <circle cx="${cx}" cy="${cy}" r="${(maxR * 2 / 3).toFixed(1)}" fill="none" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>
          <circle cx="${cx}" cy="${cy}" r="${(maxR / 3).toFixed(1)}" fill="none" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>
          <line x1="${cx - maxR}" y1="${cy}" x2="${cx + maxR}" y2="${cy}" stroke="var(--border)" stroke-width="1"/>
          <line x1="${cx}" y1="${cy - maxR}" x2="${cx}" y2="${cy + maxR}" stroke="var(--border)" stroke-width="1"/>
          ${ticks}
          ${winWedge}
          ${riseSetLines}
          ${arcPath}
          ${hourDots}
          ${windArrow}
          ${sunMarker}
          <circle cx="${cx}" cy="${cy}" r="3.5" fill="var(--text)"/>
          ${dirLabels}
        </g>
        ${live.compassEnabled ? `<polygon points="${cx},4 ${cx - 5},14 ${cx + 5},14" fill="var(--accent)"/>` : ''}
      </svg>
    `;
  }

  // ==================== CANLI BULUT & RÜZGAR (OPEN-METEO) ====================
  async function fetchLiveCloudData(silent = false) {
    if (live.weatherLoading) return;
    live.weatherLoading = true;
    live.weatherError = null;
    renderCloudWeatherPanel();

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${sState.lat.toFixed(4)}&longitude=${sState.lng.toFixed(4)}&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m&hourly=cloud_cover,cloud_cover_low,wind_speed_850hPa,wind_direction_850hPa&timezone=auto&forecast_days=1`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const cur = data.current || {};
      const hr = data.hourly || {};
      const times = hr.time || [];
      const nowHour = new Date().getHours();

      // Şu anki saat için 850hPa (bulut yüksekliği ~1.5 km) rüzgar hızı ve yönü
      let idxNow = times.findIndex((t) => Number(t.slice(11, 13)) === nowHour);
      if (idxNow < 0) idxNow = 0;

      const wind850Kmh = Number(hr.wind_speed_850hPa?.[idxNow]) || Number(cur.wind_speed_10m) || 18;
      const wind850Dir = Number(hr.wind_direction_850hPa?.[idxNow] ?? cur.wind_direction_10m ?? 0);

      const nextHours = [];
      for (let i = idxNow; i < Math.min(times.length, idxNow + 6); i++) {
        nextHours.push({
          hour: times[i].slice(11, 16),
          total: Math.round(Number(hr.cloud_cover?.[i]) || 0),
          low: Math.round(Number(hr.cloud_cover_low?.[i]) || 0),
          windKmh: Math.round(Number(hr.wind_speed_850hPa?.[i]) || wind850Kmh)
        });
      }

      live.weather = {
        fetchedAt: formatClock(Date.now()).slice(0, 5),
        cloudTotal: Math.round(Number(cur.cloud_cover) || 0),
        cloudLow: Math.round(Number(cur.cloud_cover_low) || 0),
        cloudMid: Math.round(Number(cur.cloud_cover_mid) || 0),
        cloudHigh: Math.round(Number(cur.cloud_cover_high) || 0),
        windSpeedKmh: Math.round(wind850Kmh),
        windSpeedMs: Math.round((wind850Kmh / 3.6) * 10) / 10,
        windDirDeg: Math.round(wind850Dir),
        windDirCompass: Solar.azimuthToCompass(wind850Dir, false),
        driftToCompass: Solar.azimuthToCompass(Solar.normalizeDeg(wind850Dir + 180), false),
        hourly: nextHours
      };
      if (!silent) toast('Canlı bulut ve rüzgar verisi güncellendi');
    } catch (_) {
      live.weatherError = 'Canlı hava verisi alınamadı (internet yok veya servis meşgul). Kronometre ve güneş pusulası çevrimdışı çalışır.';
      if (!silent) toast('İnternet yok — çevrimdışı modda devam');
    } finally {
      live.weatherLoading = false;
      renderSolarTab();
    }
  }

  // ==================== BULUT GİRİŞ / ÇIKIŞ SANİYE ZAMANLAYICISI ====================
  function ensureTick() {
    if (live.tickTimer) return;
    live.tickTimer = setInterval(() => {
      if (live.cloudPhase === 'idle') {
        clearInterval(live.tickTimer);
        live.tickTimer = null;
        return;
      }
      renderCloudTimerCard();
    }, 250);
  }

  function startApproachMeasure() {
    live.cloudPhase = 'approach_measuring';
    live.tStart = Date.now();
    live.tHalf = null;
    live.tTarget = null;
    ensureTick();
    renderCloudTimerCard();
  }

  function markApproachHalfway() {
    if (live.cloudPhase !== 'approach_measuring' || !live.tStart) return;
    const now = Date.now();
    const elapsedMs = Math.max(1000, now - live.tStart);
    live.tHalf = now;
    live.tTarget = now + elapsedMs; // Yarı yol kuralı: kalan yarı = geçen yarı
    live.estDurationSec = Math.round(elapsedMs / 1000);
    live.cloudPhase = 'approach_countdown';
    ensureTick();
    renderCloudTimerCard();
    toast(`Tahmini buluta giriş: ${live.estDurationSec} sn`);
  }

  function markEnteredCloud(presetEstSec = null) {
    const now = Date.now();
    // Eğer öncesinde açık güneş süresi ölçülüyorsa kaydet
    if (live.lastSunOpenStart && now - live.lastSunOpenStart >= 3000) {
      const openSec = Math.round((now - live.lastSunOpenStart) / 1000);
      if (sState.cloudHistory.length > 0 && sState.cloudHistory[0].sunOpenSec === null) {
        sState.cloudHistory[0].sunOpenSec = openSec;
        saveSolarState();
      }
    }
    live.tStart = now;
    live.tHalf = null;
    live.lastSunOpenStart = null;

    if (presetEstSec && presetEstSec > 0) {
      live.estDurationSec = presetEstSec;
      live.tTarget = now + presetEstSec * 1000;
      live.cloudPhase = 'in_cloud_countdown';
    } else {
      live.estDurationSec = 0;
      live.tTarget = null;
      live.cloudPhase = 'in_cloud_measuring';
    }
    ensureTick();
    renderCloudTimerCard();
  }

  function markCloudHalfway() {
    if (live.cloudPhase !== 'in_cloud_measuring' || !live.tStart) return;
    const now = Date.now();
    const elapsedMs = Math.max(1000, now - live.tStart);
    live.tHalf = now;
    live.tTarget = now + elapsedMs; // Bulutun ortası geçti -> kalan süre ≈ geçen süre
    live.estDurationSec = Math.round((elapsedMs * 2) / 1000);
    live.cloudPhase = 'in_cloud_countdown';
    ensureTick();
    renderCloudTimerCard();
    toast(`Tahmini çıkış: ~${Math.round(elapsedMs / 1000)} sn sonra`);
  }

  function markExitedCloud() {
    const now = Date.now();
    if ((live.cloudPhase === 'in_cloud_measuring' || live.cloudPhase === 'in_cloud_countdown') && live.tStart) {
      const cloudSec = Math.max(1, Math.round((now - live.tStart) / 1000));
      sState.cloudHistory.unshift({
        time: formatClock(now).slice(0, 5),
        cloudSec,
        sunOpenSec: null
      });
      if (sState.cloudHistory.length > 8) sState.cloudHistory.length = 8;
      saveSolarState();
      toast(`Bulutta kalma süresi kaydedildi: ${formatSec(cloudSec)}`);
    }
    live.cloudPhase = 'sun_open';
    live.lastSunOpenStart = now;
    live.tStart = now;
    live.tHalf = null;
    live.tTarget = null;
    ensureTick();
    renderCloudTimerCard();
  }

  function resetCloudTimer() {
    live.cloudPhase = 'idle';
    live.tStart = null;
    live.tHalf = null;
    live.tTarget = null;
    live.lastSunOpenStart = null;
    renderCloudTimerCard();
  }

  function estimateByCloudSize(widthMeters) {
    const speedMs = live.weather?.windSpeedMs > 1 ? live.weather.windSpeedMs : 6.0; // Varsayılan ~22 km/s bulut rüzgarı
    return Math.max(10, Math.round(widthMeters / speedMs));
  }

  function renderCloudTimerCard() {
    const box = document.getElementById('cloudTimerBody');
    if (!box) return;

    const now = Date.now();
    const avgCloud = sState.cloudHistory.length
      ? Math.round(sState.cloudHistory.reduce((s, x) => s + x.cloudSec, 0) / sState.cloudHistory.length)
      : null;
    const openEntries = sState.cloudHistory.filter((x) => x.sunOpenSec !== null);
    const avgOpen = openEntries.length
      ? Math.round(openEntries.reduce((s, x) => s + x.sunOpenSec, 0) / openEntries.length)
      : null;

    let statusBadge = 'HAZIR';
    let statusCls = '';
    let bigMain = '00:00';
    let mainSub = 'Güneş açıkken yaklaşmayı, kapanınca bulut süresini 2 dokunuşla ölç.';
    let primaryActions = `
      <button class="btn btn-primary btn-sm" id="ctApproachStart">1. Buluta Yaklaşmayı Ölç</button>
      <button class="btn btn-soft btn-sm" id="ctEnterCloud">Güneş Buluta Girdi</button>
    `;

    if (live.cloudPhase === 'approach_measuring') {
      const elSec = (now - live.tStart) / 1000;
      statusBadge = 'YAKLAŞMA ÖLÇÜLÜYOR';
      statusCls = 'tag-caution';
      bigMain = formatSec(elSec);
      mainSub = 'Bulutun ön ucu, güneşle arasındaki mesafenin TAM YARISINA gelince bas:';
      primaryActions = `
        <button class="btn btn-primary btn-sm" id="ctApproachHalf">2. Yarıya Geldi (Geri Sayımı Başlat)</button>
        <button class="btn btn-soft btn-sm" id="ctEnterCloud">Şimdi Buluta Girdi</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">İptal</button>
      `;
    } else if (live.cloudPhase === 'approach_countdown') {
      const remSec = (live.tTarget - now) / 1000;
      statusBadge = remSec <= 10 ? 'BULUTA GİRİYOR!' : 'BULUTA GERİ SAYIM';
      statusCls = remSec <= 10 ? 'tag-danger' : 'tag-caution';
      bigMain = remSec > 0 ? `-${formatSec(remSec)}` : `+${formatSec(-remSec)}`;
      mainSub = remSec > 0
        ? `Tahmini buluta giriş saati: ${formatClock(live.tTarget)} (Yarı yol kuralı)`
        : 'Tahmini giriş anı doldu — buluta girdiyse aşağıdan işaretle:';
      primaryActions = `
        <button class="btn btn-primary btn-sm" id="ctEnterCloud">Güneş Buluta Girdi</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">Sıfırla</button>
      `;
    } else if (live.cloudPhase === 'in_cloud_measuring') {
      const elSec = (now - live.tStart) / 1000;
      statusBadge = 'GÜNEŞ BULUTTA';
      statusCls = 'tag-danger';
      bigMain = formatSec(elSec);
      mainSub = 'Bulut kütlesinin ortası güneşe gelince "Yarısında"ya bas → çıkış geri sayımı başlasın:';
      primaryActions = `
        <button class="btn btn-primary btn-sm" id="ctCloudHalf">Bulut Yarısında (Çıkış Tahmini)</button>
        <button class="btn btn-safe btn-sm" id="ctExitCloud">Güneş Çıktı!</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">Sıfırla</button>
      `;
    } else if (live.cloudPhase === 'in_cloud_countdown') {
      const elSec = (now - live.tStart) / 1000;
      const remSec = (live.tTarget - now) / 1000;
      statusBadge = remSec <= 12 ? 'GÜNEŞ ÇIKIYOR!' : 'ÇIKIŞA GERİ SAYIM';
      statusCls = remSec <= 12 ? 'tag-safe' : 'tag-caution';
      bigMain = remSec > 0 ? `-${formatSec(remSec)}` : `+${formatSec(-remSec)}`;
      mainSub = remSec > 0
        ? `Bulutta geçen: ${formatSec(elSec)} • Tahmini çıkış: ${formatClock(live.tTarget)} (Toplam ~${formatSec(live.estDurationSec)})`
        : `Bulutta geçen: ${formatSec(elSec)} — Güneş açtığında işaretle:`;
      primaryActions = `
        <button class="btn btn-safe btn-sm" id="ctExitCloud">Güneş Buluttan Çıktı!</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">Sıfırla</button>
      `;
    } else if (live.cloudPhase === 'sun_open') {
      const openSec = (now - live.tStart) / 1000;
      statusBadge = 'GÜNEŞ AÇIK';
      statusCls = 'tag-safe';
      bigMain = formatSec(openSec);
      mainSub = avgOpen
        ? `Açık güneş penceresi devam ediyor (Set ortalaması: ${formatSec(avgOpen)} açık / ${formatSec(avgCloud || 0)} bulut).`
        : 'Açık güneş süresi ölçülüyor. Yeni bulut yaklaşıyorsa takip başlat:';
      primaryActions = `
        <button class="btn btn-primary btn-sm" id="ctApproachStart">Yeni Buluta Yaklaşmayı Ölç</button>
        <button class="btn btn-soft btn-sm" id="ctEnterCloud">Tekrar Buluta Girdi</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">Durdur</button>
      `;
    }

    const estSmall = estimateByCloudSize(320);
    const estMed = estimateByCloudSize(900);
    const estLarge = estimateByCloudSize(2200);
    const windNote = live.weather
      ? `Canlı 850hPa rüzgar (${live.weather.windSpeedKmh} km/s) bazlı hızlı çıkış tahmini:`
      : 'Rüzgar verisi olmadan hızlı boyut tahmini (~22 km/s):';

    const histHtml = sState.cloudHistory.length > 0 ? `
      <div class="cloud-hist-bar mono">
        <span><strong>Set Ritmi (${sState.cloudHistory.length} bulut):</strong> Ort. Bulut <strong>${formatSec(avgCloud)}</strong>${avgOpen ? ` • Ort. Açık <strong>${formatSec(avgOpen)}</strong>` : ''}</span>
        <button class="len-chip" id="ctClearHist">Geçmişi Temizle</button>
      </div>
    ` : '';

    box.innerHTML = `
      <div class="cloud-timer-display">
        <div>
          <span class="tag ${statusCls} mono" style="font-size:11px; letter-spacing:0.05em;">${statusBadge}</span>
          <div class="cloud-big-clock mono">${bigMain}</div>
        </div>
        <div style="flex:1; min-width:190px; font-size:12px; color:var(--text-muted);">${esc(mainSub)}</div>
      </div>

      <div style="display:flex; gap:7px; flex-wrap:wrap; margin-top:10px;">
        ${primaryActions}
      </div>

      <div class="cloud-quick-sizes">
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:6px;">${esc(windNote)}</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="len-chip mono" data-cloud-est="${estSmall}">Küçük (~${formatSec(estSmall)})</button>
          <button class="len-chip mono" data-cloud-est="${estMed}">Orta (~${formatSec(estMed)})</button>
          <button class="len-chip mono" data-cloud-est="${estLarge}">Büyük (~${formatSec(estLarge)})</button>
          ${avgCloud ? `<button class="len-chip mono" data-cloud-est="${avgCloud}">Son Ort. (~${formatSec(avgCloud)})</button>` : ''}
        </div>
      </div>

      ${histHtml}
    `;

    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('ctApproachStart', startApproachMeasure);
    bind('ctApproachHalf', markApproachHalfway);
    bind('ctEnterCloud', () => markEnteredCloud(null));
    bind('ctCloudHalf', markCloudHalfway);
    bind('ctExitCloud', markExitedCloud);
    bind('ctReset', resetCloudTimer);
    bind('ctClearHist', () => {
      sState.cloudHistory = [];
      saveSolarState();
      renderCloudTimerCard();
    });
    box.querySelectorAll('[data-cloud-est]').forEach((b) => {
      b.addEventListener('click', () => {
        const sec = Number(b.dataset.cloudEst);
        markEnteredCloud(sec);
        toast(`Bulut çıkış geri sayımı başlatıldı (~${formatSec(sec)})`);
      });
    });
  }

  function renderCloudWeatherPanel() {
    const el = document.getElementById('cloudWeatherBody');
    if (!el) return;

    if (live.weatherLoading) {
      el.innerHTML = `<div class="empty-box" style="padding:16px;">Canlı bulut ve bulut yüksekliği rüzgarı alınıyor...</div>`;
      return;
    }

    if (!live.weather) {
      el.innerHTML = `
        <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:10px;">
          ${esc(live.weatherError || 'Alçak/orta/yüksek bulut yoğunluğu, bulut sürüklenme yönü ve 6 saatlik kesinti tahmini için canlı veriyi çekin.')}
        </div>
        <button id="fetchWeatherBtnInline" class="btn btn-soft btn-sm">Canlı Bulut &amp; Rüzgarı Getir</button>
      `;
      const btn = document.getElementById('fetchWeatherBtnInline');
      if (btn) btn.addEventListener('click', () => fetchLiveCloudData(false));
      return;
    }

    const w = live.weather;
    let riskLabel = 'AÇIK GÖKYÜZÜ';
    let riskCls = 'tag-safe';
    let riskAdvice = 'Kesintisiz direkt güneş. Standart difüzyon/reflektör planı uygulanabilir.';
    if (w.cloudLow >= 75 || w.cloudTotal >= 85) {
      riskLabel = 'KAPALI / YUMUŞAK IŞIK';
      riskCls = 'tag-safe';
      riskAdvice = 'Güneş yoğun bulut arkasında sabit kalır; doğal dev softbox etkisi (devamlılık kolay).';
    } else if (w.cloudLow >= 25 || (w.cloudTotal >= 30 && w.cloudTotal < 85)) {
      riskLabel = 'PARÇALI — SIK KESİNTİ RİSKİ!';
      riskCls = 'tag-danger';
      riskAdvice = `Alçak bulutlar %${w.cloudLow} ve ${w.windSpeedKmh} km/s hızla ${w.driftToCompass} yönüne akıyor. Güneş sık girip çıkacak — soldaki saniye zamanlayıcıyı kullan!`;
    }

    el.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="tag ${riskCls} mono">${riskLabel}</span>
        <span class="mono" style="font-size:11px; color:var(--text-dim);">Güncellendi: ${w.fetchedAt}</span>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">${esc(riskAdvice)}</div>

      <div class="cloud-layers-grid mono">
        <div class="cloud-layer-box">
          <span class="strip-k">Alçak (Kesen)</span>
          <strong style="color:${w.cloudLow >= 25 ? 'var(--caution)' : 'var(--text)'};">%${w.cloudLow}</strong>
        </div>
        <div class="cloud-layer-box">
          <span class="strip-k">Orta Bulut</span>
          <strong>%${w.cloudMid}</strong>
        </div>
        <div class="cloud-layer-box">
          <span class="strip-k">Yüksek (İnce)</span>
          <strong>%${w.cloudHigh}</strong>
        </div>
        <div class="cloud-layer-box">
          <span class="strip-k">Bulut Rüzgarı</span>
          <strong style="color:var(--info);">${w.windSpeedKmh} km/s → ${w.driftToCompass}</strong>
        </div>
      </div>

      <div class="cloud-hourly-strip mono">
        ${w.hourly.map((h) => {
          const barCol = h.low >= 70 ? 'var(--text-muted)' : h.low >= 25 ? 'var(--caution)' : 'var(--safe)';
          return `
            <div class="cloud-hour-col">
              <div class="cloud-hour-bar-wrap">
                <div class="cloud-hour-bar" style="height:${Math.max(8, h.total)}%; background:${barCol};"></div>
              </div>
              <div style="font-size:11px; font-weight:700;">%${h.total}</div>
              <div style="font-size:10px; color:var(--text-dim);">${h.hour}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ==================== PUSULA SENSÖRÜ ====================
  function handleOrientation(e) {
    if (!live.compassEnabled) return;
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') {
      heading = e.webkitCompassHeading;
    } else if (typeof e.alpha === 'number') {
      heading = (360 - e.alpha) % 360;
    }
    if (heading !== null && !Number.isNaN(heading)) {
      live.compassHeading = Math.round(heading);
      renderCompassOnly();
    }
  }

  async function toggleCompass() {
    if (live.compassEnabled) {
      live.compassEnabled = false;
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      renderSolarTab();
      toast('Canlı pusula kapatıldı (Kuzey sabit)');
      return;
    }

    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') {
          toast('Pusula izni verilmedi');
          return;
        }
      }
      live.compassEnabled = true;
      window.addEventListener('deviceorientationabsolute', handleOrientation);
      window.addEventListener('deviceorientation', handleOrientation);
      renderSolarTab();
      toast('Canlı pusula açıldı — telefonu yatay tutun');
    } catch (_) {
      toast('Bu cihazda canlı pusula sensörü desteklenmiyor');
    }
  }

  function requestGPS() {
    if (!navigator.geolocation) {
      toast('Bu tarayıcıda GPS desteklenmiyor');
      return;
    }
    toast('GPS konumu alınıyor...');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        sState.cityId = 'gps';
        sState.lat = Math.round(p.coords.latitude * 10000) / 10000;
        sState.lng = Math.round(p.coords.longitude * 10000) / 10000;
        sState.tz = Math.round(-new Date().getTimezoneOffset() / 60);
        sState.locationName = `GPS (${sState.lat.toFixed(2)}°, ${sState.lng.toFixed(2)}°)`;
        saveSolarState();
        renderSolarTab();
        fetchLiveCloudData(true);
        toast('Set GPS konumu ayarlandı');
      },
      () => toast('GPS izni alınamadı — listeden şehir seçebilirsiniz'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // ==================== ANA RENDER ====================
  function renderCompassOnly() {
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const pos = Solar.getSolarPosition(year, month, day, sState.minute, sState.lat, sState.lng, sState.tz);
    const summary = Solar.getDaySolarSummary(year, month, day, sState.lat, sState.lng, sState.tz);
    const winInfo = Solar.getWindowSunWindow(year, month, day, sState.lat, sState.lng, sState.tz, sState.windowFacing, sState.minute);
    const el = document.getElementById('solarCompassWrap');
    if (el) el.innerHTML = buildCompassSVG(pos, summary, winInfo);
  }

  function renderSolarTab() {
    const rootEl = document.getElementById('tab-solar');
    if (!rootEl) return;

    const { year, month, day } = parseIsoDate(sState.dateIso);
    const pos = Solar.getSolarPosition(year, month, day, sState.minute, sState.lat, sState.lng, sState.tz);
    const summary = Solar.getDaySolarSummary(year, month, day, sState.lat, sState.lng, sState.tz);
    const winInfo = Solar.getWindowSunWindow(year, month, day, sState.lat, sState.lng, sState.tz, sState.windowFacing, sState.minute);

    // Şehir select doldur
    const citySel = document.getElementById('solarCitySelect');
    if (citySel && citySel.options.length === 0) {
      citySel.innerHTML = Solar.TR_CITIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') +
        `<option value="gps">GPS Konumu</option>`;
    }
    if (citySel) citySel.value = sState.cityId;

    const dateInp = document.getElementById('solarDateInput');
    if (dateInp && document.activeElement !== dateInp) dateInp.value = sState.dateIso;

    const slider = document.getElementById('solarTimeSlider');
    if (slider) slider.value = sState.minute;

    document.getElementById('solarSelectedTime').textContent = Solar.formatMinutes(sState.minute);
    document.getElementById('solarPhaseBadge').textContent = pos.phaseLabel;
    document.getElementById('solarPhaseBadge').className = `status-pill ${pos.phaseKey === 'GOLDEN' ? 'solar-golden' : pos.phaseKey === 'BLUE' ? 'solar-blue' : ''}`;

    const compassBtn = document.getElementById('solarCompassLockBtn');
    if (compassBtn) {
      compassBtn.classList.toggle('active', live.compassEnabled);
      compassBtn.textContent = live.compassEnabled ? `Pusula: ${live.compassHeading}°` : 'Canlı Pusula';
    }

    // Pusula SVG
    document.getElementById('solarCompassWrap').innerHTML = buildCompassSVG(pos, summary, winInfo);

    // 4 Anlık Metrik
    const shadowText = pos.shadowRatio !== null
      ? `${(1.8 * pos.shadowRatio).toFixed(1)}m → ${pos.shadowCompass}`
      : '—';

    document.getElementById('solarLiveMetrics').innerHTML = `
      <div class="solar-stat">
        <span class="strip-k">Güneş Yönü (Azimut)</span>
        <strong class="mono">${pos.azimuth}° ${pos.compass}</strong>
      </div>
      <div class="solar-stat">
        <span class="strip-k">Yükseklik Açısı</span>
        <strong class="mono" style="color:${pos.elevation > 0 ? 'var(--accent)' : 'var(--text-muted)'};">${pos.elevation}°</strong>
      </div>
      <div class="solar-stat">
        <span class="strip-k">1.8m Kişi Gölgesi</span>
        <strong class="mono">${shadowText}</strong>
      </div>
      <div class="solar-stat">
        <span class="strip-k">Tahmini Kelvin</span>
        <strong class="mono">${pos.estKelvin}</strong>
      </div>
    `;
    document.getElementById('solarSetTip').textContent = pos.setTip;

    // Günün kritik ışık saatleri (Altın Saat, Mavi Saat, Gündoğumu, Günbatımı)
    let nextCountdown = '';
    if (sState.dateIso === todayIso()) {
      const mNow = nowMinutes();
      if (summary.sunriseMin && mNow < summary.sunriseMin) {
        nextCountdown = `Gündoğumuna ${Solar.formatDuration(summary.sunriseMin - mNow)}`;
      } else if (summary.goldenStartPM && mNow < summary.goldenStartPM) {
        nextCountdown = `Akşam Altın Saate ${Solar.formatDuration(summary.goldenStartPM - mNow)}`;
      } else if (summary.sunsetMin && mNow < summary.sunsetMin) {
        nextCountdown = `Günbatımına ${Solar.formatDuration(summary.sunsetMin - mNow)}!`;
      } else if (summary.blueEndPM && mNow < summary.blueEndPM) {
        nextCountdown = `Mavi Saat bitimine ${Solar.formatDuration(summary.blueEndPM - mNow)}!`;
      }
    }

    document.getElementById('solarNextCountdown').textContent = nextCountdown || `Gün ışığı: ${Solar.formatDuration(summary.daylightMinutes)}`;

    document.getElementById('solarTimelineGrid').innerHTML = `
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.blueStartAM || 0)}">
        <span class="strip-k">Mavi Saat (Sabah)</span>
        <strong class="mono">${Solar.formatMinutes(summary.blueStartAM)}</strong>
        <span class="solar-cell-sub mono">→ ${Solar.formatMinutes(summary.sunriseMin)}</span>
      </button>
      <button class="solar-time-cell highlight-gold" data-jump-min="${Math.round(summary.sunriseMin || 0)}">
        <span class="strip-k">Gündoğumu</span>
        <strong class="mono">${Solar.formatMinutes(summary.sunriseMin)}</strong>
        <span class="solar-cell-sub mono">${summary.sunriseAzimuth !== null ? `${summary.sunriseAzimuth}° ${summary.sunriseCompass}` : '—'}</span>
      </button>
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.goldenEndAM || 0)}">
        <span class="strip-k">Altın Saat Bitiş</span>
        <strong class="mono">${Solar.formatMinutes(summary.goldenEndAM)}</strong>
        <span class="solar-cell-sub mono">+6° açı</span>
      </button>
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.noonMin || 720)}">
        <span class="strip-k">Tepe Güneşi</span>
        <strong class="mono">${Solar.formatMinutes(summary.noonMin)}</strong>
        <span class="solar-cell-sub mono">Max ${summary.noonElevation}°</span>
      </button>
      <button class="solar-time-cell highlight-gold" data-jump-min="${Math.round(summary.goldenStartPM || 0)}">
        <span class="strip-k">Altın Saat (Akşam)</span>
        <strong class="mono">${Solar.formatMinutes(summary.goldenStartPM)}</strong>
        <span class="solar-cell-sub mono">→ ${Solar.formatMinutes(summary.sunsetMin)}</span>
      </button>
      <button class="solar-time-cell highlight-set" data-jump-min="${Math.round(summary.sunsetMin || 0)}">
        <span class="strip-k">Günbatımı</span>
        <strong class="mono">${Solar.formatMinutes(summary.sunsetMin)}</strong>
        <span class="solar-cell-sub mono">${summary.sunsetAzimuth !== null ? `${summary.sunsetAzimuth}° ${summary.sunsetCompass}` : '—'}</span>
      </button>
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.blueEndPM || 0)}">
        <span class="strip-k">Mavi Saat Sonu</span>
        <strong class="mono">${Solar.formatMinutes(summary.blueEndPM)}</strong>
        <span class="solar-cell-sub mono">Karanlık</span>
      </button>
    `;

    document.querySelectorAll('[data-jump-min]').forEach((b) => {
      b.addEventListener('click', () => {
        const m = Number(b.dataset.jumpMin);
        if (m > 0) {
          sState.minute = m;
          renderSolarTab();
        }
      });
    });

    // Pencere / Cephe Seçici
    const winDirs = [
      { d: 0, l: 'K' }, { d: 45, l: 'KD' }, { d: 90, l: 'D' }, { d: 135, l: 'GD' },
      { d: 180, l: 'G' }, { d: 225, l: 'GB' }, { d: 270, l: 'B' }, { d: 315, l: 'KB' }
    ];
    const winBar = document.getElementById('windowDirButtons');
    winBar.innerHTML = winDirs.map((w) =>
      `<button class="brand-btn ${sState.windowFacing === w.d ? 'active' : ''}" data-wdir="${w.d}">${w.l} <span class="brand-cnt">${w.d}°</span></button>`
    ).join('');
    winBar.querySelectorAll('[data-wdir]').forEach((b) => {
      b.addEventListener('click', () => {
        sState.windowFacing = Number(b.dataset.wdir);
        saveSolarState();
        renderSolarTab();
      });
    });

    document.getElementById('windowSunSummary').innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <div>
          <div style="font-size:11px; color:var(--text-dim);">${winInfo.facingFull} (${winInfo.facingDeg}°) Pencere / Cephe Direkt Güneş Aralığı:</div>
          <div class="mono" style="font-size:15px; font-weight:700; margin-top:2px; color:${winInfo.hasDirectSun ? 'var(--accent)' : 'var(--text-muted)'};">
            ${esc(winInfo.rangeText)} ${winInfo.hasDirectSun ? `(${Solar.formatDuration(winInfo.durationMin)})` : ''}
          </div>
        </div>
        <span class="tag ${winInfo.hittingNow ? 'tag-caution' : 'tag-safe'} mono">
          ${winInfo.hittingNow ? 'Seçili saatte direkt güneş alıyor' : 'Seçili saatte gölgede'}
        </span>
      </div>
    `;

    renderCloudTimerCard();
    renderCloudWeatherPanel();
  }

  function buildSolarReport() {
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const summary = Solar.getDaySolarSummary(year, month, day, sState.lat, sState.lng, sState.tz);
    const winInfo = Solar.getWindowSunWindow(year, month, day, sState.lat, sState.lng, sState.tz, sState.windowFacing, sState.minute);

    const lines = [
      `SET GÜNEŞ & DOĞAL IŞIK TAKVİMİ`,
      `Konum: ${sState.locationName} (${sState.lat.toFixed(3)}, ${sState.lng.toFixed(3)})`,
      `Tarih: ${sState.dateIso}`,
      `────────────────────────────────`,
      `Sabah Mavi Saat: ${Solar.formatMinutes(summary.blueStartAM)} – ${Solar.formatMinutes(summary.sunriseMin)}`,
      `Gündoğumu: ${Solar.formatMinutes(summary.sunriseMin)} (${summary.sunriseAzimuth}° ${summary.sunriseCompass})`,
      `Sabah Altın Saat Bitişi: ${Solar.formatMinutes(summary.goldenEndAM)}`,
      `Tepe Güneşi (Noon): ${Solar.formatMinutes(summary.noonMin)} (Max ${summary.noonElevation}°)`,
      `Akşam Altın Saat: ${Solar.formatMinutes(summary.goldenStartPM)} – ${Solar.formatMinutes(summary.sunsetMin)}`,
      `Günbatımı: ${Solar.formatMinutes(summary.sunsetMin)} (${summary.sunsetAzimuth}° ${summary.sunsetCompass})`,
      `Akşam Mavi Saat Sonu: ${Solar.formatMinutes(summary.blueEndPM)}`,
      `Toplam Gün Işığı: ${Solar.formatDuration(summary.daylightMinutes)}`,
      ``,
      `PENCERE / CEPHE (${winInfo.facingFull} ${winInfo.facingDeg}°):`,
      `• Direkt Güneş: ${winInfo.rangeText}${winInfo.hasDirectSun ? ` (${Solar.formatDuration(winInfo.durationMin)})` : ''}`
    ];

    if (live.weather) {
      lines.push(``);
      lines.push(`CANLI BULUT & RÜZGAR (${live.weather.fetchedAt}):`);
      lines.push(`• Toplam Bulut: %${live.weather.cloudTotal} (Alçak/Kesen: %${live.weather.cloudLow})`);
      lines.push(`• Bulut Rüzgarı: ${live.weather.windSpeedKmh} km/s → ${live.weather.driftToCompass} yönüne`);
    }

    return lines.join('\n');
  }

  function bindSolarEvents() {
    const citySel = document.getElementById('solarCitySelect');
    if (citySel) {
      citySel.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'gps') {
          requestGPS();
          return;
        }
        const c = Solar.TR_CITIES.find((x) => x.id === val);
        if (c) {
          sState.cityId = c.id;
          sState.locationName = c.name;
          sState.lat = c.lat;
          sState.lng = c.lng;
          sState.tz = c.tz;
          live.weather = null;
          saveSolarState();
          renderSolarTab();
        }
      });
    }

    const gpsBtn = document.getElementById('solarGpsBtn');
    if (gpsBtn) gpsBtn.addEventListener('click', requestGPS);

    const dateInp = document.getElementById('solarDateInput');
    if (dateInp) {
      dateInp.addEventListener('change', (e) => {
        if (e.target.value) {
          sState.dateIso = e.target.value;
          renderSolarTab();
        }
      });
    }

    const nowBtn = document.getElementById('solarNowBtn');
    if (nowBtn) {
      nowBtn.addEventListener('click', () => {
        sState.dateIso = todayIso();
        sState.minute = nowMinutes();
        renderSolarTab();
        toast('Şu anki tarih ve saate dönüldü');
      });
    }

    const slider = document.getElementById('solarTimeSlider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        sState.minute = Number(e.target.value);
        renderSolarTab();
      });
    }

    const compBtn = document.getElementById('solarCompassLockBtn');
    if (compBtn) compBtn.addEventListener('click', toggleCompass);

    const wBtn = document.getElementById('solarRefreshWeatherBtn');
    if (wBtn) wBtn.addEventListener('click', () => fetchLiveCloudData(false));

    const repBtn = document.getElementById('exportSolarReportBtn');
    if (repBtn) {
      repBtn.addEventListener('click', () => {
        if (window.SetAppOpenReport) {
          window.SetAppOpenReport('Güneş & Doğal Işık Takvimi', buildSolarReport());
        }
      });
    }
  }

  window.SetSolarUI = {
    init() {
      bindSolarEvents();
      renderSolarTab();
    },
    render: renderSolarTab
  };
})();
