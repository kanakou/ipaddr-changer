/**
 * ip-utils.js
 * IPアドレスのパース、バリデーション、相互変換を行う高精度ユーティリティライブラリ
 * RFC 4291, RFC 5952, RFC 6052, RFC 1035, RFC 2317 準拠
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.IPUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NAT64_WKP_PREFIX = '64:ff9b::';
  const IPV4_MAPPED_PREFIX = '::ffff:';

  /**
   * IPv4アドレスの文字列をパースして4バイトの配列 (Uint8Array) を返す
   * @param {string} ipStr
   * @returns {Uint8Array | null}
   */
  function parseIPv4(ipStr) {
    if (typeof ipStr !== 'string') return null;
    const trimmed = ipStr.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 4) return null;

    const bytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      const part = parts[i];
      if (!/^\d+$/.test(part)) return null;
      if (part.length > 1 && part.startsWith('0')) return null; // 01 などの8進数誤認防止
      const num = Number(part);
      if (num < 0 || num > 255 || !Number.isInteger(num)) return null;
      bytes[i] = num;
    }
    return bytes;
  }

  /**
   * IPv4アドレスのバリデーション
   * @param {string} ipStr
   * @returns {boolean}
   */
  function isValidIPv4(ipStr) {
    return parseIPv4(ipStr) !== null;
  }

  /**
   * 4バイト配列をIPv4ドット10進表記文字列に変換
   * @param {Uint8Array | number[]} bytes
   * @returns {string}
   */
  function formatIPv4(bytes) {
    if (!bytes || bytes.length !== 4) throw new Error('Invalid IPv4 bytes');
    return Array.from(bytes).join('.');
  }

  /**
   * IPv6アドレスの文字列をパースして16バイトの配列 (Uint8Array) を返す
   * RFC 4291 準拠 (省略記法 ::、IPv4埋め込み表記含む)
   * @param {string} ipStr
   * @returns {Uint8Array | null}
   */
  function parseIPv6(ipStr) {
    if (typeof ipStr !== 'string') return null;
    let s = ipStr.trim().toLowerCase();
    if (!s) return null;

    // :: は最大1回のみ出現可能
    const doubleColonIndex = s.indexOf('::');
    if (doubleColonIndex !== -1 && s.indexOf('::', doubleColonIndex + 2) !== -1) {
      return null;
    }

    // IPv4埋め込み表記 (例: 64:ff9b::192.0.2.1, ::ffff:192.0.2.1) の処理
    const lastColon = s.lastIndexOf(':');
    if (lastColon !== -1) {
      const potentialV4 = s.slice(lastColon + 1);
      if (potentialV4.includes('.')) {
        const embeddedV4Bytes = parseIPv4(potentialV4);
        if (!embeddedV4Bytes) return null;
        const hex1 = ((embeddedV4Bytes[0] << 8) | embeddedV4Bytes[1]).toString(16);
        const hex2 = ((embeddedV4Bytes[2] << 8) | embeddedV4Bytes[3]).toString(16);
        s = s.slice(0, lastColon + 1) + hex1 + ':' + hex2;
      }
    }

    let left = [];
    let right = [];

    if (s.includes('::')) {
      const parts = s.split('::');
      if (parts[0]) {
        left = parts[0].split(':');
      }
      if (parts[1]) {
        right = parts[1].split(':');
      }
    } else {
      left = s.split(':');
    }

    const validateParts = (parts) => {
      for (const p of parts) {
        if (!/^[0-9a-f]{1,4}$/.test(p)) return false;
      }
      return true;
    };

    if (!validateParts(left) || !validateParts(right)) return null;

    const totalSpecified = left.length + right.length;
    if (s.includes('::')) {
      if (totalSpecified > 7) return null;
    } else {
      if (totalSpecified !== 8) return null;
    }

    const words = new Uint16Array(8);
    let wordIdx = 0;
    for (const p of left) {
      words[wordIdx++] = parseInt(p, 16);
    }
    const zerosToFill = 8 - totalSpecified;
    for (let i = 0; i < zerosToFill; i++) {
      words[wordIdx++] = 0;
    }
    for (const p of right) {
      words[wordIdx++] = parseInt(p, 16);
    }

    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
      bytes[i * 2] = (words[i] >> 8) & 0xff;
      bytes[i * 2 + 1] = words[i] & 0xff;
    }
    return bytes;
  }

  /**
   * IPv6アドレスのバリデーション
   * @param {string} ipStr
   * @returns {boolean}
   */
  function isValidIPv6(ipStr) {
    return parseIPv6(ipStr) !== null;
  }

  /**
   * 16バイト配列から16bitワード (8個) を取得
   * @param {Uint8Array} bytes
   * @returns {number[]}
   */
  function bytesToWords(bytes) {
    const words = [];
    for (let i = 0; i < 16; i += 2) {
      words.push((bytes[i] << 8) | bytes[i + 1]);
    }
    return words;
  }

  /**
   * 16バイト配列を RFC 5952 推奨表記の IPv6 文字列に変換
   * @param {Uint8Array} bytes
   * @param {Object} [options]
   * @param {boolean} [options.compress=true]
   * @param {boolean} [options.full=false]
   * @returns {string}
   */
  function formatIPv6(bytes, options = {}) {
    if (!bytes || bytes.length !== 16) throw new Error('Invalid IPv6 bytes');
    const { compress = true, full = false } = options;

    const words = bytesToWords(bytes);

    if (full) {
      return words.map((w) => w.toString(16).padStart(4, '0')).join(':');
    }

    if (!compress) {
      return words.map((w) => w.toString(16)).join(':');
    }

    let bestStart = -1;
    let bestLen = 0;
    let curStart = -1;
    let curLen = 0;

    for (let i = 0; i < 8; i++) {
      if (words[i] === 0) {
        if (curStart === -1) {
          curStart = i;
          curLen = 1;
        } else {
          curLen++;
        }
      } else {
        if (curStart !== -1) {
          if (curLen > bestLen && curLen >= 2) {
            bestStart = curStart;
            bestLen = curLen;
          }
          curStart = -1;
          curLen = 0;
        }
      }
    }
    if (curStart !== -1 && curLen > bestLen && curLen >= 2) {
      bestStart = curStart;
      bestLen = curLen;
    }

    if (bestLen >= 2) {
      const left = words.slice(0, bestStart).map((w) => w.toString(16)).join(':');
      const right = words.slice(bestStart + bestLen).map((w) => w.toString(16)).join(':');
      return `${left}::${right}`;
    }

    return words.map((w) => w.toString(16)).join(':');
  }

  /**
   * IPv6アドレス文字列を展開形式 (8ブロック4桁) にフォーマット
   * @param {string} ipStr
   * @returns {string | null}
   */
  function expandIPv6(ipStr) {
    const bytes = parseIPv6(ipStr);
    if (!bytes) return null;
    return formatIPv6(bytes, { full: true });
  }

  /**
   * IPv6アドレス文字列を RFC 5952 最適圧縮形式にフォーマット
   * @param {string} ipStr
   * @returns {string | null}
   */
  function compressIPv6(ipStr) {
    const bytes = parseIPv6(ipStr);
    if (!bytes) return null;
    return formatIPv6(bytes, { compress: true });
  }

  /**
   * CIDR表記 (または単一IP) をパースする
   * @param {string} input
   * @returns {{ ip: string, prefix: number, type: 'ipv4' | 'ipv6', bytes: Uint8Array, isCIDR: boolean } | null}
   */
  function parseCIDR(input) {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    const slashIdx = trimmed.indexOf('/');
    if (slashIdx !== -1) {
      const ipPart = trimmed.slice(0, slashIdx).trim();
      const prefixPart = trimmed.slice(slashIdx + 1).trim();
      if (!/^\d+$/.test(prefixPart)) return null;
      const prefix = Number(prefixPart);

      const v4Bytes = parseIPv4(ipPart);
      if (v4Bytes) {
        if (prefix < 0 || prefix > 32) return null;
        return {
          ip: formatIPv4(v4Bytes),
          prefix,
          type: 'ipv4',
          bytes: v4Bytes,
          isCIDR: true,
        };
      }

      const v6Bytes = parseIPv6(ipPart);
      if (v6Bytes) {
        if (prefix < 0 || prefix > 128) return null;
        return {
          ip: formatIPv6(v6Bytes, { compress: true }),
          prefix,
          type: 'ipv6',
          bytes: v6Bytes,
          isCIDR: true,
        };
      }

      return null;
    }

    // スラッシュなし (単一ホスト)
    const v4Bytes = parseIPv4(trimmed);
    if (v4Bytes) {
      return {
        ip: formatIPv4(v4Bytes),
        prefix: 32,
        type: 'ipv4',
        bytes: v4Bytes,
        isCIDR: false,
      };
    }

    const v6Bytes = parseIPv6(trimmed);
    if (v6Bytes) {
      return {
        ip: formatIPv6(v6Bytes, { compress: true }),
        prefix: 128,
        type: 'ipv6',
        bytes: v6Bytes,
        isCIDR: false,
      };
    }

    return null;
  }

  /**
   * IPv4 アドレスを NAT64 プレフィックス (RFC 6052 /96: 64:ff9b::/96) を持つ IPv6 に変換
   * @param {string} ipv4Str
   * @param {string} [prefix='64:ff9b::']
   * @returns {{ standard: string, full: string, embedded: string } | null}
   */
  function convertV4ToNat64(ipv4Str, prefix = NAT64_WKP_PREFIX) {
    const v4Bytes = parseIPv4(ipv4Str);
    if (!v4Bytes) return null;

    const prefixClean = prefix.trim();
    let pBytes;
    if (prefixClean === NAT64_WKP_PREFIX || prefixClean === '64:ff9b::/96') {
      pBytes = new Uint8Array(16);
      pBytes[0] = 0x00;
      pBytes[1] = 0x64;
      pBytes[2] = 0xff;
      pBytes[3] = 0x9b;
    } else {
      const parsed = parseIPv6(prefixClean.replace(/\/96$/, ''));
      if (!parsed) return null;
      pBytes = new Uint8Array(parsed);
    }

    pBytes[12] = v4Bytes[0];
    pBytes[13] = v4Bytes[1];
    pBytes[14] = v4Bytes[2];
    pBytes[15] = v4Bytes[3];

    const standard = formatIPv6(pBytes, { compress: true });
    const full = formatIPv6(pBytes, { full: true });
    const v4Formatted = formatIPv4(v4Bytes);
    const embedded = `${NAT64_WKP_PREFIX}${v4Formatted}`;

    return { standard, full, embedded };
  }

  /**
   * NAT64 IPv6 アドレスから IPv4 を抽出
   * @param {string} ipv6Str
   * @param {string} [expectedPrefix='64:ff9b::']
   * @returns {string | null}
   */
  function convertNat64ToV4(ipv6Str, expectedPrefix = NAT64_WKP_PREFIX) {
    const bytes = parseIPv6(ipv6Str);
    if (!bytes) return null;

    if (expectedPrefix === NAT64_WKP_PREFIX || expectedPrefix === '64:ff9b::/96') {
      if (bytes[0] !== 0x00 || bytes[1] !== 0x64 || bytes[2] !== 0xff || bytes[3] !== 0x9b) {
        return null;
      }
      for (let i = 4; i < 12; i++) {
        if (bytes[i] !== 0x00) return null;
      }
    } else {
      const expBytes = parseIPv6(expectedPrefix.replace(/\/96$/, ''));
      if (!expBytes) return null;
      for (let i = 0; i < 12; i++) {
        if (bytes[i] !== expBytes[i]) return null;
      }
    }

    return formatIPv4(bytes.slice(12, 16));
  }

  /**
   * IPv4 を IPv4-Mapped IPv6 に変換
   * @param {string} ipv4Str
   * @returns {{ standard: string, full: string, dotted: string } | null}
   */
  function convertV4ToMapped(ipv4Str) {
    const v4Bytes = parseIPv4(ipv4Str);
    if (!v4Bytes) return null;

    const bytes = new Uint8Array(16);
    bytes[10] = 0xff;
    bytes[11] = 0xff;
    bytes[12] = v4Bytes[0];
    bytes[13] = v4Bytes[1];
    bytes[14] = v4Bytes[2];
    bytes[15] = v4Bytes[3];

    const standard = formatIPv6(bytes, { compress: true });
    const full = formatIPv6(bytes, { full: true });
    const dotted = `::ffff:${formatIPv4(v4Bytes)}`;

    return { standard, full, dotted };
  }

  /**
   * IPv4-Mapped IPv6 から IPv4 を抽出
   * @param {string} ipv6Str
   * @returns {string | null}
   */
  function convertMappedToV4(ipv6Str) {
    const bytes = parseIPv6(ipv6Str);
    if (!bytes) return null;

    for (let i = 0; i < 10; i++) {
      if (bytes[i] !== 0) return null;
    }
    if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null;

    return formatIPv4(bytes.slice(12, 16));
  }

  /**
   * IP アドレスまたは CIDR プレフィックスを逆引き DNS (PTR レコード / 委任ゾーン名) に変換
   * @param {string} ipOrCidr
   * @returns {Object | null}
   */
  function ipToReverseDNS(ipOrCidr) {
    const parsed = parseCIDR(ipOrCidr);
    if (!parsed) return null;

    const { type, prefix, bytes, isCIDR } = parsed;

    if (type === 'ipv4') {
      // IPv4
      if (prefix === 32 && !isCIDR) {
        // 単一ホスト (PTR レコード)
        const reversed = Array.from(bytes).reverse().join('.');
        const record = `${reversed}.in-addr.arpa`;
        return {
          record,
          origin: `${record}.`,
          type: 'ipv4',
          prefix: 32,
          isZone: false,
          network: formatIPv4(bytes),
        };
      }

      // CIDR サブネット / ゾーン
      if (prefix === 32) {
        const reversed = Array.from(bytes).reverse().join('.');
        const record = `${reversed}.in-addr.arpa`;
        return {
          record,
          origin: `${record}.`,
          type: 'ipv4',
          prefix: 32,
          isZone: false,
          network: `${formatIPv4(bytes)}/32`,
        };
      }

      if (prefix === 24) {
        const record = `${bytes[2]}.${bytes[1]}.${bytes[0]}.in-addr.arpa`;
        return {
          record,
          origin: `${record}.`,
          type: 'ipv4',
          prefix: 24,
          isZone: true,
          network: `${bytes[0]}.${bytes[1]}.${bytes[2]}.0/24`,
        };
      }

      if (prefix === 16) {
        const record = `${bytes[1]}.${bytes[0]}.in-addr.arpa`;
        return {
          record,
          origin: `${record}.`,
          type: 'ipv4',
          prefix: 16,
          isZone: true,
          network: `${bytes[0]}.${bytes[1]}.0.0/16`,
        };
      }

      if (prefix === 8) {
        const record = `${bytes[0]}.in-addr.arpa`;
        return {
          record,
          origin: `${record}.`,
          type: 'ipv4',
          prefix: 8,
          isZone: true,
          network: `${bytes[0]}.0.0.0/8`,
        };
      }

      if (prefix === 0) {
        const record = 'in-addr.arpa';
        return {
          record,
          origin: `${record}.`,
          type: 'ipv4',
          prefix: 0,
          isZone: true,
          network: '0.0.0.0/0',
        };
      }

      // オクテット境界以外 (例: /25〜/31, /17〜/23, /9〜/15, /1〜/7)
      if (prefix > 24) {
        const parentZone = `${bytes[2]}.${bytes[1]}.${bytes[0]}.in-addr.arpa`;
        const startHost = bytes[3] & (~((1 << (32 - prefix)) - 1) & 0xff);
        const rfc2317Slash = `${startHost}/${prefix}.${parentZone}`;
        const rfc2317Hyphen = `${startHost}-${prefix}.${parentZone}`;
        return {
          record: rfc2317Slash,
          origin: `${rfc2317Slash}.`,
          type: 'ipv4',
          prefix,
          isZone: true,
          parentZone: `${parentZone}.`,
          parentPrefix: 24,
          rfc2317: {
            parentZone: `${parentZone}.`,
            subnetZoneSlash: `${rfc2317Slash}.`,
            subnetZoneHyphen: `${rfc2317Hyphen}.`,
          },
          warning: `非オクテット境界 (/${prefix}) のサブネットです。RFC 2317 に基づく委任ゾーンまたは親ゾーン (${parentZone}.) で管理されます。`,
          network: `${bytes[0]}.${bytes[1]}.${bytes[2]}.${startHost}/${prefix}`,
        };
      }

      if (prefix > 16) {
        const parentZone = `${bytes[1]}.${bytes[0]}.in-addr.arpa`;
        return {
          record: parentZone,
          origin: `${parentZone}.`,
          type: 'ipv4',
          prefix,
          isZone: true,
          parentZone: `${parentZone}.`,
          parentPrefix: 16,
          warning: `非オクテット境界 (/${prefix}) のため、親ゾーン (${parentZone}.) または個別の /24 ゾーン群で管理されます。`,
          network: `${formatIPv4(bytes)}/${prefix}`,
        };
      }

      if (prefix > 8) {
        const parentZone = `${bytes[0]}.in-addr.arpa`;
        return {
          record: parentZone,
          origin: `${parentZone}.`,
          type: 'ipv4',
          prefix,
          isZone: true,
          parentZone: `${parentZone}.`,
          parentPrefix: 8,
          warning: `非オクテット境界 (/${prefix}) のため、親ゾーン (${parentZone}.) または個別の /16 ゾーン群で管理されます。`,
          network: `${formatIPv4(bytes)}/${prefix}`,
        };
      }

      return {
        record: 'in-addr.arpa',
        origin: 'in-addr.arpa.',
        type: 'ipv4',
        prefix,
        isZone: true,
        parentZone: 'in-addr.arpa.',
        parentPrefix: 0,
        warning: `非オクテット境界 (/${prefix}) のため、in-addr.arpa. または個別の /8 ゾーン群で管理されます。`,
        network: `${formatIPv4(bytes)}/${prefix}`,
      };
    }

    // IPv6
    const nibbles = [];
    for (let i = 0; i < 16; i++) {
      const b = bytes[i];
      nibbles.push(((b >> 4) & 0xf).toString(16));
      nibbles.push((b & 0xf).toString(16));
    }

    if (prefix === 128 && !isCIDR) {
      // 単一ホスト (PTR レコード)
      const reversed = nibbles.slice().reverse().join('.');
      const record = `${reversed}.ip6.arpa`;
      return {
        record,
        origin: `${record}.`,
        type: 'ipv6',
        prefix: 128,
        isZone: false,
        network: formatIPv6(bytes, { compress: true }),
      };
    }

    // ニブル境界 (4bit 境界: prefix % 4 === 0)
    if (prefix % 4 === 0) {
      const N = prefix / 4;
      let record;
      if (N === 0) {
        record = 'ip6.arpa';
      } else {
        const selected = nibbles.slice(0, N);
        record = `${selected.reverse().join('.')}.ip6.arpa`;
      }
      return {
        record,
        origin: `${record}.`,
        type: 'ipv6',
        prefix,
        nibbleCount: N,
        isZone: prefix < 128,
        network: `${formatIPv6(bytes, { compress: true })}/${prefix}`,
      };
    }

    // 非ニブル境界 (4の倍数以外、例: /58, /62)
    const lowerPrefix = Math.floor(prefix / 4) * 4;
    const N = lowerPrefix / 4;
    let parentRecord;
    if (N === 0) {
      parentRecord = 'ip6.arpa';
    } else {
      const selected = nibbles.slice(0, N);
      parentRecord = `${selected.reverse().join('.')}.ip6.arpa`;
    }

    return {
      record: parentRecord,
      origin: `${parentRecord}.`,
      type: 'ipv6',
      prefix,
      parentPrefix: lowerPrefix,
      parentZone: `${parentRecord}.`,
      nibbleCount: N,
      isZone: true,
      warning: `DNS (ip6.arpa) は 4 ビット (1 ニブル) 単位でのみ委任可能です。/${prefix} はニブル境界ではないため、親ニブルゾーン /${lowerPrefix} (${parentRecord}.) で委任・管理されます。`,
      network: `${formatIPv6(bytes, { compress: true })}/${prefix}`,
    };
  }

  /**
   * 逆引き DNS (PTR レコードまたはゾーン名) から IP / CIDR ネットワークを復元
   * @param {string} reverseDnsStr
   * @returns {Object | null}
   */
  function reverseDNSToIP(reverseDnsStr) {
    if (typeof reverseDnsStr !== 'string') return null;
    const trimmed = reverseDnsStr.trim().toLowerCase().replace(/\.$/, '');

    // .in-addr.arpa
    if (trimmed.endsWith('.in-addr.arpa') || trimmed === 'in-addr.arpa') {
      if (trimmed === 'in-addr.arpa') {
        return {
          ip: '0.0.0.0/0',
          type: 'ipv4',
          prefix: 0,
          isCIDR: true,
          isZone: true,
        };
      }

      const prefixStr = trimmed.slice(0, -'.in-addr.arpa'.length);

      // RFC 2317 形式のチェック (例: 0/25.1.168.192 または 0-25.1.168.192)
      const rfc2317Match = prefixStr.match(/^(\d+)[/-](\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (rfc2317Match) {
        const startHost = Number(rfc2317Match[1]);
        const pfx = Number(rfc2317Match[2]);
        const o3 = Number(rfc2317Match[3]);
        const o2 = Number(rfc2317Match[4]);
        const o1 = Number(rfc2317Match[5]);
        if (
          startHost >= 0 && startHost <= 255 &&
          pfx >= 1 && pfx <= 32 &&
          o3 >= 0 && o3 <= 255 &&
          o2 >= 0 && o2 <= 255 &&
          o1 >= 0 && o1 <= 255
        ) {
          return {
            ip: `${o1}.${o2}.${o3}.${startHost}/${pfx}`,
            type: 'ipv4',
            prefix: pfx,
            isCIDR: true,
            isZone: true,
            isRFC2317: true,
          };
        }
      }

      const parts = prefixStr.split('.');
      if (parts.length > 4 || parts.length === 0) return null;

      const octets = [];
      for (const p of parts) {
        if (!/^\d+$/.test(p)) return null;
        if (p.length > 1 && p.startsWith('0')) return null;
        const n = Number(p);
        if (n < 0 || n > 255) return null;
        octets.push(n);
      }

      const reversed = octets.slice().reverse();

      if (parts.length === 4) {
        // 完全なホスト (4 オクテット)
        return {
          ip: reversed.join('.'),
          type: 'ipv4',
          prefix: 32,
          isCIDR: false,
          isZone: false,
        };
      }

      if (parts.length === 3) {
        return {
          ip: `${reversed[0]}.${reversed[1]}.${reversed[2]}.0/24`,
          type: 'ipv4',
          prefix: 24,
          isCIDR: true,
          isZone: true,
        };
      }

      if (parts.length === 2) {
        return {
          ip: `${reversed[0]}.${reversed[1]}.0.0/16`,
          type: 'ipv4',
          prefix: 16,
          isCIDR: true,
          isZone: true,
        };
      }

      if (parts.length === 1) {
        return {
          ip: `${reversed[0]}.0.0.0/8`,
          type: 'ipv4',
          prefix: 8,
          isCIDR: true,
          isZone: true,
        };
      }
    }

    // .ip6.arpa
    if (trimmed.endsWith('.ip6.arpa') || trimmed === 'ip6.arpa') {
      if (trimmed === 'ip6.arpa') {
        return {
          ip: '::/0',
          fullIPv6: '0000:0000:0000:0000:0000:0000:0000:0000/0',
          type: 'ipv6',
          prefix: 0,
          isCIDR: true,
          isZone: true,
        };
      }

      const prefixStr = trimmed.slice(0, -'.ip6.arpa'.length);
      const parts = prefixStr.split('.');
      if (parts.length > 32 || parts.length === 0) return null;

      const nibbles = [];
      for (const p of parts) {
        if (!/^[0-9a-f]$/.test(p)) return null;
        nibbles.push(p);
      }

      const reversed = nibbles.slice().reverse();
      const N = reversed.length;
      const prefix = N * 4;

      // 32文字に0埋めパディング
      const paddedNibbles = reversed.concat(new Array(32 - N).fill('0'));

      const bytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        const high = parseInt(paddedNibbles[i * 2], 16);
        const low = parseInt(paddedNibbles[i * 2 + 1], 16);
        bytes[i] = (high << 4) | low;
      }

      const standard = formatIPv6(bytes, { compress: true });
      const full = formatIPv6(bytes, { full: true });

      if (N === 32) {
        return {
          ip: standard,
          fullIPv6: full,
          type: 'ipv6',
          prefix: 128,
          isCIDR: false,
          isZone: false,
        };
      }

      return {
        ip: `${standard}/${prefix}`,
        fullIPv6: `${full}/${prefix}`,
        type: 'ipv6',
        prefix,
        isCIDR: true,
        isZone: true,
        nibbleCount: N,
      };
    }

    return null;
  }

  /**
   * IPアドレスまたは CIDR の包括的詳細情報を取得
   * @param {string} ipStr
   * @returns {Object | null}
   */
  function getIPDetails(ipStr) {
    const parsed = parseCIDR(ipStr);
    if (!parsed) return null;

    const { type, prefix, isCIDR, bytes } = parsed;

    if (type === 'ipv4') {
      const num = ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
      const binary = Array.from(bytes)
        .map((b) => b.toString(2).padStart(8, '0'))
        .join('.');
      const hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      const reverse = ipToReverseDNS(ipStr);
      const nat64 = convertV4ToNat64(formatIPv4(bytes));
      const mapped = convertV4ToMapped(formatIPv4(bytes));

      let scope = 'Public (グローバル)';
      if (bytes[0] === 10 || (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] === 192 && bytes[1] === 168)) {
        scope = 'Private (RFC 1918 プライベート)';
      } else if (bytes[0] === 127) {
        scope = 'Loopback (127.0.0.0/8 ループバック)';
      } else if (bytes[0] === 169 && bytes[1] === 254) {
        scope = 'Link-Local (169.254.0.0/16 リンクローカル)';
      } else if (bytes[0] >= 224 && bytes[0] <= 239) {
        scope = 'Multicast (224.0.0.0/4 マルチキャスト)';
      } else if (bytes[0] === 0) {
        scope = 'Current Network (0.0.0.0/8)';
      } else if (bytes[0] === 255 && bytes[1] === 255 && bytes[2] === 255 && bytes[3] === 255) {
        scope = 'Broadcast (ブロードキャスト)';
      }

      return {
        version: 4,
        standard: isCIDR ? `${formatIPv4(bytes)}/${prefix}` : formatIPv4(bytes),
        prefix,
        isCIDR,
        decimal: num,
        binary,
        hex,
        scope,
        reverseDNS: reverse ? reverse.record : null,
        reverseOrigin: reverse ? reverse.origin : null,
        nat64: nat64 ? nat64.standard : null,
        mapped: mapped ? mapped.dotted : null,
      };
    }

    if (type === 'ipv6') {
      const full = formatIPv6(bytes, { full: true });
      const standard = formatIPv6(bytes, { compress: true });
      const binary = Array.from(bytes)
        .map((b) => b.toString(2).padStart(8, '0'))
        .join(':');
      const hex = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      const reverse = ipToReverseDNS(ipStr);

      let scope = 'Global Unicast (グローバルユニキャスト)';
      const words = bytesToWords(bytes);
      if (words.every((w) => w === 0)) {
        scope = 'Unspecified (::/128 未指定)';
      } else if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) {
        scope = 'Loopback (::1/128 ループバック)';
      } else if (words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every((w) => w === 0)) {
        scope = 'Well-Known NAT64 Prefix (64:ff9b::/96)';
      } else if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
        scope = 'IPv4-Mapped IPv6 (::ffff:0:0/96 写像アドレス)';
      } else if ((words[0] & 0xfe00) === 0xfc00) {
        scope = 'Unique Local Address (ULA - fc00::/7)';
      } else if ((words[0] & 0xffc0) === 0xfe80) {
        scope = 'Link-Local Unicast (fe80::/10 リンクローカル)';
      } else if ((words[0] & 0xff00) === 0xff00) {
        scope = 'Multicast (ff00::/8 マルチキャスト)';
      } else if (words[0] === 0x2001 && words[1] === 0x0db8) {
        scope = 'Documentation (2001:db8::/32 ドキュメント用)';
      }

      const extractedV4 = convertNat64ToV4(standard) || convertMappedToV4(standard);

      return {
        version: 6,
        standard: isCIDR ? `${standard}/${prefix}` : standard,
        full: isCIDR ? `${full}/${prefix}` : full,
        prefix,
        isCIDR,
        binary,
        hex,
        scope,
        reverseDNS: reverse ? reverse.record : null,
        reverseOrigin: reverse ? reverse.origin : null,
        extractedIPv4: extractedV4,
      };
    }

    return null;
  }

  return {
    NAT64_WKP_PREFIX,
    IPV4_MAPPED_PREFIX,
    isValidIPv4,
    isValidIPv6,
    parseIPv4,
    parseIPv6,
    parseCIDR,
    formatIPv4,
    formatIPv6,
    expandIPv6,
    compressIPv6,
    convertV4ToNat64,
    convertNat64ToV4,
    convertV4ToMapped,
    convertMappedToV4,
    ipToReverseDNS,
    reverseDNSToIP,
    getIPDetails,
  };
});
