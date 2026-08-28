/**
 * reverseDNS.js - Standalone Controller for reverseDNS.html
 */

document.addEventListener('DOMContentLoaded', () => {
  const { IPUtils } = window;

  const inputEl = document.getElementById('input');
  const alertBox = document.getElementById('alert-box');
  const warnBox = document.getElementById('warn-box');
  const outputMain = document.getElementById('output-main');
  const outputLabel = document.getElementById('output-label');
  const outputBadge = document.getElementById('output-badge');
  const outputOriginWrap = document.getElementById('output-origin-wrap');
  const outputOrigin = document.getElementById('output-origin');
  const outputRfc2317Wrap = document.getElementById('output-rfc2317-wrap');
  const outputRfc2317 = document.getElementById('output-rfc2317');
  const outputExtraWrap = document.getElementById('output-extra-wrap');
  const outputExtra = document.getElementById('output-extra');

  function convert() {
    const raw = inputEl.value.trim();
    alertBox.classList.add('alert-hidden');
    alertBox.textContent = '';
    warnBox.classList.add('alert-hidden');
    warnBox.textContent = '';
    inputEl.classList.remove('error');
    outputExtraWrap.style.display = 'none';
    outputRfc2317Wrap.style.display = 'none';
    outputOriginWrap.style.display = 'block';

    if (!raw) {
      outputMain.textContent = '-';
      outputOrigin.textContent = '-';
      outputLabel.textContent = '変換結果 (レコード / ゾーン名)';
      outputBadge.textContent = 'PTR Record';
      return;
    }

    // Check if Reverse DNS string (.in-addr.arpa or .ip6.arpa)
    const reversed = IPUtils.reverseDNSToIP(raw);
    if (reversed) {
      const isZone = reversed.isZone;
      outputLabel.textContent = reversed.type === 'ipv4'
        ? (isZone ? `IPv4 サブネットネットワーク (/${reversed.prefix})` : 'IPv4 アドレス')
        : (isZone ? `IPv6 プレフィックスネットワーク (/${reversed.prefix})` : 'IPv6 アドレス (RFC 5952 推奨)');
      outputBadge.textContent = isZone ? 'Network / CIDR' : (reversed.type === 'ipv4' ? 'IPv4 Host' : 'IPv6 Host');
      outputMain.textContent = reversed.ip;
      outputOriginWrap.style.display = 'none';

      if (reversed.fullIPv6) {
        outputExtraWrap.style.display = 'block';
        outputExtra.textContent = reversed.fullIPv6;
      }
      return;
    }

    // Check if IP or CIDR (IPv4 or IPv6)
    const ptr = IPUtils.ipToReverseDNS(raw);
    if (ptr) {
      if (ptr.isZone) {
        outputLabel.textContent = `逆引き委任ゾーン名 (/${ptr.prefix} 委任ゾーン)`;
        outputBadge.textContent = 'Zone Name';
      } else {
        outputLabel.textContent = '逆引きDNS (PTR レコード名)';
        outputBadge.textContent = ptr.type === 'ipv4' ? 'in-addr.arpa' : 'ip6.arpa';
      }

      outputMain.textContent = ptr.record;
      outputOrigin.textContent = ptr.origin;

      if (ptr.warning) {
        warnBox.textContent = `⚠️ ${ptr.warning}`;
        warnBox.classList.remove('alert-hidden');
      }

      if (ptr.rfc2317) {
        outputRfc2317Wrap.style.display = 'block';
        outputRfc2317.textContent = ptr.rfc2317.subnetZoneHyphen;
      }
      return;
    }

    // Invalid input
    alertBox.textContent = '有効なIPアドレス (例: 192.168.1.1, 2001:db8::1)、CIDRプレフィックス (例: 192.168.1.0/24, 2001:db8::/32)、または逆引きレコード/ゾーン (.in-addr.arpa, .ip6.arpa) を入力してください。';
    alertBox.classList.remove('alert-hidden');
    inputEl.classList.add('error');
    outputMain.textContent = '-';
    outputOrigin.textContent = '-';
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
