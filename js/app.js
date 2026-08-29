/**
 * app.js - Main Application Controller for index.html
 */

document.addEventListener('DOMContentLoaded', () => {
  const { IPUtils } = window;

  // --- Copy to clipboard functionality ---
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-copy');
    if (!btn) return;
    const targetId = btn.getAttribute('data-target');
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    const text = targetEl.textContent.trim();
    if (!text || text === '-') return;

    navigator.clipboard.writeText(text).then(() => {
      const origText = btn.textContent;
      btn.textContent = 'コピー完了!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = origText;
        btn.classList.remove('copied');
      }, 1500);
    }).catch((err) => {
      console.error('Clipboard copy failed:', err);
    });
  });

  // --- Tab Navigation & Hash Routing ---
  const tabButtons = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  function normalizeTabName(name) {
    if (!name) return 'nat64';
    const clean = name.replace(/^#/, '').toLowerCase();
    if (clean === 'rdns' || clean === 'reversedns' || clean === 'dns') return 'reversedns';
    if (clean === 'nat64' || clean === 'mapped' || clean === 'v4tov6' || clean === 'v6tov4') return 'nat64';
    if (clean === 'analyzer' || clean === 'details' || clean === 'ipv6') return 'analyzer';
    return 'nat64';
  }

  function switchTab(tabKey, updateHash = true) {
    const norm = normalizeTabName(tabKey);
    tabButtons.forEach((b) => {
      const match = b.getAttribute('data-tab') === norm;
      b.classList.toggle('active', match);
    });
    tabContents.forEach((c) => {
      const match = c.id === 'tab-' + norm;
      c.style.display = match ? 'block' : 'none';
      if (match) {
        const input = c.querySelector('input');
        if (input) input.focus();
      }
    });

    if (updateHash && window.location.hash !== '#' + norm) {
      history.replaceState(null, '', '#' + norm);
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName, true);
    });
  });

  window.addEventListener('hashchange', () => {
    switchTab(window.location.hash, false);
  });

  // 初期ハッシュルーティング
  if (window.location.hash) {
    switchTab(window.location.hash, false);
  }

  // --- TAB 1: NAT64 / IPv4-Mapped ---
  const nat64Input = document.getElementById('nat64-input');
  const nat64Alert = document.getElementById('nat64-alert');
  const resNat64V4 = document.getElementById('res-nat64-v4');
  const resNat64Wkp = document.getElementById('res-nat64-wkp');
  const resNat64Full = document.getElementById('res-nat64-full');
  const resNat64Mapped = document.getElementById('res-nat64-mapped');
  const resNat64MappedHex = document.getElementById('res-nat64-mapped-hex');
  const resNat64MappedFull = document.getElementById('res-nat64-mapped-full');

  let nat64Mode = 'auto'; // 'auto' | 'v4tov6' | 'v6tov4'

  const modeAuto = document.getElementById('nat64-mode-auto');
  const modeV4ToV6 = document.getElementById('nat64-mode-v4tov6');
  const modeV6ToV4 = document.getElementById('nat64-mode-v6tov4');

  function setNat64Mode(mode) {
    nat64Mode = mode;
    [modeAuto, modeV4ToV6, modeV6ToV4].forEach((b) => b.classList.remove('active'));
    if (mode === 'auto') modeAuto.classList.add('active');
    else if (mode === 'v4tov6') modeV4ToV6.classList.add('active');
    else if (mode === 'v6tov4') modeV6ToV4.classList.add('active');
    updateNat64();
  }

  modeAuto.addEventListener('click', () => setNat64Mode('auto'));
  modeV4ToV6.addEventListener('click', () => setNat64Mode('v4tov6'));
  modeV6ToV4.addEventListener('click', () => setNat64Mode('v6tov4'));

  function updateNat64() {
    const rawVal = nat64Input.value.trim();
    nat64Alert.classList.add('alert-hidden');
    nat64Alert.textContent = '';
    nat64Input.classList.remove('error');

    if (!rawVal) {
      resNat64V4.textContent = '-';
      resNat64Wkp.textContent = '-';
      resNat64Full.textContent = '-';
      resNat64Mapped.textContent = '-';
      if (resNat64MappedHex) resNat64MappedHex.textContent = '-';
      if (resNat64MappedFull) resNat64MappedFull.textContent = '-';
      return;
    }

    const isV4 = IPUtils.isValidIPv4(rawVal);
    const isV6 = IPUtils.isValidIPv6(rawVal);

    if (nat64Mode === 'v4tov6') {
      if (!isV4) {
        showNat64Error('有効なIPv4アドレス (例: 192.0.2.1) を入力してください。');
        return;
      }
      const nat64 = IPUtils.convertV4ToNat64(rawVal);
      const mapped = IPUtils.convertV4ToMapped(rawVal);
      resNat64V4.textContent = rawVal;
      resNat64Wkp.textContent = nat64.standard;
      resNat64Full.textContent = nat64.full;
      resNat64Mapped.textContent = mapped.dotted;
      if (resNat64MappedHex) resNat64MappedHex.textContent = mapped.hex || mapped.standard;
      if (resNat64MappedFull) resNat64MappedFull.textContent = mapped.full;
      return;
    }

    if (nat64Mode === 'v6tov4') {
      if (!isV6) {
        showNat64Error('有効なIPv6アドレス (例: 64:ff9b::c000:201) を入力してください。');
        return;
      }
      const extractedV4 = IPUtils.convertNat64ToV4(rawVal) || IPUtils.convertMappedToV4(rawVal);
      if (!extractedV4) {
        showNat64Error('NAT64プレフィックス (64:ff9b::/96) または IPv4写像 (::ffff:0:0/96) のIPv6アドレスではありません。');
        return;
      }
      const nat64 = IPUtils.convertV4ToNat64(extractedV4);
      const mapped = IPUtils.convertV4ToMapped(extractedV4);
      resNat64V4.textContent = extractedV4;
      resNat64Wkp.textContent = nat64.standard;
      resNat64Full.textContent = nat64.full;
      resNat64Mapped.textContent = mapped.dotted;
      if (resNat64MappedHex) resNat64MappedHex.textContent = mapped.hex || mapped.standard;
      if (resNat64MappedFull) resNat64MappedFull.textContent = mapped.full;
      return;
    }

    // Auto mode
    if (isV4) {
      const nat64 = IPUtils.convertV4ToNat64(rawVal);
      const mapped = IPUtils.convertV4ToMapped(rawVal);
      resNat64V4.textContent = rawVal;
      resNat64Wkp.textContent = nat64.standard;
      resNat64Full.textContent = nat64.full;
      resNat64Mapped.textContent = mapped.dotted;
      if (resNat64MappedHex) resNat64MappedHex.textContent = mapped.hex || mapped.standard;
      if (resNat64MappedFull) resNat64MappedFull.textContent = mapped.full;
    } else if (isV6) {
      const extractedV4 = IPUtils.convertNat64ToV4(rawVal) || IPUtils.convertMappedToV4(rawVal);
      if (!extractedV4) {
        showNat64Error('NAT64プレフィックス (64:ff9b::/96) または IPv4写像 (::ffff:0:0/96) のIPv6アドレスではありません。');
        return;
      }
      const nat64 = IPUtils.convertV4ToNat64(extractedV4);
      const mapped = IPUtils.convertV4ToMapped(extractedV4);
      resNat64V4.textContent = extractedV4;
      resNat64Wkp.textContent = nat64.standard;
      resNat64Full.textContent = nat64.full;
      resNat64Mapped.textContent = mapped.dotted;
      if (resNat64MappedHex) resNat64MappedHex.textContent = mapped.hex || mapped.standard;
      if (resNat64MappedFull) resNat64MappedFull.textContent = mapped.full;
    } else {
      showNat64Error('無効なIPアドレス形式です。正しいIPv4またはIPv6アドレスを入力してください。');
    }
  }

  function showNat64Error(msg) {
    nat64Alert.textContent = msg;
    nat64Alert.classList.remove('alert-hidden');
    nat64Input.classList.add('error');
    resNat64V4.textContent = '-';
    resNat64Wkp.textContent = '-';
    resNat64Full.textContent = '-';
    resNat64Mapped.textContent = '-';
    if (resNat64MappedHex) resNat64MappedHex.textContent = '-';
    if (resNat64MappedFull) resNat64MappedFull.textContent = '-';
  }

  nat64Input.addEventListener('input', updateNat64);

  document.querySelectorAll('[data-fill-nat64]').forEach((btn) => {
    btn.addEventListener('click', () => {
      nat64Input.value = btn.getAttribute('data-fill-nat64');
      updateNat64();
      nat64Input.focus();
    });
  });

  // --- TAB 2: Reverse DNS ---
  const rdnsInput = document.getElementById('rdns-input');
  const rdnsAlert = document.getElementById('rdns-alert');
  const rdnsWarn = document.getElementById('rdns-warn');
  const resRdnsLabel1 = document.getElementById('res-rdns-label-1');
  const resRdnsBadge1 = document.getElementById('res-rdns-badge-1');
  const resRdnsVal1 = document.getElementById('res-rdns-val-1');
  const resRdnsOriginWrap = document.getElementById('res-rdns-origin-wrap');
  const resRdnsOriginVal = document.getElementById('res-rdns-origin-val');
  const resRdnsRfc2317Wrap = document.getElementById('res-rdns-rfc2317-wrap');
  const resRdnsRfc2317Val = document.getElementById('res-rdns-rfc2317-val');
  const resRdnsExtraWrap = document.getElementById('res-rdns-extra-wrap');
  const resRdnsExtraVal = document.getElementById('res-rdns-extra-val');

  function updateRdns() {
    const rawVal = rdnsInput.value.trim();
    rdnsAlert.classList.add('alert-hidden');
    rdnsAlert.textContent = '';
    rdnsWarn.classList.add('alert-hidden');
    rdnsWarn.textContent = '';
    rdnsInput.classList.remove('error');
    resRdnsExtraWrap.style.display = 'none';
    resRdnsRfc2317Wrap.style.display = 'none';
    resRdnsOriginWrap.style.display = 'block';

    if (!rawVal) {
      resRdnsVal1.textContent = '-';
      resRdnsOriginVal.textContent = '-';
      resRdnsLabel1.textContent = '変換結果 (レコード / ゾーン名)';
      resRdnsBadge1.textContent = 'PTR Record';
      return;
    }

    // Check if input is Reverse DNS string (.in-addr.arpa or .ip6.arpa)
    const reversed = IPUtils.reverseDNSToIP(rawVal);
    if (reversed) {
      const isZone = reversed.isZone;
      resRdnsLabel1.textContent = reversed.type === 'ipv4'
        ? (isZone ? `IPv4 サブネットネットワーク (/${reversed.prefix})` : 'IPv4 アドレス')
        : (isZone ? `IPv6 プレフィックスネットワーク (/${reversed.prefix})` : 'IPv6 アドレス (RFC 5952 推奨)');
      resRdnsBadge1.textContent = isZone ? 'Network / CIDR' : (reversed.type === 'ipv4' ? 'IPv4 Host' : 'IPv6 Host');
      resRdnsVal1.textContent = reversed.ip;
      resRdnsOriginWrap.style.display = 'none';

      if (reversed.fullIPv6) {
        resRdnsExtraWrap.style.display = 'block';
        resRdnsExtraVal.textContent = reversed.fullIPv6;
      }
      return;
    }

    // Check if input is IP or CIDR (IPv4 or IPv6)
    const ptr = IPUtils.ipToReverseDNS(rawVal);
    if (ptr) {
      if (ptr.isZone) {
        resRdnsLabel1.textContent = `逆引き委任ゾーン名 (/${ptr.prefix} 委任ゾーン)`;
        resRdnsBadge1.textContent = 'Zone Name';
      } else {
        resRdnsLabel1.textContent = '逆引きDNS (PTR レコード名)';
        resRdnsBadge1.textContent = ptr.type === 'ipv4' ? 'in-addr.arpa' : 'ip6.arpa';
      }

      resRdnsVal1.textContent = ptr.record;
      resRdnsOriginVal.textContent = ptr.origin;

      if (ptr.warning) {
        rdnsWarn.textContent = `⚠️ ${ptr.warning}`;
        rdnsWarn.classList.remove('alert-hidden');
      }

      if (ptr.rfc2317) {
        resRdnsRfc2317Wrap.style.display = 'block';
        resRdnsRfc2317Val.textContent = ptr.rfc2317.subnetZoneHyphen;
      }
      return;
    }

    // Invalid input
    rdnsAlert.textContent = '有効なIPアドレス (例: 192.168.1.1, 2001:db8::1)、CIDRプレフィックス (例: 192.168.1.0/24, 2001:db8::/32)、または逆引きレコード/ゾーン (.in-addr.arpa, .ip6.arpa) を入力してください。';
    rdnsAlert.classList.remove('alert-hidden');
    rdnsInput.classList.add('error');
    resRdnsVal1.textContent = '-';
    resRdnsOriginVal.textContent = '-';
  }

  rdnsInput.addEventListener('input', updateRdns);

  document.querySelectorAll('[data-fill-rdns]').forEach((btn) => {
    btn.addEventListener('click', () => {
      rdnsInput.value = btn.getAttribute('data-fill-rdns');
      updateRdns();
      rdnsInput.focus();
    });
  });

  // --- TAB 3: Analyzer ---
  const analyzerInput = document.getElementById('analyzer-input');
  const analyzerAlert = document.getElementById('analyzer-alert');
  const analyzerResults = document.getElementById('analyzer-results');

  const detVersion = document.getElementById('det-version');
  const detStandard = document.getElementById('det-standard');
  const detFullRow = document.getElementById('det-full-row');
  const detFull = document.getElementById('det-full');
  const detScope = document.getElementById('det-scope');
  const detReverse = document.getElementById('det-reverse');
  const detDecimalRow = document.getElementById('det-decimal-row');
  const detDecimal = document.getElementById('det-decimal');
  const detHex = document.getElementById('det-hex');
  const detBinary = document.getElementById('det-binary');

  function updateAnalyzer() {
    const rawVal = analyzerInput.value.trim();
    analyzerAlert.classList.add('alert-hidden');
    analyzerAlert.textContent = '';
    analyzerInput.classList.remove('error');

    if (!rawVal) {
      analyzerResults.style.display = 'none';
      return;
    }

    const details = IPUtils.getIPDetails(rawVal);
    if (!details) {
      analyzerAlert.textContent = '有効なIPv4またはIPv6アドレスを入力してください。';
      analyzerAlert.classList.remove('alert-hidden');
      analyzerInput.classList.add('error');
      analyzerResults.style.display = 'none';
      return;
    }

    analyzerResults.style.display = 'block';
    detVersion.textContent = `IPv${details.version}`;
    detStandard.textContent = details.standard;
    detScope.textContent = details.scope;
    detReverse.textContent = details.reverseDNS || '-';
    detHex.textContent = details.hex;
    detBinary.textContent = details.binary;

    if (details.version === 4) {
      detFullRow.style.display = 'none';
      detDecimalRow.style.display = 'table-row';
      detDecimal.textContent = details.decimal.toLocaleString();
    } else {
      detFullRow.style.display = 'table-row';
      detFull.textContent = details.full;
      detDecimalRow.style.display = 'none';
    }
  }

  analyzerInput.addEventListener('input', updateAnalyzer);

  document.querySelectorAll('[data-fill-analyzer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      analyzerInput.value = btn.getAttribute('data-fill-analyzer');
      updateAnalyzer();
      analyzerInput.focus();
    });
  });
});

