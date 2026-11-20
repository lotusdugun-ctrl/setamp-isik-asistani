// Sinema Seti Elektrik, Faz Dengesi, Risk Analizi ve Kablo Kapasite Motoru
(function (root) {
  const DEFAULT_VOLTAGE = 230;
  const COPPER_RHO = 0.0185; // Bakır kablo özdirenci (Ω·mm²/m, ~50°C çalışma sıcaklığı)

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function formatKW(watts) {
    const kw = (Number(watts) || 0) / 1000;
    if (kw === 0) return '0.0 kW';
    if (kw < 10) return `${kw.toFixed(2)} kW`;
    return `${kw.toFixed(1)} kW`;
  }

  /**
   * Bir kablonun nominal ve %80 sürekli güvenli kW kapasitesini döndürür (230V bazlı)
   */
  function calcCablePower(cable) {
    const voltage = cable.voltage || DEFAULT_VOLTAGE;
    const phases = cable.phases || 1;
    const safeRatio = cable.safeRatio || 0.80;
    const ratedAmpsPerPhase = cable.ratedAmps;
    const safeAmpsPerPhase = round1(ratedAmpsPerPhase * safeRatio);

    const ratedWattsPerPhase = ratedAmpsPerPhase * voltage;
    const safeWattsPerPhase = ratedWattsPerPhase * safeRatio;
    const ratedTotalWatts = ratedWattsPerPhase * phases;
    const safeTotalWatts = safeWattsPerPhase * phases;

    return {
      ratedAmpsPerPhase,
      safeAmpsPerPhase,
      ratedTotalAmps: ratedAmpsPerPhase * phases,
      safeTotalAmps: round1(safeAmpsPerPhase * phases),
      ratedKWPerPhase: round2(ratedWattsPerPhase / 1000),
      safeKWPerPhase: round2(safeWattsPerPhase / 1000),
      ratedTotalKW: round2(ratedTotalWatts / 1000),
      safeTotalKW: round2(safeTotalWatts / 1000),
      ratedTotalKWText: formatKW(ratedTotalWatts),
      safeTotalKWText: formatKW(safeTotalWatts),
      ratedPhaseKWText: formatKW(ratedWattsPerPhase),
      safePhaseKWText: formatKW(safeWattsPerPhase)
    };
  }

  /**
   * Tek bir lambanın akım ve görünür güç hesabı
   */
  function calcFixtureAmps(fixture, voltage = DEFAULT_VOLTAGE) {
    const pf = fixture.pf && fixture.pf > 0 ? fixture.pf : 0.95;
    const watts = Number(fixture.watts) || 0;
    const va = watts / pf;
    const continuousAmps = va / voltage;
    const inrushMult = fixture.inrushMultiplier || 1.0;
    const strikeAmps = continuousAmps * inrushMult;
    return {
      watts,
      kw: round2(watts / 1000),
      kwText: formatKW(watts),
      va: round1(va),
      pf,
      continuousAmps: round2(continuousAmps),
      strikeAmps: round2(strikeAmps),
      extraInrushAmps: round2(strikeAmps - continuousAmps)
    };
  }

  /**
   * Seçili kabloyla belirli bir lambadan kaç adet yakılabileceğini hesaplar.
   * Hem boş kablo kapasitesini hem de mevcut yük sonrası kalan boş kapasiteyi döndürür.
   */
  function calcMaxUnitsForCable(cable, fixture, existingPhaseAmps = null, voltage = DEFAULT_VOLTAGE) {
    const fCalc = calcFixtureAmps(fixture, voltage);
    const unitAmps = fCalc.continuousAmps;
    const phases = cable.phases || 1;
    const rated = cable.ratedAmps;
    const safeLimit = rated * (cable.safeRatio || 0.80);
    const cautionLimit = rated * (cable.cautionRatio || 0.95);

    if (unitAmps <= 0) {
      return {
        compatible: true,
        unitAmps: 0,
        maxSafeTotal: 0,
        maxCautionTotal: 0,
        maxAbsoluteTotal: 0,
        remainingSafeAdd: 0,
        remainingCautionAdd: 0,
        label: '0 adet',
        level: 'SAFE',
        reason: ''
      };
    }

    // Tek bir lamba, kablonun tek faz sınırını veya minimum soket şartını aşıyorsa ÇALIŞMAZ!
    const socketTooSmall = (fixture.minSocketAmps && fixture.minSocketAmps > rated) || unitAmps > rated;
    if (socketTooSmall) {
      return {
        compatible: false,
        unitAmps,
        maxSafeTotal: 0,
        maxCautionTotal: 0,
        maxAbsoluteTotal: 0,
        remainingSafeAdd: 0,
        remainingCautionAdd: 0,
        label: '0 (Çalışmaz)',
        level: 'DANGER',
        reason: `Tek cihaz (${unitAmps.toFixed(1)}A), ${cable.shortName} tek faz limitini (${rated}A) aşıyor. Min ${fixture.minSocketAmps || Math.ceil(unitAmps)}A hat gerekir.`
      };
    }

    const maxSafePerPhase = Math.floor(safeLimit / unitAmps);
    const maxCautionPerPhase = Math.floor(cautionLimit / unitAmps);
    const maxAbsPerPhase = Math.floor(rated / unitAmps);

    const maxSafeTotal = maxSafePerPhase * phases;
    const maxCautionTotal = maxCautionPerPhase * phases;
    const maxAbsoluteTotal = maxAbsPerPhase * phases;

    // Mevcut yük sonrası kalan boş kapasiteye kaç adet daha eklenebilir?
    const currentPhases = Array.isArray(existingPhaseAmps) && existingPhaseAmps.length === phases
      ? existingPhaseAmps
      : new Array(phases).fill(0);

    let remainingSafeAdd = 0;
    let remainingCautionAdd = 0;
    for (let p = 0; p < phases; p++) {
      const remSafe = Math.max(0, safeLimit - currentPhases[p]);
      const remCaution = Math.max(0, cautionLimit - currentPhases[p]);
      remainingSafeAdd += Math.floor(remSafe / unitAmps);
      remainingCautionAdd += Math.floor(remCaution / unitAmps);
    }

    let level = 'SAFE';
    let label = `${maxSafeTotal} adet güvenli`;
    let reason = phases === 3
      ? `Her faza ${maxSafePerPhase} adet × 3 faz = ${maxSafeTotal} adet (%${Math.round((cable.safeRatio || 0.8) * 100)} sürekli güvenli).`
      : `Sürekli %${Math.round((cable.safeRatio || 0.8) * 100)} güvenli limit (${safeLimit.toFixed(1)}A) içinde ${maxSafeTotal} adet.`;

    if (maxSafeTotal === 0 && maxCautionTotal >= 1) {
      level = 'CAUTION';
      label = `${maxCautionTotal} adet (Sınırda)`;
      reason = `Tek cihaz %${Math.round((cable.safeRatio || 0.8) * 100)} sürekli sınırını (${safeLimit.toFixed(1)}A) aşıyor (${unitAmps.toFixed(1)}A). Çalışır ancak üst amper hat önerilir.`;
    } else if (maxSafeTotal === 0 && maxAbsoluteTotal >= 1) {
      level = 'DANGER';
      label = `${maxAbsoluteTotal} adet (Çok Riskli)`;
      reason = `Tek cihaz %${Math.round((cable.cautionRatio || 0.95) * 100)} üstü kritik sınırda (${unitAmps.toFixed(1)}A / ${rated}A). Sigorta atma ve ısınma riski yüksek!`;
    }

    return {
      compatible: true,
      unitAmps,
      maxSafePerPhase,
      maxSafeTotal,
      maxCautionTotal,
      maxAbsoluteTotal,
      remainingSafeAdd,
      remainingCautionAdd,
      label,
      level,
      reason
    };
  }

  /**
   * 3 fazlı kabloda tüm lambaları fazlara (R, S, T) en dengeli şekilde dağıtır (LPT algoritması).
   * Girdi: [{ uid, fixtureId, qty, phase }] -> Çıktı: Fazlara bölünmüş dengeli liste
   */
  function autoBalanceItems(cable, loadItems, fixtureMap) {
    if (!cable || cable.phases <= 1) {
      return loadItems.map((it) => ({ ...it, phase: 0 }));
    }

    // Her adedi tekil birimlere aç, en ağır akımdan en hafife sırala
    const expanded = [];
    for (const item of loadItems) {
      const fixture = fixtureMap[item.fixtureId];
      if (!fixture) continue;
      const amps = calcFixtureAmps(fixture, cable.voltage).continuousAmps;
      const count = Math.max(1, Number(item.qty) || 1);
      for (let i = 0; i < count; i++) {
        expanded.push({ fixtureId: item.fixtureId, amps });
      }
    }

    expanded.sort((a, b) => b.amps - a.amps);

    const phaseTotals = [0, 0, 0];
    // (fixtureId, phase) bazında tekrar birleştir
    const grouped = new Map();

    for (const unit of expanded) {
      // En az yüklü fazı seç
      let minIdx = 0;
      if (phaseTotals[1] < phaseTotals[minIdx]) minIdx = 1;
      if (phaseTotals[2] < phaseTotals[minIdx]) minIdx = 2;

      phaseTotals[minIdx] += unit.amps;
      const key = `${unit.fixtureId}__${minIdx}`;
      if (grouped.has(key)) {
        grouped.get(key).qty += 1;
      } else {
        grouped.set(key, {
          uid: `bal-${unit.fixtureId}-p${minIdx}-${Math.random().toString(36).slice(2, 6)}`,
          fixtureId: unit.fixtureId,
          qty: 1,
          phase: minIdx
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.phase - b.phase);
  }

  /**
   * Seçili kablo + bağlı lambalar + kablo metrajı/kesiti için tam risk analizini yapar.
   */
  function evaluateLineLoad(cable, loadItems, fixtureMap, options = {}, allCables = []) {
    const voltage = options.voltage || cable.voltage || DEFAULT_VOLTAGE;
    const lengthMeters = Math.max(1, Number(options.lengthMeters ?? cable.defaultLength) || 20);
    const crossSection = Math.max(1, Number(options.crossSection ?? cable.defaultCrossSection) || 2.5);
    const phases = cable.phases || 1;
    const ratedAmps = cable.ratedAmps;
    const safeLimit = ratedAmps * (cable.safeRatio || 0.80);
    const cautionLimit = ratedAmps * (cable.cautionRatio || 0.95);

    const phaseAmps = new Array(phases).fill(0);
    const phaseWatts = new Array(phases).fill(0);
    const phaseMaxExtraInrush = new Array(phases).fill(0);
    const phaseHasHmi = new Array(phases).fill(false);

    let totalWatts = 0;
    let totalVA = 0;
    let totalUnits = 0;
    const incompatibleFixtures = [];

    for (const item of loadItems) {
      const fixture = fixtureMap[item.fixtureId];
      if (!fixture) continue;
      const qty = Math.max(0, Number(item.qty) || 0);
      if (qty === 0) continue;

      const fCalc = calcFixtureAmps(fixture, voltage);
      const pIdx = phases === 1 ? 0 : Math.min(Math.max(0, Number(item.phase) || 0), phases - 1);

      phaseAmps[pIdx] += fCalc.continuousAmps * qty;
      phaseWatts[pIdx] += fCalc.watts * qty;
      totalWatts += fCalc.watts * qty;
      totalVA += fCalc.va * qty;
      totalUnits += qty;

      if (fixture.type === 'HMI') {
        phaseHasHmi[pIdx] = true;
      }
      if (fCalc.extraInrushAmps > phaseMaxExtraInrush[pIdx]) {
        phaseMaxExtraInrush[pIdx] = fCalc.extraInrushAmps;
      }

      // Tek cihaz soket / faz uyumsuzluğu kontrolü
      if ((fixture.minSocketAmps && fixture.minSocketAmps > ratedAmps) || fCalc.continuousAmps > ratedAmps) {
        if (!incompatibleFixtures.some((x) => x.id === fixture.id)) {
          incompatibleFixtures.push({
            id: fixture.id,
            name: `${fixture.brand} ${fixture.model}`,
            unitAmps: fCalc.continuousAmps,
            minSocketAmps: fixture.minSocketAmps || Math.ceil(fCalc.continuousAmps)
          });
        }
      }
    }

    const roundedPhaseAmps = phaseAmps.map(round2);
    const maxPhaseAmps = phaseAmps.length ? Math.max(...phaseAmps) : 0;
    const minPhaseAmps = phaseAmps.length ? Math.min(...phaseAmps) : 0;
    const totalAmpsSum = round2(phaseAmps.reduce((a, b) => a + b, 0));
    const peakUsagePercent = ratedAmps > 0 ? round1((maxPhaseAmps / ratedAmps) * 100) : 0;

    // Nötr akımı ve voltaj düşümü hesabı
    let neutralAmps = 0;
    let voltageDropV = 0;
    if (phases === 1) {
      neutralAmps = phaseAmps[0];
      voltageDropV = (2 * lengthMeters * phaseAmps[0] * COPPER_RHO) / crossSection;
    } else {
      const [iR, iS, iT] = phaseAmps;
      neutralAmps = Math.sqrt(Math.max(0, iR * iR + iS * iS + iT * iT - iR * iS - iS * iT - iT * iR));
      voltageDropV = ((maxPhaseAmps + neutralAmps) * lengthMeters * COPPER_RHO) / crossSection;
    }

    const voltageDropPercent = round2((voltageDropV / voltage) * 100);
    const deliveredVoltage = round1(Math.max(0, voltage - voltageDropV));

    // Faz dengesizliği (3 fazlı kabloda)
    let imbalancePercent = 0;
    if (phases === 3 && maxPhaseAmps > 0) {
      imbalancePercent = round1(((maxPhaseAmps - minPhaseAmps) / maxPhaseAmps) * 100);
    }

    // Faz bazlı durumlar (Amper + kW temsilleriyle)
    const cablePower = calcCablePower(cable);
    const phaseNames = phases === 1 ? ['Tek Faz (L1)'] : ['Faz R (L1)', 'Faz S (L2)', 'Faz T (L3)'];
    const phaseDetails = phaseAmps.map((amps, idx) => {
      const pct = round1((amps / ratedAmps) * 100);
      const strikePeak = round2(amps + phaseMaxExtraInrush[idx]);
      const remSafeA = round2(Math.max(0, safeLimit - amps));
      const remSafeW = Math.max(0, (safeLimit - amps) * voltage);
      let status = 'SAFE';
      if (amps > cautionLimit) status = 'DANGER';
      else if (amps > safeLimit) status = 'CAUTION';
      return {
        index: idx,
        label: phaseNames[idx],
        amps: round2(amps),
        watts: Math.round(phaseWatts[idx]),
        kw: round2(phaseWatts[idx] / 1000),
        kwText: formatKW(phaseWatts[idx]),
        ratedKW: cablePower.ratedKWPerPhase,
        ratedKWText: cablePower.ratedPhaseKWText,
        safeKW: cablePower.safeKWPerPhase,
        safeKWText: cablePower.safePhaseKWText,
        percent: pct,
        safeLimit: round1(safeLimit),
        ratedAmps,
        remainingSafeAmps: remSafeA,
        remainingSafeKWText: formatKW(remSafeW),
        remainingAbsAmps: round2(Math.max(0, ratedAmps - amps)),
        strikePeak,
        hasHmi: phaseHasHmi[idx],
        status
      };
    });

    // Genel Risk Seviyesi ve Uyarı Mesajları
    const warnings = [];
    let status = totalUnits === 0 ? 'EMPTY' : 'SAFE';

    if (incompatibleFixtures.length > 0) {
      status = 'DANGER';
      for (const inc of incompatibleFixtures) {
        warnings.push({
          level: 'DANGER',
          title: `Soket / Faz Uyumsuzluğu: ${inc.name}`,
          detail: `Tek cihaz ${inc.unitAmps.toFixed(1)}A çekiyor; ${cable.shortName} (${ratedAmps}A) hatta bağlanamaz! En az ${inc.minSocketAmps}A hat kullanın.`
        });
      }
    }

    // Faz aşırı yük ve sınır kontrolleri
    phaseDetails.forEach((pd) => {
      if (pd.amps > ratedAmps) {
        status = 'DANGER';
        warnings.push({
          level: 'DANGER',
          title: `${pd.label} Aşırı Yüklü (${pd.amps}A / ${ratedAmps}A)`,
          detail: `Sigorta kesinlikle atar ve kablo ısınır! En az ${(pd.amps - safeLimit).toFixed(1)}A yük azaltın veya üst kabloya geçin.`
        });
      } else if (pd.amps > cautionLimit) {
        status = 'DANGER';
        warnings.push({
          level: 'DANGER',
          title: `${pd.label} Kritik Sınırda (%${pd.percent})`,
          detail: `${pd.amps}A yük %${Math.round((cable.cautionRatio || 0.95) * 100)} kritik eşiği aşıyor. Uzun çekimde sigorta atma ve priz/kablo erime riski var!`
        });
      } else if (pd.amps > safeLimit) {
        if (status !== 'DANGER') status = 'CAUTION';
        warnings.push({
          level: 'CAUTION',
          title: `${pd.label} Sürekli Limit Üstünde (%${pd.percent})`,
          detail: `Güvenli sürekli sınır ${safeLimit.toFixed(1)}A (%${Math.round((cable.safeRatio || 0.8) * 100)}). Kısa süreli çalışabilir ama yeni cihaz eklemeyin.`
        });
      }

      // Türk kablo (ev tipi üçlü priz) üzerine HMI bağlandıysa pratik set uyarısı
      if (cable.id === 'turk-uclu' && pd.hasHmi) {
        if (status === 'SAFE') status = 'CAUTION';
        warnings.push({
          level: 'CAUTION',
          title: 'Üçlü Prizde (Türk Kablo) HMI Balast Uyarısı',
          detail: 'Ev tipi üçlü priz kontakları ve ince kablo HMI ateşleme akımında ısınabilir. HMI için 3×2.5mm² 16A set uzatması önerilir.'
        });
      }

      // HMI ateşleme (inrush) kontrolü
      if (pd.hasHmi && pd.strikePeak > ratedAmps && pd.amps <= ratedAmps) {
        if (status === 'SAFE') status = 'CAUTION';
        warnings.push({
          level: 'CAUTION',
          title: `${pd.label} HMI Ateşleme (Strike) Riski`,
          detail: `Sürekli akım ${pd.amps}A ancak HMI ilk ateşlemede ~${pd.strikePeak}A pik yapabilir. HMI lambayı diğer cihazlardan önce tek tek yakın.`
        });
      }
    });

    // Voltaj düşümü kontrolü
    if (totalUnits > 0) {
      const anyHmi = phaseHasHmi.some(Boolean);
      if (voltageDropPercent >= 5.5 || (anyHmi && deliveredVoltage < 212)) {
        status = 'DANGER';
        warnings.push({
          level: 'DANGER',
          title: `Yüksek Voltaj Düşümü (%${voltageDropPercent} → ${deliveredVoltage}V)`,
          detail: `${lengthMeters}m / ${crossSection}mm² kablo bu akımda ciddi voltaj kaybı yapıyor. ${anyHmi ? 'HMI balast kesebilir veya ateşlemeyebilir! ' : ''}Daha kalın kesitli kablo kullanın.`
        });
      } else if (voltageDropPercent >= 3.0) {
        if (status === 'SAFE') status = 'CAUTION';
        warnings.push({
          level: 'CAUTION',
          title: `Voltaj Düşümü Dikkat (%${voltageDropPercent} → ${deliveredVoltage}V)`,
          detail: `${lengthMeters}m mesafede %3 üstü kayıp var. Kablo kesitini büyütmek veya distroyu yaklaştırmak verimi artırır.`
        });
      }
    }

    // 3 faz dengesizlik kontrolü
    if (phases === 3 && maxPhaseAmps >= 6 && imbalancePercent >= 35) {
      warnings.push({
        level: 'INFO',
        title: `Faz Dengesizliği (%${imbalancePercent})`,
        detail: `Nötr hattında ${round1(neutralAmps)}A geri dönüş akımı oluşuyor. Jeneratör sağlığı için "Otomatik Faz Dengele" butonunu kullanın.`
      });
    }

    // Aynı 3 fazlı kabloda sadece fazları dengeleyerek kurtarılabiliyor mu?
    let canFixByRebalance = false;
    if (!options._skipSuggestions && phases === 3 && (status === 'DANGER' || status === 'CAUTION') && incompatibleFixtures.length === 0) {
      const balancedSame = autoBalanceItems(cable, loadItems, fixtureMap);
      const testSame = evaluateLineLoad(
        cable,
        balancedSame,
        fixtureMap,
        { lengthMeters, crossSection, voltage, _skipSuggestions: true },
        []
      );
      if (testSame.status === 'SAFE' || (status === 'DANGER' && testSame.status === 'CAUTION')) {
        canFixByRebalance = true;
      }
    }

    // Daha güvenli kablo önerisi (eğer DANGER veya CAUTION ise ve mevcut kablo dengelenince bile yetmiyorsa)
    let recommendedCable = null;
    if (!options._skipSuggestions && !canFixByRebalance && (status === 'DANGER' || status === 'CAUTION') && Array.isArray(allCables) && allCables.length > 0) {
      const currentSafeCap = cable.ratedAmps * cable.phases * (cable.safeRatio || 0.80);
      for (const candidate of allCables) {
        if (candidate.id === cable.id) continue;
        // Aday kablo mevcut kablodan daha yüksek güvenli kapasiteye sahip olsun
        const candSafeCap = candidate.ratedAmps * candidate.phases * (candidate.safeRatio || 0.80);
        if (candSafeCap <= currentSafeCap) continue;
        const balanced = autoBalanceItems(candidate, loadItems, fixtureMap);
        const testEval = evaluateLineLoad(
          candidate,
          balanced,
          fixtureMap,
          { lengthMeters, crossSection: candidate.defaultCrossSection, voltage, _skipSuggestions: true },
          []
        );
        if (testEval.status === 'SAFE') {
          const candPow = calcCablePower(candidate);
          recommendedCable = {
            id: candidate.id,
            shortName: candidate.shortName,
            name: candidate.name,
            ratedTotalKWText: candPow.ratedTotalKWText,
            peakUsagePercent: testEval.peakUsagePercent
          };
          break;
        }
      }
    }

    const totalKWText = formatKW(totalWatts);
    // Durum metinleri
    const verdictMap = {
      EMPTY: {
        badge: 'YÜK YOK',
        headline: 'Lamba Seçerek Başlayın',
        subtext: `${cable.shortName} • Güvenli kapasite: ${phases === 3 ? `3×${round1(safeLimit)}A (${cablePower.safeTotalKWText})` : `${round1(safeLimit)}A (${cablePower.safeTotalKWText})`}`
      },
      SAFE: {
        badge: 'RİSKSİZ',
        headline: 'Hat Güvenli Çalışma Aralığında',
        subtext: `Tepe yük ${round1(maxPhaseAmps)}A / ${ratedAmps}A (%${peakUsagePercent}) • Toplam ${totalKWText}`
      },
      CAUTION: {
        badge: 'DİKKAT • SINIRDA',
        headline: `Güvenli Sınır (%${Math.round((cable.safeRatio || 0.8) * 100)}) Aşıldı`,
        subtext: `Tepe yük ${round1(maxPhaseAmps)}A / ${ratedAmps}A (%${peakUsagePercent}) • Ek cihaz bağlamayın.`
      },
      DANGER: {
        badge: 'RİSKLİ • AŞIRI YÜK',
        headline: incompatibleFixtures.length > 0 ? 'Soket / Faz Uyumsuzluğu!' : 'Sigorta Atma Riski!',
        subtext: incompatibleFixtures.length > 0
          ? 'Seçili lambalardan biri bu kablo tipine uygun değil.'
          : `Tepe yük ${round1(maxPhaseAmps)}A / ${ratedAmps}A (%${peakUsagePercent}) • Bu kurulumla yakmayın.`
      }
    };

    return {
      status,
      verdict: verdictMap[status],
      cable,
      cablePower,
      totalUnits,
      totalWatts: Math.round(totalWatts),
      totalKW: round2(totalWatts / 1000),
      totalKWText,
      totalVA: Math.round(totalVA),
      totalKVA: round2(totalVA / 1000),
      totalAmpsSum,
      phaseAmps: roundedPhaseAmps,
      phaseDetails,
      maxPhaseAmps: round2(maxPhaseAmps),
      peakUsagePercent,
      neutralAmps: round2(neutralAmps),
      voltageDropV: round2(voltageDropV),
      voltageDropPercent,
      deliveredVoltage,
      imbalancePercent,
      lengthMeters,
      crossSection,
      warnings,
      incompatibleFixtures,
      canFixByRebalance,
      recommendedCable
    };
  }

  const api = {
    DEFAULT_VOLTAGE,
    formatKW,
    calcCablePower,
    calcFixtureAmps,
    calcMaxUnitsForCable,
    autoBalanceItems,
    evaluateLineLoad
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SetCalc = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
