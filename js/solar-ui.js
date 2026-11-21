// SetAmp — Canlı AR Kamera Güneş Yolu, 360° Pusula, Pencere Cephe & Bulut Giriş/Çıkış Sayacı
(function () {
  const Solar = window.SetSolar;
  if (!Solar) return;

  const SOLAR_STORAGE_KEY = 'setamp_solar_state_v1';
  const DEG = Math.PI / 180;

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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function formatClock(msTimestamp) {
    const d = new Date(msTimestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function shortestAngleDelta(fromDeg, toDeg) {
    return ((toDeg - fromDeg + 540) % 360) - 180;
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

  const live = {
    subtab: 'camera', // 'camera' | 'cloud' | 'plan'
    // AR Kamera & 3D Gökyüzü Durumu
    cameraActive: false,
    cameraStream: null,
    sensorActive: false,
    hasAbsoluteOrientation: false,
    sensorReceived: false,
    fullscreen: false,
    manualAz: 180,
    manualEl: 22,
    headingOffsetDeg: 0,
    smoothBasis: null, // { f, r, u }
    targetBasis: null, // { f, r, u }
    lastOrientation: null,
    rafId: null,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartAz: 180,
    dragStartEl: 22,
    dragStartOffset: 0,
    // 2D Pusula
    compassEnabled: false,
    compassHeading: 0,
    // Canlı Bulut & Rüzgar
    weatherLoading: false,
    weatherError: null,
    weather: null,
    // Günü Oynat Animasyonu
    playingDay: false,
    playDayTimer: null,
    // Bulut Giriş / Çıkış Saniye Sayacı
    cloudPhase: 'idle',
    tStart: null,
    tHalf: null,
    tTarget: null,
    estDurationSec: 0,
    lastSunOpenStart: null,
    tickTimer: null,
    // Önbellek (günlük güneş yayı her karede tekrar hesaplanmasın)
    cachedKey: '',
    cachedSummary: null,
    cachedPathPts: [],
    cachedHourPts: []
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

  // ==================== 3D ENU VEKTÖR MATEMATİĞİ (GİMBAL LOCK YOK) ====================
  function skyVec(azDeg, elDeg) {
    const az = azDeg * DEG;
    const el = elDeg * DEG;
    const ce = Math.cos(el);
    return { e: ce * Math.sin(az), n: ce * Math.cos(az), u: Math.sin(el) };
  }

  function dot(a, b) {
    return a.e * b.e + a.n * b.n + a.u * b.u;
  }

  function cross(a, b) {
    return {
      e: a.n * b.u - a.u * b.n,
      n: a.u * b.e - a.e * b.u,
      u: a.e * b.n - a.n * b.e
    };
  }

  function normalize(v) {
    const len = Math.hypot(v.e, v.n, v.u) || 1;
    return { e: v.e / len, n: v.n / len, u: v.u / len };
  }

  function lerpVec(a, b, t) {
    return {
      e: a.e + (b.e - a.e) * t,
      n: a.n + (b.n - a.n) * t,
      u: a.u + (b.u - a.u) * t
    };
  }

  function rotateCW(v, deg) {
    const rad = deg * DEG;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return {
      e: v.e * c + v.n * s,
      n: -v.e * s + v.n * c,
      u: v.u
    };
  }

  function manualBasis(azDeg, elDeg) {
    const az = azDeg * DEG;
    const el = elDeg * DEG;
    const f = { e: Math.cos(el) * Math.sin(az), n: Math.cos(el) * Math.cos(az), u: Math.sin(el) };
    const r = { e: Math.cos(az), n: -Math.sin(az), u: 0 };
    const u = { e: -Math.sin(el) * Math.sin(az), n: -Math.sin(el) * Math.cos(az), u: Math.cos(el) };
    return { f, r, u };
  }

  function getScreenAngle() {
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
      return window.screen.orientation.angle;
    }
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }

  function sensorBasis(alphaDeg, betaDeg, gammaDeg, webkitHeading, offsetDeg) {
    const a = (alphaDeg || 0) * DEG;
    const b = (betaDeg || 0) * DEG;
    const g = (gammaDeg || 0) * DEG;

    const ca = Math.cos(a), sa = Math.sin(a);
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);

    // W3C R = Rz(a) * Rx(b) * Ry(g) -> Earth ENU koordinatları
    const xDev = {
      e: ca * cg - sa * sb * sg,
      n: sa * cg + ca * sb * sg,
      u: -cb * sg
    };
    const yDev = {
      e: -sa * cb,
      n: ca * cb,
      u: sb
    };
    // Arka kamera yönü = -Z_dev
    let f = {
      e: -ca * sg - sa * sb * cg,
      n: -sa * sg + ca * sb * cg,
      u: -cb * cg
    };

    const th = getScreenAngle() * DEG;
    const ct = Math.cos(th), st = Math.sin(th);
    let r = {
      e: ct * xDev.e - st * yDev.e,
      n: ct * xDev.n - st * yDev.n,
      u: ct * xDev.u - st * yDev.u
    };
    let u = {
      e: st * xDev.e + ct * yDev.e,
      n: st * xDev.n + ct * yDev.n,
      u: st * xDev.u + ct * yDev.u
    };

    let yawFix = offsetDeg || 0;
    if (typeof webkitHeading === 'number' && !Number.isNaN(webkitHeading) && Math.hypot(f.e, f.n) > 0.14) {
      const rawAz = Solar.normalizeDeg(Math.atan2(f.e, f.n) / DEG);
      yawFix = webkitHeading - rawAz + (offsetDeg || 0);
    }

    if (Math.abs(yawFix) > 0.01) {
      f = rotateCW(f, yawFix);
      r = rotateCW(r, yawFix);
      u = rotateCW(u, yawFix);
    }

    f = normalize(f);
    r = normalize(cross(f, u));
    u = normalize(cross(r, f));
    return { f, r, u };
  }

  function basisToAzEl(basis) {
    const az = Solar.normalizeDeg(Math.atan2(basis.f.e, basis.f.n) / DEG);
    const el = Math.asin(Math.max(-1, Math.min(1, basis.f.u))) / DEG;
    return { az, el };
  }

  function ensureDayCache() {
    const key = `${sState.dateIso}|${sState.lat.toFixed(4)}|${sState.lng.toFixed(4)}|${sState.tz}`;
    if (live.cachedKey === key && live.cachedSummary) return;

    const { year, month, day } = parseIsoDate(sState.dateIso);
    const summary = Solar.getDaySolarSummary(year, month, day, sState.lat, sState.lng, sState.tz);

    const pathPts = [];
    for (let m = 240; m <= 1350; m += 10) {
      const p = Solar.getSolarPosition(year, month, day, m, sState.lat, sState.lng, sState.tz);
      if (p.elevation >= -2) {
        pathPts.push({
          minute: m,
          azimuth: p.azimuth,
          elevation: p.elevation,
          vec: skyVec(p.azimuth, p.elevation)
        });
      }
    }

    const hourPts = [];
    for (let h = 5; h <= 21; h++) {
      const p = Solar.getSolarPosition(year, month, day, h * 60, sState.lat, sState.lng, sState.tz);
      if (p.elevation > 0.2) {
        hourPts.push({
          hour: h,
          minute: h * 60,
          label: `${String(h).padStart(2, '0')}:00`,
          azimuth: p.azimuth,
          elevation: p.elevation,
          vec: skyVec(p.azimuth, p.elevation)
        });
      }
    }

    live.cachedKey = key;
    live.cachedSummary = summary;
    live.cachedPathPts = pathPts;
    live.cachedHourPts = hourPts;
  }

  function aimManualAtSun(minuteOverride = null) {
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const m = minuteOverride !== null ? minuteOverride : sState.minute;
    const pos = Solar.getSolarPosition(year, month, day, m, sState.lat, sState.lng, sState.tz);
    if (pos.elevation > -4) {
      live.manualAz = pos.azimuth;
      // Ufuk çizgisi (DOĞU/GÜNEY/BATI) ve güneş yayı birlikte görünsün diye ideal bakış açısı
      live.manualEl = Math.max(8, Math.min(54, pos.elevation * 0.6));
    } else {
      ensureDayCache();
      live.manualAz = 180;
      live.manualEl = Math.max(12, Math.min(34, (live.cachedSummary?.noonElevation || 35) * 0.55));
    }
  }

  // ==================== CANLI AR KAMERA + SENSÖR YÖNETİMİ ====================
  function onArOrientation(e) {
    if (e.type === 'deviceorientationabsolute' && e.alpha !== null) {
      live.hasAbsoluteOrientation = true;
    } else if (e.type === 'deviceorientation' && live.hasAbsoluteOrientation && typeof e.webkitCompassHeading !== 'number') {
      return;
    }

    const alpha = typeof e.alpha === 'number' ? e.alpha : null;
    const beta = typeof e.beta === 'number' ? e.beta : null;
    const gamma = typeof e.gamma === 'number' ? e.gamma : null;
    const wk = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : null;

    if (alpha === null && wk === null) return;
    live.lastOrientation = { alpha, beta: beta ?? 90, gamma: gamma ?? 0, wk };

    if (live.sensorActive) {
      live.sensorReceived = true;
      live.targetBasis = sensorBasis(alpha, beta ?? 90, gamma ?? 0, wk, live.headingOffsetDeg);
    }

    if (live.compassEnabled) {
      const h = wk !== null ? wk : (alpha !== null ? (360 - alpha) % 360 : null);
      if (h !== null && !Number.isNaN(h)) {
        live.compassHeading = Math.round(h);
        if (live.subtab === 'plan') renderCompassOnly();
      }
    }
  }

  function attachOrientationListeners() {
    window.addEventListener('deviceorientationabsolute', onArOrientation, true);
    window.addEventListener('deviceorientation', onArOrientation, true);
  }

  function detachOrientationIfUnused() {
    if (!live.sensorActive && !live.compassEnabled) {
      window.removeEventListener('deviceorientationabsolute', onArOrientation, true);
      window.removeEventListener('deviceorientation', onArOrientation, true);
    }
  }

  async function requestSensorPermissionIfNeeded() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        return res === 'granted';
      }
      return typeof DeviceOrientationEvent !== 'undefined';
    } catch (_) {
      return false;
    }
  }

  async function startLiveCamera() {
    if (live.cameraActive) {
      stopLiveCamera();
      return;
    }

    // iOS pusula/jiroskop iznini kullanıcı tıklaması içinde iste
    const sensorOk = await requestSensorPermissionIfNeeded();
    if (sensorOk) {
      live.sensorActive = true;
      live.sensorReceived = false;
      attachOrientationListeners();
    }

    const videoEl = document.getElementById('solarArVideo');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updateArControlsUI();
      toast('Bu cihazda arka kamera açılamadı — parmakla sürükleyerek kullanabilirsin');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      live.cameraStream = stream;
      live.cameraActive = true;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.play().catch(() => {});
      }
      const stage = document.getElementById('solarArStage');
      if (stage) stage.classList.add('camera-live');
      updateArControlsUI();
      startArLoop();
      toast('Canlı kamera açıldı — telefonu gökyüzüne doğrult');
    } catch (_) {
      live.cameraActive = false;
      updateArControlsUI();
      toast('Kamera izni verilmedi — 360° gökyüzü önizlemesinde devam');
    }
  }

  function stopLiveCamera() {
    if (live.cameraStream) {
      live.cameraStream.getTracks().forEach((t) => t.stop());
      live.cameraStream = null;
    }
    const videoEl = document.getElementById('solarArVideo');
    if (videoEl) videoEl.srcObject = null;
    live.cameraActive = false;
    live.sensorActive = false;
    live.sensorReceived = false;
    live.smoothBasis = null;
    live.targetBasis = null;
    detachOrientationIfUnused();
    const stage = document.getElementById('solarArStage');
    if (stage) stage.classList.remove('camera-live');
    if (live.fullscreen) toggleArFullscreen(false);
    updateArControlsUI();
  }

  function calibrateToRealSun() {
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const refMin = sState.dateIso === todayIso() ? nowMinutes() : sState.minute;
    const realSun = Solar.getSolarPosition(year, month, day, refMin, sState.lat, sState.lng, sState.tz);

    if (live.sensorActive && live.sensorReceived && live.smoothBasis) {
      const cur = basisToAzEl(live.smoothBasis);
      const delta = shortestAngleDelta(cur.az, realSun.azimuth);
      live.headingOffsetDeg = Math.round((live.headingOffsetDeg + delta) * 10) / 10;
      if (live.lastOrientation) {
        const o = live.lastOrientation;
        live.targetBasis = sensorBasis(o.alpha, o.beta, o.gamma, o.wk, live.headingOffsetDeg);
      }
      toast(`Pusula güneşe hizalandı (${live.headingOffsetDeg >= 0 ? '+' : ''}${Math.round(live.headingOffsetDeg)}°)`);
    } else {
      aimManualAtSun(refMin);
      toast('Kamera şu anki güneş konumuna çevrildi');
    }
  }

  function toggleArFullscreen(forceVal = null) {
    live.fullscreen = forceVal !== null ? forceVal : !live.fullscreen;
    const stage = document.getElementById('solarArStage');
    if (stage) stage.classList.toggle('ar-fullscreen', live.fullscreen);
    document.body.style.overflow = live.fullscreen ? 'hidden' : '';
    updateArControlsUI();
  }

  function updateArControlsUI() {
    const camBtn = document.getElementById('solarArCameraBtn');
    if (camBtn) {
      camBtn.textContent = live.cameraActive ? 'Kamerayı Kapat' : '📷 Canlı Kamerayı Aç';
      camBtn.classList.toggle('btn-danger-soft', live.cameraActive);
      camBtn.classList.toggle('btn-primary', !live.cameraActive);
    }

    const fsBtn = document.getElementById('solarArFullscreenBtn');
    if (fsBtn) fsBtn.textContent = live.fullscreen ? 'Çık ✕' : 'Tam Ekran';

    const modePill = document.getElementById('solarArModePill');
    if (modePill) {
      if (live.cameraActive && live.sensorReceived) {
        modePill.textContent = '● CANLI AR';
        modePill.classList.add('live-on');
      } else if (live.cameraActive) {
        modePill.textContent = '● KAMERA';
        modePill.classList.add('live-on');
      } else {
        modePill.textContent = 'ÖNİZLEME';
        modePill.classList.remove('live-on');
      }
    }
  }

  // ==================== AR CANVAS ÇİZİM MOTORU (60 FPS) ====================
  function projectSky(vec, basis, cx, cy, focal) {
    const z = dot(vec, basis.f);
    if (z <= 0.05) return null;
    const x = dot(vec, basis.r);
    const y = dot(vec, basis.u);
    return {
      x: cx + (x / z) * focal,
      y: cy - (y / z) * focal,
      z
    };
  }

  function drawPill(ctx, x, y, text, bg, fg, border = null, font = '600 11px ui-monospace, monospace') {
    ctx.save();
    ctx.font = font;
    const padX = 7;
    const h = 20;
    const w = ctx.measureText(text).width + padX * 2;
    const rx = x - w / 2;
    const ry = y - h / 2;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(rx, ry, w, h, 4);
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  function drawArrowHead(ctx, x, y, angleRad, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.75, -size * 0.62);
    ctx.lineTo(-size * 0.4, 0);
    ctx.lineTo(-size * 0.75, size * 0.62);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawArFrame() {
    const canvas = document.getElementById('solarArCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const cx = W / 2;
    const cy = H / 2;
    const focal = (Math.min(W, H) / 2) / Math.tan((56 * DEG) / 2);

    // Kamera yön basis vektörünü yumuşatarak al
    let basis;
    if (live.sensorActive && live.sensorReceived && live.targetBasis) {
      if (!live.smoothBasis) {
        live.smoothBasis = live.targetBasis;
      } else {
        const f = normalize(lerpVec(live.smoothBasis.f, live.targetBasis.f, 0.24));
        const u0 = normalize(lerpVec(live.smoothBasis.u, live.targetBasis.u, 0.24));
        const r = normalize(cross(f, u0));
        const u = normalize(cross(r, f));
        live.smoothBasis = { f, r, u };
      }
      basis = live.smoothBasis;
    } else {
      basis = manualBasis(live.manualAz, live.manualEl);
      live.smoothBasis = basis;
    }

    const look = basisToAzEl(basis);
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const selPos = Solar.getSolarPosition(year, month, day, sState.minute, sState.lat, sState.lng, sState.tz);
    const aimEl = document.getElementById('solarArAimReadout');
    if (aimEl) {
      const prefix = live.cameraActive && live.sensorReceived ? '● AR · ' : live.cameraActive ? '● KAM · ' : '';
      aimEl.textContent = `${prefix}Bakış: ${Math.round(look.az)}° ${Solar.azimuthToCompass(look.az, false)} · Güneş: ${Math.round(selPos.elevation)}°`;
      aimEl.classList.toggle('live-on', live.cameraActive);
    }

    ctx.clearRect(0, 0, W, H);

    // 1. Arka Plan (Kamera kapalıysa 3D gökyüzü/ufuk gradyanı + perspektif zemin ızgarası & silüet)
    if (!live.cameraActive) {
      const horizVec = projectSky(skyVec(look.az, 0), basis, cx, cy, focal);
      const horizY = horizVec ? horizVec.y : cy + Math.tan(look.el * DEG) * focal;
      const clampedStop = Math.max(0.05, Math.min(0.95, horizY / H));
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, '#0a1220');
      skyGrad.addColorStop(clampedStop, '#1c314e');
      skyGrad.addColorStop(Math.min(0.99, clampedStop + 0.015), '#131820');
      skyGrad.addColorStop(1, '#0b0e14');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      // Hafif ufuk silüeti
      ctx.beginPath();
      let silStarted = false;
      for (let azOff = -45; azOff <= 45; azOff += 3) {
        const az = Solar.normalizeDeg(look.az + azOff);
        const ridgeEl = Math.max(0, 1.4 + Math.sin(az * 0.14) * 1.1 + Math.cos(az * 0.31) * 0.6);
        const pr = projectSky(skyVec(az, ridgeEl), basis, cx, cy, focal);
        const pb = projectSky(skyVec(az, 0), basis, cx, cy, focal);
        if (pr && pb) {
          if (!silStarted) { ctx.moveTo(pr.x, pb.y + 4); silStarted = true; }
          ctx.lineTo(pr.x, pr.y);
        }
      }
      if (silStarted) {
        ctx.lineTo(W + 40, H);
        ctx.lineTo(-40, H);
        ctx.closePath();
        ctx.fillStyle = 'rgba(13, 18, 26, 0.72)';
        ctx.fill();
      }

      // Zemin perspektif ızgarası (0° altı)
      [-8, -18, -32].forEach((gEl) => {
        ctx.beginPath();
        let gDown = false;
        for (let az = 0; az <= 360; az += 8) {
          const pt = projectSky(skyVec(az, gEl), basis, cx, cy, focal);
          if (pt && pt.x > -100 && pt.x < W + 100 && pt.y > -40 && pt.y < H + 80) {
            if (!gDown) { ctx.moveTo(pt.x, pt.y); gDown = true; }
            else ctx.lineTo(pt.x, pt.y);
          } else {
            gDown = false;
          }
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      for (let az = 0; az < 360; az += 30) {
        const pTop = projectSky(skyVec(az, 0), basis, cx, cy, focal);
        const pBot = projectSky(skyVec(az, -32), basis, cx, cy, focal);
        if (pTop && pBot) {
          ctx.beginPath();
          ctx.moveTo(pTop.x, pTop.y);
          ctx.lineTo(pBot.x, pBot.y);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // 2. İnce Yükseklik Referans Yayları (+30°, +60°)
    [30, 60].forEach((elevDeg) => {
      ctx.beginPath();
      let penDown = false;
      for (let az = 0; az <= 360; az += 6) {
        const pt = projectSky(skyVec(az, elevDeg), basis, cx, cy, focal);
        if (pt && pt.x > -100 && pt.x < W + 100 && pt.y > -100 && pt.y < H + 100) {
          if (!penDown) { ctx.moveTo(pt.x, pt.y); penDown = true; }
          else ctx.lineTo(pt.x, pt.y);
        } else {
          penDown = false;
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 3. Ufuk Çizgisi (0°) + 15° Çentikler + Yön Etiketleri (K, KD, D, GD, G, GB, B, KB)
    ctx.beginPath();
    let hDown = false;
    for (let az = 0; az <= 360; az += 4) {
      const pt = projectSky(skyVec(az, 0), basis, cx, cy, focal);
      if (pt && pt.x > -120 && pt.x < W + 120 && pt.y > -120 && pt.y < H + 120) {
        if (!hDown) { ctx.moveTo(pt.x, pt.y); hDown = true; }
        else ctx.lineTo(pt.x, pt.y);
      } else {
        hDown = false;
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.52)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    const cardinals = [
      { az: 0, lbl: 'KUZEY', short: 'K', main: true },
      { az: 45, lbl: 'KD', short: 'KD', main: false },
      { az: 90, lbl: 'DOĞU', short: 'D', main: true },
      { az: 135, lbl: 'GD', short: 'GD', main: false },
      { az: 180, lbl: 'GÜNEY', short: 'G', main: true },
      { az: 225, lbl: 'GB', short: 'GB', main: false },
      { az: 270, lbl: 'BATI', short: 'B', main: true },
      { az: 315, lbl: 'KB', short: 'KB', main: false }
    ];
    for (let az = 0; az < 360; az += 15) {
      const p0 = projectSky(skyVec(az, 0), basis, cx, cy, focal);
      const p1 = projectSky(skyVec(az, az % 45 === 0 ? 2.4 : 1.2), basis, cx, cy, focal);
      if (p0 && p1 && p0.x > -20 && p0.x < W + 20 && p0.y > -20 && p0.y < H + 20) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = az % 45 === 0 ? 1.8 : 1;
        ctx.stroke();
      }
    }
    for (const c of cardinals) {
      const pt = projectSky(skyVec(c.az, -3.5), basis, cx, cy, focal);
      if (pt && pt.x > 16 && pt.x < W - 16 && pt.y > 40 && pt.y < H - 46) {
        drawPill(
          ctx,
          pt.x,
          pt.y,
          c.main ? `${c.lbl} ${c.az}°` : `${c.short} ${c.az}°`,
          'rgba(10, 14, 22, 0.72)',
          c.az === 0 ? '#f87171' : c.main ? '#ffffff' : '#cbd5e1',
          'rgba(255,255,255,0.18)',
          c.main ? '700 10.5px ui-monospace, monospace' : '600 9.5px ui-monospace, monospace'
        );
      }
    }

    // 4. GÜNLÜK GÜNEŞ YOLU YAYI + GİDİŞ YÖNÜ OKLARI
    ensureDayCache();
    const summary = live.cachedSummary;
    const pathPts = live.cachedPathPts;

    const projPath = pathPts.map((pt) => ({
      ...pt,
      scr: projectSky(pt.vec, basis, cx, cy, focal)
    }));

    // Kontrast dış hat + faz renkli güneş yolu (Mavi Saat: mavi, Altın Saat: kehribar, Gün Işığı: altın)
    ctx.beginPath();
    let started = false;
    for (const p of projPath) {
      if (p.scr && p.scr.x > -180 && p.scr.x < W + 180 && p.scr.y > -180 && p.scr.y < H + 180) {
        if (!started) { ctx.moveTo(p.scr.x, p.scr.y); started = true; }
        else ctx.lineTo(p.scr.x, p.scr.y);
      } else {
        started = false;
      }
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    for (let i = 0; i < projPath.length - 1; i++) {
      const p0 = projPath[i];
      const p1 = projPath[i + 1];
      if (!p0.scr || !p1.scr) continue;
      if ((p0.scr.x < -180 && p1.scr.x < -180) || (p0.scr.x > W + 180 && p1.scr.x > W + 180)) continue;
      const avgEl = (p0.elevation + p1.elevation) / 2;
      ctx.beginPath();
      ctx.moveTo(p0.scr.x, p0.scr.y);
      ctx.lineTo(p1.scr.x, p1.scr.y);
      ctx.strokeStyle = avgEl <= 0 ? '#38bdf8' : avgEl <= 6 ? '#fb923c' : '#f5b71a';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Seçili saatten sonraki +1 saatlik GİDİŞ YÖNÜ vurgusu
    const nextArcPts = projPath.filter((p) => p.minute >= sState.minute && p.minute <= sState.minute + 70 && p.scr);
    if (nextArcPts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(nextArcPts[0].scr.x, nextArcPts[0].scr.y);
      for (let i = 1; i < nextArcPts.length; i++) {
        ctx.lineTo(nextArcPts[i].scr.x, nextArcPts[i].scr.y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Yol boyunca GİDİŞ YÖNÜ OKLARI (Her 50 dakikada bir net altın ok)
    for (let i = 1; i < projPath.length - 1; i++) {
      if (i % 5 !== 2) continue;
      const prev = projPath[i - 1].scr;
      const cur = projPath[i].scr;
      const next = projPath[i + 1].scr;
      if (!prev || !cur || !next) continue;
      if (cur.x < 14 || cur.x > W - 14 || cur.y < 44 || cur.y > H - 52) continue;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      if (Math.hypot(dx, dy) < 2) continue;
      drawArrowHead(ctx, cur.x, cur.y, Math.atan2(dy, dx), 7.5, '#fde047');
    }

    // 5. SAAT NOKTALARI VE SAAT ETİKETLERİ (Çarpışmasız: 2 saatte bir & aktif saatten >=45 dk uzak)
    for (const hm of live.cachedHourPts) {
      if (hm.hour % 2 !== 0) continue;
      if (Math.abs(hm.minute - sState.minute) < 45) continue;
      const pt = projectSky(hm.vec, basis, cx, cy, focal);
      if (!pt || pt.x < 24 || pt.x > W - 24 || pt.y < 42 || pt.y > H - 54) continue;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#f5b71a';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      drawPill(
        ctx,
        pt.x,
        pt.y - 16,
        hm.label,
        'rgba(10, 14, 22, 0.78)',
        '#f8fafc',
        'rgba(245, 183, 26, 0.45)',
        '700 9.5px ui-monospace, monospace'
      );
    }

    // 6. GÜNDOĞUMU & GÜNBATIMI UFUK İŞARETLERİ
    if (summary.sunriseAzimuth !== null) {
      const pr = projectSky(skyVec(summary.sunriseAzimuth, 1.5), basis, cx, cy, focal);
      if (pr && pr.x > 30 && pr.x < W - 30 && pr.y > 42 && pr.y < H - 54) {
        drawPill(ctx, pr.x, pr.y - 14, `DOĞUŞ ${Solar.formatMinutes(summary.sunriseMin)}`, 'rgba(180, 83, 9, 0.92)', '#fffbeb', '#fbbf24', '700 10px ui-monospace, monospace');
      }
    }
    if (summary.sunsetAzimuth !== null) {
      const ps = projectSky(skyVec(summary.sunsetAzimuth, 1.5), basis, cx, cy, focal);
      if (ps && ps.x > 30 && ps.x < W - 30 && ps.y > 42 && ps.y < H - 54) {
        drawPill(ctx, ps.x, ps.y - 14, `BATIŞ ${Solar.formatMinutes(summary.sunsetMin)}`, 'rgba(185, 28, 28, 0.92)', '#fef2f2', '#f87171', '700 10px ui-monospace, monospace');
      }
    }

    // 7. AKTİF SEÇİLİ SAATTE GÜNEŞ + YÖN OKU + EKRAN DIŞI REHBERİ
    const selVec = skyVec(selPos.azimuth, selPos.elevation);
    const selScr = projectSky(selVec, basis, cx, cy, focal);

    // Eğer bugünse ve kaydırıcı şu anki saatten >= 60 dk uzaksa, gerçek "ŞİMDİ" güneşini küçük göster
    if (sState.dateIso === todayIso() && Math.abs(sState.minute - nowMinutes()) >= 60) {
      const nowPos = Solar.getSolarPosition(year, month, day, nowMinutes(), sState.lat, sState.lng, sState.tz);
      if (nowPos.elevation > -4) {
        const ns = projectSky(skyVec(nowPos.azimuth, nowPos.elevation), basis, cx, cy, focal);
        if (ns && ns.x > 16 && ns.x < W - 16 && ns.y > 42 && ns.y < H - 52) {
          ctx.beginPath();
          ctx.arc(ns.x, ns.y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          drawPill(ctx, ns.x, ns.y + 16, 'ŞİMDİ', 'rgba(15,23,42,0.75)', '#cbd5e1', 'rgba(255,255,255,0.3)', '700 9px ui-monospace, monospace');
        }
      }
    }

    const sunInFrame = selScr && selScr.x >= 20 && selScr.x <= W - 20 && selScr.y >= 46 && selScr.y <= H - 58;
    if (sunInFrame) {
      const sunCol = selPos.phaseKey === 'BLUE' ? '#60a5fa' : selPos.phaseKey === 'GOLDEN' ? '#fb923c' : '#f5b71a';

      // Gidiş yönünü gösteren büyük net ok (seçili saatten +20 dk ilerisine)
      const aheadPos = Solar.getSolarPosition(year, month, day, sState.minute + 20, sState.lat, sState.lng, sState.tz);
      const aheadScr = projectSky(skyVec(aheadPos.azimuth, aheadPos.elevation), basis, cx, cy, focal);
      if (aheadScr) {
        const vx = aheadScr.x - selScr.x;
        const vy = aheadScr.y - selScr.y;
        const vLen = Math.hypot(vx, vy);
        if (vLen > 4) {
          const ux = vx / vLen;
          const uy = vy / vLen;
          const tipX = selScr.x + ux * 34;
          const tipY = selScr.y + uy * 34;
          ctx.beginPath();
          ctx.moveTo(selScr.x + ux * 15, selScr.y + uy * 15);
          ctx.lineTo(tipX, tipY);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.6;
          ctx.stroke();
          drawArrowHead(ctx, tipX, tipY, Math.atan2(uy, ux), 8, '#ffffff');
        }
      }

      // Güneş ışın halkası + disk
      ctx.save();
      ctx.strokeStyle = sunCol;
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(selScr.x + Math.cos(ang) * 14, selScr.y + Math.sin(ang) * 14);
        ctx.lineTo(selScr.x + Math.cos(ang) * 20, selScr.y + Math.sin(ang) * 20);
        ctx.stroke();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(selScr.x, selScr.y, 17, 0, Math.PI * 2);
      ctx.fillStyle = selPos.phaseKey === 'GOLDEN' ? 'rgba(251, 146, 60, 0.28)' : 'rgba(245, 183, 26, 0.28)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(selScr.x, selScr.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = sunCol;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      drawPill(
        ctx,
        selScr.x,
        selScr.y + 24,
        `${Solar.formatMinutes(sState.minute)} · ${Math.round(selPos.azimuth)}° ${selPos.compass}`,
        'rgba(10, 14, 22, 0.88)',
        '#f5b71a',
        '#f5b71a',
        '700 10.5px ui-monospace, monospace'
      );
    } else {
      // Güneş ekran dışındaysa kenarda net yön rehberi göster!
      const dAz = Math.round(shortestAngleDelta(look.az, selPos.azimuth));
      const dEl = Math.round(selPos.elevation - look.el);
      let guideText;
      let gx = cx;
      let gy = cy;
      if (Math.abs(dAz) > 22) {
        if (dAz > 0) {
          guideText = `Güneş Sağda ${Math.abs(dAz)}° →`;
          gx = W - 92;
        } else {
          guideText = `← Güneş Solda ${Math.abs(dAz)}°`;
          gx = 92;
        }
        gy = Math.max(66, Math.min(H - 80, cy - dEl * 2.2));
      } else {
        guideText = dEl > 0 ? `↑ Güneş Yukarıda (+${dEl}°)` : `↓ Güneş Aşağıda (${dEl}°)`;
        gx = cx;
        gy = dEl > 0 ? 64 : H - 82;
      }
      drawPill(ctx, gx, gy, guideText, 'rgba(245, 183, 26, 0.94)', '#111827', '#ffffff', '700 11px ui-monospace, monospace');
    }

    // 8. Orta Nişangah Artısı
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    ctx.restore();
  }

  function startArLoop() {
    if (live.rafId) return;
    const tick = () => {
      const solarTab = document.getElementById('tab-solar');
      if (!solarTab || !solarTab.classList.contains('active') || live.subtab !== 'camera') {
        live.rafId = null;
        return;
      }
      drawArFrame();
      live.rafId = requestAnimationFrame(tick);
    };
    live.rafId = requestAnimationFrame(tick);
  }

  function stopArLoop() {
    if (live.rafId) {
      cancelAnimationFrame(live.rafId);
      live.rafId = null;
    }
  }

  // ==================== 2D KUŞBAKIŞI GÜNEŞ PUSULASI SVG (SAAT & CEPHE SEKMESİ) ====================
  function polarToXY(cx, cy, r, degFromNorth) {
    const rad = (degFromNorth - 90) * DEG;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function elevToRadius(elev, maxR) {
    return maxR * (1 - Math.max(0, Math.min(90, elev)) / 90);
  }

  function buildCompassSVG(pos, summary, winInfo) {
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 100;
    const rot = live.compassEnabled ? -live.compassHeading : 0;

    let ticks = '';
    for (let deg = 0; deg < 360; deg += 15) {
      const major = deg % 45 === 0;
      const p1 = polarToXY(cx, cy, maxR, deg);
      const p2 = polarToXY(cx, cy, maxR + (major ? 6 : 3), deg);
      ticks += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="var(--border-strong)" stroke-width="${major ? 1.5 : 1}"/>`;
    }

    const dirs = [
      { d: 0, t: 'K', main: true }, { d: 45, t: 'KD', main: false },
      { d: 90, t: 'D', main: true }, { d: 135, t: 'GD', main: false },
      { d: 180, t: 'G', main: true }, { d: 225, t: 'GB', main: false },
      { d: 270, t: 'B', main: true }, { d: 315, t: 'KB', main: false }
    ];
    let dirLabels = '';
    for (const item of dirs) {
      const p = polarToXY(cx, cy, maxR + 18, item.d);
      const fill = item.d === 0 ? 'var(--danger)' : item.main ? 'var(--text)' : 'var(--text-dim)';
      dirLabels += `<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" fill="${fill}" font-size="${item.main ? 11.5 : 9}" font-weight="${item.main ? 800 : 600}" font-family="var(--font-mono)">${item.t}</text>`;
    }

    const wStart = polarToXY(cx, cy, maxR, winInfo.facingDeg - 65);
    const wEnd = polarToXY(cx, cy, maxR, winInfo.facingDeg + 65);
    const winWedge = `
      <path d="M ${cx} ${cy} L ${wStart.x.toFixed(1)} ${wStart.y.toFixed(1)} A ${maxR} ${maxR} 0 0 1 ${wEnd.x.toFixed(1)} ${wEnd.y.toFixed(1)} Z"
        fill="${winInfo.hittingNow ? 'rgba(245, 183, 26, 0.14)' : 'rgba(56, 189, 248, 0.08)'}"
        stroke="${winInfo.hittingNow ? 'var(--accent)' : 'var(--info)'}" stroke-opacity="0.45" stroke-width="1"/>
    `;

    let riseSetLines = '';
    if (summary.sunriseAzimuth !== null) {
      const pr = polarToXY(cx, cy, maxR, summary.sunriseAzimuth);
      riseSetLines += `<line x1="${cx}" y1="${cy}" x2="${pr.x.toFixed(1)}" y2="${pr.y.toFixed(1)}" stroke="#f59e0b" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.75"/>`;
    }
    if (summary.sunsetAzimuth !== null) {
      const ps = polarToXY(cx, cy, maxR, summary.sunsetAzimuth);
      riseSetLines += `<line x1="${cx}" y1="${cy}" x2="${ps.x.toFixed(1)}" y2="${ps.y.toFixed(1)}" stroke="#ef4444" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.75"/>`;
    }

    let arcPath = '';
    if (summary.arcPoints.length > 1) {
      const pts = summary.arcPoints.map((pt) => polarToXY(cx, cy, elevToRadius(pt.elevation, maxR), pt.azimuth));
      arcPath = `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`;
    }

    let sunMarker = '';
    if (pos.elevation >= -6) {
      const sp = polarToXY(cx, cy, elevToRadius(Math.max(0, pos.elevation), maxR), pos.azimuth);
      const shadowR = Math.min(maxR * 0.7, pos.shadowRatio ? Math.min(maxR * 0.68, 24 * pos.shadowRatio) : 40);
      const shPt = polarToXY(cx, cy, shadowR, pos.shadowAzimuth);
      const sunColor = pos.phaseKey === 'BLUE' ? '#60a5fa' : pos.phaseKey === 'GOLDEN' ? '#fb923c' : '#f5b71a';
      sunMarker = `
        ${pos.elevation > 0 ? `<line x1="${cx}" y1="${cy}" x2="${shPt.x.toFixed(1)}" y2="${shPt.y.toFixed(1)}" stroke="var(--text-dim)" stroke-width="2.6" stroke-linecap="round" opacity="0.65"/>` : ''}
        <line x1="${sp.x.toFixed(1)}" y1="${sp.y.toFixed(1)}" x2="${cx}" y2="${cy}" stroke="${sunColor}" stroke-width="2"/>
        <circle cx="${sp.x.toFixed(1)}" cy="${sp.y.toFixed(1)}" r="5.5" fill="${sunColor}" stroke="var(--bg)" stroke-width="1.5"/>
      `;
    }

    return `
      <svg class="sun-compass-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="2D güneş pusulası">
        <g transform="rotate(${rot.toFixed(1)} ${cx} ${cy})">
          <circle cx="${cx}" cy="${cy}" r="${maxR}" fill="var(--input-bg)" stroke="var(--border-strong)" stroke-width="1.5"/>
          <circle cx="${cx}" cy="${cy}" r="${(maxR * 2 / 3).toFixed(1)}" fill="none" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>
          <circle cx="${cx}" cy="${cy}" r="${(maxR / 3).toFixed(1)}" fill="none" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>
          ${ticks}${winWedge}${riseSetLines}${arcPath}${sunMarker}
          <circle cx="${cx}" cy="${cy}" r="3" fill="var(--text)"/>
          ${dirLabels}
        </g>
        ${live.compassEnabled ? `<polygon points="${cx},4 ${cx - 5},13 ${cx + 5},13" fill="var(--accent)"/>` : ''}
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
      if (!silent) toast('Canlı bulut ve rüzgar güncellendi');
    } catch (_) {
      live.weatherError = 'Canlı hava verisi alınamadı. Bulut kronometresi ve AR güneş yolu çevrimdışı çalışır.';
      if (!silent) toast('İnternet yok — çevrimdışı modda devam');
    } finally {
      live.weatherLoading = false;
      renderCloudWeatherPanel();
      renderCloudTimerCard();
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
    live.tTarget = now + elapsedMs;
    live.estDurationSec = Math.round(elapsedMs / 1000);
    live.cloudPhase = 'approach_countdown';
    ensureTick();
    renderCloudTimerCard();
    toast(`Tahmini buluta giriş: ${live.estDurationSec} sn`);
  }

  function markEnteredCloud(presetEstSec = null) {
    const now = Date.now();
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
    live.tTarget = now + elapsedMs;
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
      sState.cloudHistory.unshift({ time: formatClock(now).slice(0, 5), cloudSec, sunOpenSec: null });
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
    const speedMs = live.weather?.windSpeedMs > 1 ? live.weather.windSpeedMs : 6.0;
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

    let countdownBarHtml = '';
    if (live.cloudPhase === 'approach_measuring') {
      statusBadge = 'YAKLAŞMA ÖLÇÜLÜYOR';
      statusCls = 'tag-caution';
      bigMain = formatSec((now - live.tStart) / 1000);
      mainSub = 'Bulutun ön ucu, güneşle arasındaki mesafenin TAM YARISINA gelince bas:';
      primaryActions = `
        <button class="btn btn-primary btn-sm" id="ctApproachHalf">2. Yarıya Geldi (Geri Say)</button>
        <button class="btn btn-soft btn-sm" id="ctEnterCloud">Şimdi Buluta Girdi</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">İptal</button>
      `;
    } else if (live.cloudPhase === 'approach_countdown') {
      const remSec = (live.tTarget - now) / 1000;
      const totalMs = Math.max(1000, live.tTarget - live.tHalf);
      const progPct = Math.min(100, Math.max(0, ((now - live.tHalf) / totalMs) * 100));
      countdownBarHtml = `<div class="bar-track" style="margin-top:8px;"><div class="bar-fill ${remSec <= 10 ? 'DANGER' : 'CAUTION'}" style="width:${progPct.toFixed(0)}%;"></div></div>`;
      statusBadge = remSec <= 10 ? 'BULUTA GİRİYOR!' : 'BULUTA GERİ SAYIM';
      statusCls = remSec <= 10 ? 'tag-danger' : 'tag-caution';
      bigMain = remSec > 0 ? `-${formatSec(remSec)}` : `+${formatSec(-remSec)}`;
      mainSub = remSec > 0
        ? `Tahmini buluta giriş saati: ${formatClock(live.tTarget)}`
        : 'Tahmini giriş doldu — buluta girdiyse aşağıdan işaretle:';
      primaryActions = `
        <button class="btn btn-primary btn-sm" id="ctEnterCloud">Güneş Buluta Girdi</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">Sıfırla</button>
      `;
    } else if (live.cloudPhase === 'in_cloud_measuring') {
      statusBadge = 'GÜNEŞ BULUTTA';
      statusCls = 'tag-danger';
      bigMain = formatSec((now - live.tStart) / 1000);
      mainSub = 'Bulutun ortası güneşe gelince "Yarısında"ya bas → çıkış geri sayımı başlasın:';
      primaryActions = `
        <button class="btn btn-primary btn-sm" id="ctCloudHalf">Bulut Yarısında (Çıkış Tahmini)</button>
        <button class="btn btn-safe btn-sm" id="ctExitCloud">Güneş Çıktı!</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">Sıfırla</button>
      `;
    } else if (live.cloudPhase === 'in_cloud_countdown') {
      const elSec = (now - live.tStart) / 1000;
      const remSec = (live.tTarget - now) / 1000;
      const totalMs = Math.max(1000, live.tTarget - live.tStart);
      const progPct = Math.min(100, Math.max(0, ((now - live.tStart) / totalMs) * 100));
      countdownBarHtml = `<div class="bar-track" style="margin-top:8px;"><div class="bar-fill ${remSec <= 12 ? 'SAFE' : 'CAUTION'}" style="width:${progPct.toFixed(0)}%;"></div></div>`;
      statusBadge = remSec <= 12 ? 'GÜNEŞ ÇIKIYOR!' : 'ÇIKIŞA GERİ SAYIM';
      statusCls = remSec <= 12 ? 'tag-safe' : 'tag-caution';
      bigMain = remSec > 0 ? `-${formatSec(remSec)}` : `+${formatSec(-remSec)}`;
      mainSub = remSec > 0
        ? `Bulutta geçen: ${formatSec(elSec)} • Tahmini çıkış: ${formatClock(live.tTarget)}`
        : `Bulutta geçen: ${formatSec(elSec)} — Güneş açtığında işaretle:`;
      primaryActions = `
        <button class="btn btn-safe btn-sm" id="ctExitCloud">Güneş Buluttan Çıktı!</button>
        <button class="btn btn-danger-soft btn-sm" id="ctReset">Sıfırla</button>
      `;
    } else if (live.cloudPhase === 'sun_open') {
      statusBadge = 'GÜNEŞ AÇIK';
      statusCls = 'tag-safe';
      bigMain = formatSec((now - live.tStart) / 1000);
      mainSub = avgOpen
        ? `Açık güneş devam ediyor (Ort: ${formatSec(avgOpen)} açık / ${formatSec(avgCloud || 0)} bulut).`
        : 'Açık güneş süresi ölçülüyor. Yeni bulut yaklaşıyorsa başlat:';
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
        <span><strong>Set Ritmi (${sState.cloudHistory.length}):</strong> Ort. Bulut <strong>${formatSec(avgCloud)}</strong>${avgOpen ? ` • Açık <strong>${formatSec(avgOpen)}</strong>` : ''}</span>
        <button class="len-chip" id="ctClearHist">Temizle</button>
      </div>
    ` : '';

    box.innerHTML = `
      <div class="cloud-timer-display">
        <div style="width:100%; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
          <div>
            <span class="tag ${statusCls} mono" style="font-size:11px; letter-spacing:0.05em;">${statusBadge}</span>
            <div class="cloud-big-clock mono">${bigMain}</div>
          </div>
          <div style="flex:1; min-width:170px; font-size:12px; color:var(--text-muted);">${esc(mainSub)}</div>
        </div>
        ${countdownBarHtml ? `<div style="width:100%;">${countdownBarHtml}</div>` : ''}
      </div>
      <div style="display:flex; gap:7px; flex-wrap:wrap; margin-top:10px;">${primaryActions}</div>
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
    bind('ctClearHist', () => { sState.cloudHistory = []; saveSolarState(); renderCloudTimerCard(); });
    box.querySelectorAll('[data-cloud-est]').forEach((b) => {
      b.addEventListener('click', () => {
        const sec = Number(b.dataset.cloudEst);
        markEnteredCloud(sec);
        toast(`Bulut çıkış geri sayımı (~${formatSec(sec)})`);
      });
    });

    renderCameraCloudBar(now, estSmall, estMed, estLarge);
  }

  function renderCameraCloudBar(now, estSmall, estMed, estLarge) {
    const camBar = document.getElementById('solarCameraCloudBar');
    if (!camBar) return;

    let statusHtml = '';
    let actionsHtml = '';
    let toneCls = '';

    if (live.cloudPhase === 'idle') {
      statusHtml = `
        <div class="scc-status">
          <span class="tag mono">☁️ Bulut:</span>
        </div>
      `;
      actionsHtml = `
        <button type="button" class="len-chip mono" data-cam-cloud="approach">Yaklaşıyor</button>
        <button type="button" class="len-chip mono" data-cam-est="${estSmall}">Küçük</button>
        <button type="button" class="len-chip mono" data-cam-est="${estMed}">Orta</button>
        <button type="button" class="len-chip mono" data-cam-est="${estLarge}">Büyük</button>
      `;
    } else if (live.cloudPhase === 'approach_measuring') {
      toneCls = 'is-caution';
      const el = formatSec((now - live.tStart) / 1000);
      statusHtml = `<div class="scc-status"><span class="tag tag-caution mono">☀️ YAKLAŞIYOR</span><strong class="mono scc-clock">${el}</strong></div>`;
      actionsHtml = `
        <button type="button" class="btn btn-primary btn-xs" data-cam-cloud="appHalf">Yarı Yolda</button>
        <button type="button" class="btn btn-soft btn-xs" data-cam-cloud="enter">Buluta Girdi</button>
        <button type="button" class="btn btn-danger-soft btn-xs" data-cam-cloud="reset" aria-label="Sıfırla">✕</button>
      `;
    } else if (live.cloudPhase === 'approach_countdown') {
      const remSec = (live.tTarget - now) / 1000;
      toneCls = remSec <= 10 ? 'is-danger' : 'is-caution';
      const tTxt = remSec > 0 ? `-${formatSec(remSec)}` : `+${formatSec(-remSec)}`;
      statusHtml = `<div class="scc-status"><span class="tag ${remSec <= 10 ? 'tag-danger' : 'tag-caution'} mono">☀️ GİRİŞE</span><strong class="mono scc-clock">${tTxt}</strong></div>`;
      actionsHtml = `
        <button type="button" class="btn btn-primary btn-xs" data-cam-cloud="enter">Buluta Girdi</button>
        <button type="button" class="btn btn-danger-soft btn-xs" data-cam-cloud="reset" aria-label="Sıfırla">✕</button>
      `;
    } else if (live.cloudPhase === 'in_cloud_measuring') {
      toneCls = 'is-danger';
      const el = formatSec((now - live.tStart) / 1000);
      statusHtml = `<div class="scc-status"><span class="tag tag-danger mono">☁️ BULUTTA</span><strong class="mono scc-clock">${el}</strong></div>`;
      actionsHtml = `
        <button type="button" class="btn btn-primary btn-xs" data-cam-cloud="cloudHalf">Yarısında</button>
        <button type="button" class="btn btn-safe btn-xs" data-cam-cloud="exit">Güneş Çıktı</button>
        <button type="button" class="btn btn-danger-soft btn-xs" data-cam-cloud="reset" aria-label="Sıfırla">✕</button>
      `;
    } else if (live.cloudPhase === 'in_cloud_countdown') {
      const remSec = (live.tTarget - now) / 1000;
      toneCls = remSec <= 12 ? 'is-safe' : 'is-caution';
      const tTxt = remSec > 0 ? `-${formatSec(remSec)}` : `+${formatSec(-remSec)}`;
      statusHtml = `<div class="scc-status"><span class="tag ${remSec <= 12 ? 'tag-safe' : 'tag-caution'} mono">☁️ ÇIKIŞA</span><strong class="mono scc-clock">${tTxt}</strong></div>`;
      actionsHtml = `
        <button type="button" class="btn btn-safe btn-xs" data-cam-cloud="exit">Güneş Çıktı</button>
        <button type="button" class="btn btn-danger-soft btn-xs" data-cam-cloud="reset" aria-label="Sıfırla">✕</button>
      `;
    } else if (live.cloudPhase === 'sun_open') {
      toneCls = 'is-safe';
      const el = formatSec((now - live.tStart) / 1000);
      statusHtml = `<div class="scc-status"><span class="tag tag-safe mono">☀️ GÜNEŞ AÇIK</span><strong class="mono scc-clock">${el}</strong></div>`;
      actionsHtml = `
        <button type="button" class="btn btn-primary btn-xs" data-cam-cloud="approach">Yaklaşıyor</button>
        <button type="button" class="btn btn-soft btn-xs" data-cam-cloud="enter">Buluta Girdi</button>
        <button type="button" class="btn btn-danger-soft btn-xs" data-cam-cloud="reset" aria-label="Durdur">✕</button>
      `;
    }

    camBar.className = `solar-cam-cloud-bar ${toneCls}`;
    camBar.innerHTML = `${statusHtml}<div class="scc-actions">${actionsHtml}</div>`;

    camBar.querySelectorAll('[data-cam-cloud]').forEach((b) => {
      b.addEventListener('click', () => {
        const act = b.dataset.camCloud;
        if (act === 'approach') startApproachMeasure();
        else if (act === 'appHalf') markApproachHalfway();
        else if (act === 'enter') markEnteredCloud(null);
        else if (act === 'cloudHalf') markCloudHalfway();
        else if (act === 'exit') markExitedCloud();
        else if (act === 'reset') resetCloudTimer();
      });
    });
    camBar.querySelectorAll('[data-cam-est]').forEach((b) => {
      b.addEventListener('click', () => {
        const sec = Number(b.dataset.camEst);
        markEnteredCloud(sec);
        toast(`Bulut çıkış geri sayımı (~${formatSec(sec)})`);
      });
    });
  }

  function renderCloudWeatherPanel() {
    const el = document.getElementById('cloudWeatherBody');
    if (!el) return;

    if (live.weatherLoading) {
      el.innerHTML = `<div class="empty-box" style="padding:16px;">Canlı bulut ve rüzgar verisi alınıyor...</div>`;
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
    let riskAdvice = 'Kesintisiz direkt güneş.';
    if (w.cloudLow >= 75 || w.cloudTotal >= 85) {
      riskLabel = 'KAPALI / YUMUŞAK IŞIK';
      riskCls = 'tag-safe';
      riskAdvice = 'Güneş yoğun bulut arkasında sabit kalır; doğal dev softbox etkisi.';
    } else if (w.cloudLow >= 25 || (w.cloudTotal >= 30 && w.cloudTotal < 85)) {
      riskLabel = 'PARÇALI — SIK KESİNTİ RİSKİ!';
      riskCls = 'tag-danger';
      riskAdvice = `Alçak bulutlar %${w.cloudLow} ve ${w.windSpeedKmh} km/s hızla ${w.driftToCompass} yönüne akıyor.`;
    }

    el.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="tag ${riskCls} mono">${riskLabel}</span>
        <span class="mono" style="font-size:11px; color:var(--text-dim);">Güncellendi: ${w.fetchedAt}</span>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">${esc(riskAdvice)}</div>
      <div class="cloud-layers-grid mono">
        <div class="cloud-layer-box"><span class="strip-k">Alçak (Kesen)</span><strong style="color:${w.cloudLow >= 25 ? 'var(--caution)' : 'var(--text)'};">%${w.cloudLow}</strong></div>
        <div class="cloud-layer-box"><span class="strip-k">Orta Bulut</span><strong>%${w.cloudMid}</strong></div>
        <div class="cloud-layer-box"><span class="strip-k">Yüksek (İnce)</span><strong>%${w.cloudHigh}</strong></div>
        <div class="cloud-layer-box"><span class="strip-k">Bulut Rüzgarı</span><strong style="color:var(--info);">${w.windSpeedKmh} km/s → ${w.driftToCompass}</strong></div>
      </div>
      <div class="cloud-hourly-strip mono">
        ${w.hourly.map((h) => {
          const barCol = h.low >= 70 ? 'var(--text-muted)' : h.low >= 25 ? 'var(--caution)' : 'var(--safe)';
          return `
            <div class="cloud-hour-col">
              <div class="cloud-hour-bar-wrap"><div class="cloud-hour-bar" style="height:${Math.max(8, h.total)}%; background:${barCol};"></div></div>
              <div style="font-size:11px; font-weight:700;">%${h.total}</div>
              <div style="font-size:10px; color:var(--text-dim);">${h.hour}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ==================== 2D PUSULA & GPS ====================
  async function toggle2DCompass() {
    if (live.compassEnabled) {
      live.compassEnabled = false;
      detachOrientationIfUnused();
      renderSolarTab();
      toast('2D pusula kapatıldı');
      return;
    }
    const ok = await requestSensorPermissionIfNeeded();
    if (!ok) {
      toast('Pusula izni alınamadı');
      return;
    }
    live.compassEnabled = true;
    attachOrientationListeners();
    renderSolarTab();
    toast('Canlı 2D pusula açıldı');
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
        aimManualAtSun();
        renderSolarTab();
        fetchLiveCloudData(true);
        toast('Set GPS konumu ayarlandı');
      },
      () => toast('GPS izni alınamadı — listeden şehir seçebilirsiniz'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // ==================== GÜNÜ OYNAT ANİMASYONU ====================
  function stopPlayDay() {
    if (live.playDayTimer) {
      clearInterval(live.playDayTimer);
      live.playDayTimer = null;
    }
    if (live.playingDay) {
      live.playingDay = false;
      updatePlayBtnUI();
    }
  }

  function updatePlayBtnUI() {
    const playBtn = document.getElementById('solarPlayDayBtn');
    if (playBtn) {
      playBtn.classList.toggle('active', live.playingDay);
      playBtn.textContent = live.playingDay ? '⏸ Durdur' : '▶ Oynat';
    }
  }

  function togglePlayDay() {
    if (live.playingDay) {
      stopPlayDay();
      return;
    }
    ensureDayCache();
    const startMin = Math.max(300, Math.floor((live.cachedSummary?.sunriseMin || 390) - 20));
    const endMin = Math.min(1320, Math.ceil((live.cachedSummary?.sunsetMin || 1110) + 20));
    if (sState.minute < startMin || sState.minute >= endMin - 5) {
      sState.minute = startMin;
    }
    live.playingDay = true;
    updatePlayBtnUI();

    const stepMin = Math.max(5, Math.round((endMin - startMin) / 100));
    live.playDayTimer = setInterval(() => {
      sState.minute += stepMin;
      if (sState.minute >= endMin) {
        sState.minute = endMin;
        if (!live.sensorActive) aimManualAtSun();
        renderSolarTab();
        stopPlayDay();
        return;
      }
      if (!live.sensorActive) aimManualAtSun();
      renderSolarTab();
    }, 80);
  }

  // ==================== ALT SEKME GEÇİŞİ & ANA RENDER ====================
  function setSolarSubtab(sub) {
    stopPlayDay();
    live.subtab = sub;
    document.querySelectorAll('[data-solar-subtab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.solarSubtab === sub);
    });
    const camPanel = document.getElementById('solar-subtab-camera');
    const cldPanel = document.getElementById('solar-subtab-cloud');
    const plnPanel = document.getElementById('solar-subtab-plan');
    if (camPanel) camPanel.style.display = sub === 'camera' ? 'block' : 'none';
    if (cldPanel) cldPanel.style.display = sub === 'cloud' ? 'block' : 'none';
    if (plnPanel) plnPanel.style.display = sub === 'plan' ? 'block' : 'none';

    if (sub === 'camera') {
      startArLoop();
      drawArFrame();
    } else {
      stopArLoop();
      if (live.cameraActive) stopLiveCamera();
    }
  }

  function renderCompassOnly() {
    ensureDayCache();
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const pos = Solar.getSolarPosition(year, month, day, sState.minute, sState.lat, sState.lng, sState.tz);
    const winInfo = Solar.getWindowSunWindow(year, month, day, sState.lat, sState.lng, sState.tz, sState.windowFacing, sState.minute);
    const el = document.getElementById('solarCompassWrap');
    if (el) el.innerHTML = buildCompassSVG(pos, live.cachedSummary, winInfo);
  }

  function renderSolarTab() {
    const rootEl = document.getElementById('tab-solar');
    if (!rootEl) return;

    ensureDayCache();
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const pos = Solar.getSolarPosition(year, month, day, sState.minute, sState.lat, sState.lng, sState.tz);
    const summary = live.cachedSummary;
    const winInfo = Solar.getWindowSunWindow(year, month, day, sState.lat, sState.lng, sState.tz, sState.windowFacing, sState.minute);

    const citySel = document.getElementById('solarCitySelect');
    if (citySel && citySel.options.length === 0) {
      citySel.innerHTML = Solar.TR_CITIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') +
        `<option value="gps">GPS Konumu</option>`;
    }
    if (citySel) citySel.value = sState.cityId;

    const dateInp = document.getElementById('solarDateInput');
    if (dateInp && document.activeElement !== dateInp) dateInp.value = sState.dateIso;

    const timeStr = Solar.formatMinutes(sState.minute);
    const slider = document.getElementById('solarTimeSlider');
    if (slider) slider.value = sState.minute;
    const fsSlider = document.getElementById('solarArFsSlider');
    if (fsSlider) fsSlider.value = sState.minute;
    const fsTime = document.getElementById('solarArFsTime');
    if (fsTime) fsTime.textContent = timeStr;

    document.getElementById('solarSelectedTime').textContent = timeStr;
    const badge = document.getElementById('solarPhaseBadge');
    badge.textContent = pos.phaseLabel;
    badge.className = `status-pill ${pos.phaseKey === 'GOLDEN' ? 'solar-golden' : pos.phaseKey === 'BLUE' ? 'solar-blue' : ''}`;

    // Hızlı saat atlama çipleri (Doğuş / Öğle / Altın / Batış)
    const quickChips = document.getElementById('solarQuickTimeChips');
    if (quickChips) {
      const items = [
        { lbl: `Doğuş ${Solar.formatMinutes(summary.sunriseMin)}`, m: Math.round(summary.sunriseMin || 420) },
        { lbl: `Öğle ${Solar.formatMinutes(summary.noonMin)}`, m: Math.round(summary.noonMin || 720) },
        { lbl: `Altın ${Solar.formatMinutes(summary.goldenStartPM)}`, m: Math.round(summary.goldenStartPM || 1000) },
        { lbl: `Batış ${Solar.formatMinutes(summary.sunsetMin)}`, m: Math.round(summary.sunsetMin || 1060) }
      ];
      quickChips.innerHTML = items.map((it) =>
        `<button type="button" class="len-chip mono" data-quick-min="${it.m}">${it.lbl}</button>`
      ).join('');
      quickChips.querySelectorAll('[data-quick-min]').forEach((b) => {
        b.addEventListener('click', () => {
          sState.minute = Number(b.dataset.quickMin);
          if (!live.sensorActive) aimManualAtSun();
          renderSolarTab();
        });
      });
    }

    let nextCountdown = '';
    if (sState.dateIso === todayIso()) {
      const mNow = nowMinutes();
      if (summary.sunriseMin && mNow < summary.sunriseMin) nextCountdown = `Gündoğumuna ${Solar.formatDuration(summary.sunriseMin - mNow)}`;
      else if (summary.goldenStartPM && mNow < summary.goldenStartPM) nextCountdown = `Altın Saate ${Solar.formatDuration(summary.goldenStartPM - mNow)}`;
      else if (summary.sunsetMin && mNow < summary.sunsetMin) nextCountdown = `Günbatımına ${Solar.formatDuration(summary.sunsetMin - mNow)}!`;
      else if (summary.blueEndPM && mNow < summary.blueEndPM) nextCountdown = `Mavi Saat sonuna ${Solar.formatDuration(summary.blueEndPM - mNow)}`;
    }
    document.getElementById('solarNextCountdown').textContent = nextCountdown || `Gün ışığı: ${Solar.formatDuration(summary.daylightMinutes)}`;

    const shadowText = pos.shadowRatio !== null ? `${(1.8 * pos.shadowRatio).toFixed(1)}m → ${pos.shadowCompass}` : '—';
    document.getElementById('solarLiveMetrics').innerHTML = `
      <div class="solar-stat"><span class="strip-k">Güneş Yönü</span><strong class="mono">${pos.azimuth}° ${pos.compass}</strong></div>
      <div class="solar-stat"><span class="strip-k">Yükseklik</span><strong class="mono" style="color:${pos.elevation > 0 ? 'var(--accent)' : 'var(--text-muted)'};">${pos.elevation}°</strong></div>
      <div class="solar-stat"><span class="strip-k">1.8m Gölge</span><strong class="mono">${shadowText}</strong></div>
      <div class="solar-stat"><span class="strip-k">Kelvin</span><strong class="mono">${pos.estKelvin}</strong></div>
    `;
    document.getElementById('solarSetTip').textContent = pos.setTip;

    // 2D Pusula + Saat Takvimi + Pencere Cephe (Saat & Cephe sekmesi)
    const compassBtn = document.getElementById('solarCompassLockBtn');
    if (compassBtn) {
      compassBtn.classList.toggle('active', live.compassEnabled);
      compassBtn.textContent = live.compassEnabled ? `Pusula: ${live.compassHeading}°` : 'Canlı Pusula';
    }
    document.getElementById('solarCompassWrap').innerHTML = buildCompassSVG(pos, summary, winInfo);

    document.getElementById('solarTimelineGrid').innerHTML = `
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.blueStartAM || 0)}"><span class="strip-k">Mavi Saat (Sabah)</span><strong class="mono">${Solar.formatMinutes(summary.blueStartAM)}</strong><span class="solar-cell-sub mono">→ ${Solar.formatMinutes(summary.sunriseMin)}</span></button>
      <button class="solar-time-cell highlight-gold" data-jump-min="${Math.round(summary.sunriseMin || 0)}"><span class="strip-k">Gündoğumu</span><strong class="mono">${Solar.formatMinutes(summary.sunriseMin)}</strong><span class="solar-cell-sub mono">${summary.sunriseAzimuth !== null ? `${summary.sunriseAzimuth}° ${summary.sunriseCompass}` : '—'}</span></button>
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.goldenEndAM || 0)}"><span class="strip-k">Altın Saat Bitiş</span><strong class="mono">${Solar.formatMinutes(summary.goldenEndAM)}</strong><span class="solar-cell-sub mono">+6° açı</span></button>
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.noonMin || 720)}"><span class="strip-k">Tepe Güneşi</span><strong class="mono">${Solar.formatMinutes(summary.noonMin)}</strong><span class="solar-cell-sub mono">Max ${summary.noonElevation}°</span></button>
      <button class="solar-time-cell highlight-gold" data-jump-min="${Math.round(summary.goldenStartPM || 0)}"><span class="strip-k">Altın Saat (Akşam)</span><strong class="mono">${Solar.formatMinutes(summary.goldenStartPM)}</strong><span class="solar-cell-sub mono">→ ${Solar.formatMinutes(summary.sunsetMin)}</span></button>
      <button class="solar-time-cell highlight-set" data-jump-min="${Math.round(summary.sunsetMin || 0)}"><span class="strip-k">Günbatımı</span><strong class="mono">${Solar.formatMinutes(summary.sunsetMin)}</strong><span class="solar-cell-sub mono">${summary.sunsetAzimuth !== null ? `${summary.sunsetAzimuth}° ${summary.sunsetCompass}` : '—'}</span></button>
      <button class="solar-time-cell" data-jump-min="${Math.round(summary.blueEndPM || 0)}"><span class="strip-k">Mavi Saat Sonu</span><strong class="mono">${Solar.formatMinutes(summary.blueEndPM)}</strong><span class="solar-cell-sub mono">Karanlık</span></button>
    `;
    document.querySelectorAll('[data-jump-min]').forEach((b) => {
      b.addEventListener('click', () => {
        const m = Number(b.dataset.jumpMin);
        if (m > 0) {
          sState.minute = m;
          aimManualAtSun(m);
          setSolarSubtab('camera');
          renderSolarTab();
        }
      });
    });

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
          <div style="font-size:11px; color:var(--text-dim);">${winInfo.facingFull} (${winInfo.facingDeg}°) Direkt Güneş:</div>
          <div class="mono" style="font-size:15px; font-weight:700; margin-top:2px; color:${winInfo.hasDirectSun ? 'var(--accent)' : 'var(--text-muted)'};">
            ${esc(winInfo.rangeText)} ${winInfo.hasDirectSun ? `(${Solar.formatDuration(winInfo.durationMin)})` : ''}
          </div>
        </div>
        <span class="tag ${winInfo.hittingNow ? 'tag-caution' : 'tag-safe'} mono">
          ${winInfo.hittingNow ? 'Direkt güneş alıyor' : 'Gölgede'}
        </span>
      </div>
    `;

    updateArControlsUI();
    updatePlayBtnUI();
    renderCloudTimerCard();
    renderCloudWeatherPanel();
    if (live.subtab === 'camera' && rootEl.classList.contains('active')) {
      startArLoop();
      drawArFrame();
    }
  }

  function buildSolarReport() {
    ensureDayCache();
    const { year, month, day } = parseIsoDate(sState.dateIso);
    const summary = live.cachedSummary;
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

  function bindArCanvasDrag() {
    const canvas = document.getElementById('solarArCanvas');
    if (!canvas) return;

    const onDown = (clientX, clientY) => {
      live.dragging = true;
      live.dragStartX = clientX;
      live.dragStartY = clientY;
      live.dragStartAz = live.manualAz;
      live.dragStartEl = live.manualEl;
      live.dragStartOffset = live.headingOffsetDeg;
    };

    const onMove = (clientX, clientY) => {
      if (!live.dragging) return;
      const dx = clientX - live.dragStartX;
      const dy = clientY - live.dragStartY;
      if (live.sensorActive && live.sensorReceived) {
        // Canlı sensör aktifken yatay sürükleme pusula ince kalibrasyonu yapar
        live.headingOffsetDeg = live.dragStartOffset - dx * 0.25;
        if (live.lastOrientation) {
          const o = live.lastOrientation;
          live.targetBasis = sensorBasis(o.alpha, o.beta, o.gamma, o.wk, live.headingOffsetDeg);
        }
      } else {
        live.manualAz = Solar.normalizeDeg(live.dragStartAz - dx * 0.35);
        live.manualEl = Math.max(-15, Math.min(82, live.dragStartEl + dy * 0.28));
      }
      drawArFrame();
    };

    const onUp = () => { live.dragging = false; };

    canvas.addEventListener('pointerdown', (e) => {
      onDown(e.clientX, e.clientY);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('pointermove', (e) => {
      if (live.dragging) {
        e.preventDefault();
        onMove(e.clientX, e.clientY);
      }
    });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
  }

  function bindSolarEvents() {
    document.querySelectorAll('[data-solar-subtab]').forEach((btn) => {
      btn.addEventListener('click', () => setSolarSubtab(btn.dataset.solarSubtab));
    });

    const camBtn = document.getElementById('solarArCameraBtn');
    if (camBtn) camBtn.addEventListener('click', startLiveCamera);

    const calBtn = document.getElementById('solarArCalibrateBtn');
    if (calBtn) calBtn.addEventListener('click', calibrateToRealSun);

    const fsBtn = document.getElementById('solarArFullscreenBtn');
    if (fsBtn) fsBtn.addEventListener('click', () => toggleArFullscreen());

    const aimSunBtn = document.getElementById('solarArAimSunBtn');
    if (aimSunBtn) {
      aimSunBtn.addEventListener('click', () => {
        aimManualAtSun();
        drawArFrame();
      });
    }

    document.querySelectorAll('[data-ar-az]').forEach((b) => {
      b.addEventListener('click', () => {
        live.manualAz = Number(b.dataset.arAz);
        live.manualEl = 20;
        drawArFrame();
      });
    });

    const onTimeSlide = (val) => {
      stopPlayDay();
      sState.minute = Number(val);
      renderSolarTab();
    };
    const playDayBtn = document.getElementById('solarPlayDayBtn');
    if (playDayBtn) playDayBtn.addEventListener('click', togglePlayDay);

    document.querySelectorAll('[data-solar-shift]').forEach((b) => {
      b.addEventListener('click', () => {
        stopPlayDay();
        const delta = Number(b.dataset.solarShift || 0);
        sState.minute = Math.max(300, Math.min(1320, sState.minute + delta));
        if (!live.sensorActive) aimManualAtSun();
        renderSolarTab();
      });
    });

    const slider = document.getElementById('solarTimeSlider');
    if (slider) slider.addEventListener('input', (e) => onTimeSlide(e.target.value));
    const fsSlider = document.getElementById('solarArFsSlider');
    if (fsSlider) fsSlider.addEventListener('input', (e) => onTimeSlide(e.target.value));

    const resetNow = () => {
      stopPlayDay();
      sState.dateIso = todayIso();
      sState.minute = nowMinutes();
      if (!live.sensorActive) aimManualAtSun();
      renderSolarTab();
      toast('Şu anki saate dönüldü');
    };
    const nowBtn = document.getElementById('solarNowBtn');
    if (nowBtn) nowBtn.addEventListener('click', resetNow);
    const fsNowBtn = document.getElementById('solarArFsNowBtn');
    if (fsNowBtn) fsNowBtn.addEventListener('click', resetNow);

    const citySel = document.getElementById('solarCitySelect');
    if (citySel) {
      citySel.addEventListener('change', (e) => {
        if (e.target.value === 'gps') { requestGPS(); return; }
        const c = Solar.TR_CITIES.find((x) => x.id === e.target.value);
        if (c) {
          sState.cityId = c.id;
          sState.locationName = c.name;
          sState.lat = c.lat;
          sState.lng = c.lng;
          sState.tz = c.tz;
          live.weather = null;
          saveSolarState();
          aimManualAtSun();
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
          aimManualAtSun();
          renderSolarTab();
        }
      });
    }

    const compBtn = document.getElementById('solarCompassLockBtn');
    if (compBtn) compBtn.addEventListener('click', toggle2DCompass);

    const wBtn = document.getElementById('solarRefreshWeatherBtn');
    if (wBtn) wBtn.addEventListener('click', () => fetchLiveCloudData(false));

    const repBtn = document.getElementById('exportSolarReportBtn');
    if (repBtn) {
      repBtn.addEventListener('click', () => {
        if (window.SetAppOpenReport) window.SetAppOpenReport('Güneş & Doğal Işık Takvimi', buildSolarReport());
      });
    }

    bindArCanvasDrag();
  }

  window.SetSolarUI = {
    init() {
      aimManualAtSun();
      bindSolarEvents();
      renderSolarTab();
    },
    render: renderSolarTab,
    onTabShow() {
      if (live.subtab === 'camera') {
        startArLoop();
        drawArFrame();
      }
    },
    onTabHide() {
      stopPlayDay();
      stopArLoop();
      if (live.cameraActive) stopLiveCamera();
    }
  };
})();
