/**
 * reverseDNS.js - Standalone Controller for reverseDNS.html
 */

document.addEventListener('DOMContentLoaded', () => {
  const { IPUtils } = window;

  const inputEl = document.getElementById('input');
  const alertBox = document.getElementById('alert-box');
  const outputMain = document.getElementById('output-main');
  const outputLabel = document.getElementById('output-label');
  const outputBadge = document.getElementById('output-badge');
  const outputExtraWrap = document.getElementById('output-extra-wrap');
  const outputExtra = document.getElementById('output-extra');

  function convert() {
    const raw = inputEl.value.trim();
    alertBox.classList.add('alert-hidden');
    alertBox.textContent = '';
    inputEl.classList.remove('error');
    outputExtraWrap.style.display = 'none';

    if (!raw) {
      outputMain.textContent = '-';
      outputLabel.textContent = '変換結果';
      outputBadge.textContent = 'PTR Record';
      return;
    }

    // Check if Reverse DNS string (.in-addr.arpa or .ip6.arpa)
    const reversed = IPUtils.reverseDNSToIP(raw);
    if (reversed) {
      outputLabel.textContent = reversed.type === 'ipv4' ? 'IPv4 アドレス' : 'IPv6 アドレス (RFC 5952 推奨)';
      outputBadge.textContent = reversed.type === 'ipv4' ? 'IPv4' : 'IPv6';
      outputMain.textContent = reversed.ip;

      if (reversed.fullIPv6) {
        outputExtraWrap.style.display = 'block';
        outputExtra.textContent = reversed.fullIPv6;
      }
      return;
    }

    // Check if IP address (IPv4 or IPv6)
    const ptr = IPUtils.ipToReverseDNS(raw);
    if (ptr) {
      outputLabel.textContent = '逆引きDNS (PTR レコード)';
      outputBadge.textContent = ptr.type === 'ipv4' ? 'in-addr.arpa' : 'ip6.arpa';
      outputMain.textContent = ptr.record;
      return;
    }

    // Invalid input
    alertBox.textContent = '有効なIPアドレス (例: 192.168.1.1, 2001:db8::1) または逆引きレコード (.in-addr.arpa, .ip6.arpa) を入力してください。';
    alertBox.classList.remove('alert-hidden');
    inputEl.classList.add('error');
    outputMain.textContent = '-';
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
