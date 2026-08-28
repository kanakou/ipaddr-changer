/**
 * nat64.js - Standalone Controller for nat64.html
 */

document.addEventListener('DOMContentLoaded', () => {
  const { IPUtils } = window;

  const inputEl = document.getElementById('input');
  const alertBox = document.getElementById('alert-box');
  const outV4 = document.getElementById('output-v4');
  const outWkp = document.getElementById('output-wkp');
  const outFull = document.getElementById('output-full');
  const outMapped = document.getElementById('output-mapped');
  const outMappedHex = document.getElementById('output-mapped-hex');
  const outMappedFull = document.getElementById('output-mapped-full');

  let mode = 'auto'; // 'auto' | 'v4tov6' | 'v6tov4'

  const modeAuto = document.getElementById('mode-auto');
  const modeV4ToV6 = document.getElementById('mode-v4tov6');
  const modeV6ToV4 = document.getElementById('mode-v6tov4');

  function setMode(newMode) {
    mode = newMode;
    [modeAuto, modeV4ToV6, modeV6ToV4].forEach((b) => b.classList.remove('active'));
    if (mode === 'auto') modeAuto.classList.add('active');
    else if (mode === 'v4tov6') modeV4ToV6.classList.add('active');
    else if (mode === 'v6tov4') modeV6ToV4.classList.add('active');
    convert();
  }

  modeAuto.addEventListener('click', () => setMode('auto'));
  modeV4ToV6.addEventListener('click', () => setMode('v4tov6'));
  modeV6ToV4.addEventListener('click', () => setMode('v6tov4'));

  function convert() {
    const val = inputEl.value.trim();
    alertBox.classList.add('alert-hidden');
    alertBox.textContent = '';
    inputEl.classList.remove('error');

    if (!val) {
      clearOutputs();
      return;
    }

    const isV4 = IPUtils.isValidIPv4(val);
    const isV6 = IPUtils.isValidIPv6(val);

    if (mode === 'v4tov6') {
      if (!isV4) {
        showError('有効なIPv4アドレス (例: 192.0.2.1) を入力してください。');
        return;
      }
      renderOutputs(val);
      return;
    }

    if (mode === 'v6tov4') {
      if (!isV6) {
        showError('有効なIPv6アドレス (例: 64:ff9b::c000:201) を入力してください。');
        return;
      }
      const extracted = IPUtils.convertNat64ToV4(val) || IPUtils.convertMappedToV4(val);
      if (!extracted) {
        showError('NAT64 (64:ff9b::/96) または IPv4写像 (::ffff:0:0/96) のアドレスではありません。');
        return;
      }
      renderOutputs(extracted);
      return;
    }

    // Auto
    if (isV4) {
      renderOutputs(val);
    } else if (isV6) {
      const extracted = IPUtils.convertNat64ToV4(val) || IPUtils.convertMappedToV4(val);
      if (!extracted) {
        showError('NAT64 (64:ff9b::/96) または IPv4写像 (::ffff:0:0/96) のアドレスではありません。');
        return;
      }
      renderOutputs(extracted);
    } else {
      showError('無効なIPアドレスです。正しいIPv4またはIPv6アドレスを入力してください。');
    }
  }

  function renderOutputs(v4Str) {
    const nat64 = IPUtils.convertV4ToNat64(v4Str);
    const mapped = IPUtils.convertV4ToMapped(v4Str);
    if (outV4) outV4.textContent = v4Str;
    if (outWkp) outWkp.textContent = nat64.standard;
    if (outFull) outFull.textContent = nat64.full;
    if (outMapped) outMapped.textContent = mapped.dotted;
    if (outMappedHex) outMappedHex.textContent = mapped.hex || mapped.standard;
    if (outMappedFull) outMappedFull.textContent = mapped.full;
  }

  function clearOutputs() {
    if (outV4) outV4.textContent = '-';
    if (outWkp) outWkp.textContent = '-';
    if (outFull) outFull.textContent = '-';
    if (outMapped) outMapped.textContent = '-';
    if (outMappedHex) outMappedHex.textContent = '-';
    if (outMappedFull) outMappedFull.textContent = '-';
  }

  function showError(msg) {
    alertBox.textContent = msg;
    alertBox.classList.remove('alert-hidden');
    inputEl.classList.add('error');
    clearOutputs();
  }

  inputEl.addEventListener('input', convert);

  document.querySelectorAll('[data-fill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      inputEl.value = btn.getAttribute('data-fill');
      convert();
      inputEl.focus();
    });
  });

  // Copy button
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
    });
  });
});