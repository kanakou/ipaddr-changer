/**
 * ip-utils.js
 * IPアドレスのパース、バリデーション、相互変換を行う高精度ユーティリティライブラリ
 * RFC 4291, RFC 5952, RFC 6052, RFC 1035 準拠
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
      // 0-255 の整数チェック（空文字や余分な文字、リーディングゼロのチェック）
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
        // IPv4部分を2つの16進数ブロックに置き換える
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

    // 各要素が有効な16進数か検証 (1〜4文字の 0-9a-f)
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

    // 16bitワード (8個) の配列を構築
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

    // 16バイト配列へ変換
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
   * - 小文字
   * - 連続するゼロの最長グループを :: で圧縮 (長さ2以上、同長なら先頭優先)
   * - 16進ブロック内の先行ゼロ除去
   * @param {Uint8Array} bytes
   * @param {Object} options
   * @param {boolean} [options.compress=true] :: による圧縮を行うか
   * @param {boolean} [options.full=false] 完全展開形式 (各ブロック4桁、コロン7個) で出力するか
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

    // 最長連続ゼロの検索 (RFC 5952 section 4.2)
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
   * IPv4 アドレスを NAT64 プレフィックス (RFC 6052 /96 Well-Known: 64:ff9b::/96) を持つ IPv6 アドレスに変換
   * @param {string} ipv4Str
   * @param {string} [prefix='64:ff9b::'] /96 prefix
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

    // /96 の場合、末尾 4 バイト (12〜15) に IPv4 を埋め込む
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
   * NAT64 IPv6 アドレス (64:ff9b::/96) から IPv4 アドレスを抽出・変換
   * @param {string} ipv6Str
   * @param {string} [expectedPrefix='64:ff9b::']
   * @returns {string | null}
   */
  function convertNat64ToV4(ipv6Str, expectedPrefix = NAT64_WKP_PREFIX) {
    const bytes = parseIPv6(ipv6Str);
    if (!bytes) return null;

    // プレフィックスの検証 (先頭12バイトが 64:ff9b::/96 か)
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

    const v4Bytes = bytes.slice(12, 16);
    return formatIPv4(v4Bytes);
  }

  /**
   * IPv4 を IPv4-Mapped IPv6 アドレス (::ffff:x.x.x.x / RFC 4291) に変換
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
   * IPv4-Mapped IPv6 アドレスから IPv4 を抽出
   * @param {string} ipv6Str
   * @returns {string | null}
   */
  function convertMappedToV4(ipv6Str) {
    const bytes = parseIPv6(ipv6Str);
    if (!bytes) return null;

    // 先頭10バイトが0、10〜11バイトが0xffffか
    for (let i = 0; i < 10; i++) {
      if (bytes[i] !== 0) return null;
    }
    if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null;

    return formatIPv4(bytes.slice(12, 16));
  }

  /**
   * IP アドレス (IPv4 / IPv6) を逆引き DNS (PTR レコード名) に変換
   * IPv4: 192.0.2.1 -> 1.2.0.192.in-addr.arpa
   * IPv6: 2001:db8::1 -> 1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa
   * @param {string} ipStr
   * @returns {{ record: string, type: 'ipv4' | 'ipv6' } | null}
   */
  function ipToReverseDNS(ipStr) {
    const v4Bytes = parseIPv4(ipStr);
    if (v4Bytes) {
      const reversed = Array.from(v4Bytes).reverse().join('.');
      return {
        record: `${reversed}.in-addr.arpa`,
        type: 'ipv4',
      };
    }

    const v6Bytes = parseIPv6(ipStr);
    if (v6Bytes) {
      const nibbles = [];
      for (let i = 0; i < 16; i++) {
        const b = v6Bytes[i];
        nibbles.push(((b >> 4) & 0xf).toString(16));
        nibbles.push((b & 0xf).toString(16));
      }
      const reversedNibbles = nibbles.reverse().join('.');
      return {
        record: `${reversedNibbles}.ip6.arpa`,
        type: 'ipv6',
      };
    }

    return null;
  }

  /**
   * 逆引き DNS (PTR レコード名) から IP アドレス (IPv4 / IPv6) を復元
   * @param {string} reverseDnsStr
   * @returns {{ ip: string, type: 'ipv4' | 'ipv6', fullIPv6?: string } | null}
   */
  function reverseDNSToIP(reverseDnsStr) {
    if (typeof reverseDnsStr !== 'string') return null;
    const trimmed = reverseDnsStr.trim().toLowerCase().replace(/\.$/, ''); // 末尾のFQDNドットを許容

    if (trimmed.endsWith('.in-addr.arpa')) {
      const prefix = trimmed.slice(0, -'.in-addr.arpa'.length);
      const parts = prefix.split('.');
      if (parts.length !== 4) return null;

      const octets = [];
      for (const p of parts) {
        if (!/^\d+$/.test(p)) return null;
        if (p.length > 1 && p.startsWith('0')) return null;
        const n = Number(p);
        if (n < 0 || n > 255) return null;
        octets.push(n);
      }
      const v4 = octets.reverse().join('.');
      return {
        ip: v4,
        type: 'ipv4',
      };
    }

    if (trimmed.endsWith('.ip6.arpa')) {
      const prefix = trimmed.slice(0, -'.ip6.arpa'.length);
      const parts = prefix.split('.');
      if (parts.length !== 32) return null;

      const nibbles = [];
      for (const p of parts) {
        if (!/^[0-9a-f]$/.test(p)) return null;
        nibbles.push(p);
      }
      const reversed = nibbles.reverse();

      const bytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        const high = parseInt(reversed[i * 2], 16);
        const low = parseInt(reversed[i * 2 + 1], 16);
        bytes[i] = (high << 4) | low;
      }

      return {
        ip: formatIPv6(bytes, { compress: true }),
        fullIPv6: formatIPv6(bytes, { full: true }),
        type: 'ipv6',
      };
    }

    return null;
  }

  /**
   * IPアドレスの包括的詳細情報を取得
   * @param {string} ipStr
   * @returns {Object | null}
   */
  function getIPDetails(ipStr) {
    const v4 = parseIPv4(ipStr);
    if (v4) {
      const num = ((v4[0] << 24) >>> 0) + (v4[1] << 16) + (v4[2] << 8) + v4[3];
      const binary = Array.from(v4)
        .map((b) => b.toString(2).padStart(8, '0'))
        .join('.');
      const hex = '0x' + Array.from(v4).map((b) => b.toString(16).padStart(2, '0')).join('');
      const reverse = ipToReverseDNS(ipStr);
      const nat64 = convertV4ToNat64(ipStr);
      const mapped = convertV4ToMapped(ipStr);

      let scope = 'Public (グローバル)';
      if (v4[0] === 10 || (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) || (v4[0] === 192 && v4[1] === 168)) {
        scope = 'Private (RFC 1918 プライベート)';
      } else if (v4[0] === 127) {
        scope = 'Loopback (127.0.0.0/8 ループバック)';
      } else if (v4[0] === 169 && v4[1] === 254) {
        scope = 'Link-Local (169.254.0.0/16 リンクローカル)';
      } else if (v4[0] >= 224 && v4[0] <= 239) {
        scope = 'Multicast (224.0.0.0/4 マルチキャスト)';
      } else if (v4[0] === 0) {
        scope = 'Current Network (0.0.0.0/8)';
      } else if (v4[0] === 255 && v4[1] === 255 && v4[2] === 255 && v4[3] === 255) {
        scope = 'Broadcast (ブロードキャスト)';
      }

      return {
        version: 4,
        standard: formatIPv4(v4),
        decimal: num,
        binary,
        hex,
        scope,
        reverseDNS: reverse ? reverse.record : null,
        nat64: nat64 ? nat64.standard : null,
        mapped: mapped ? mapped.dotted : null,
      };
    }

    const v6 = parseIPv6(ipStr);
    if (v6) {
      const full = formatIPv6(v6, { full: true });
      const standard = formatIPv6(v6, { compress: true });
      const binary = Array.from(v6)
        .map((b) => b.toString(2).padStart(8, '0'))
        .join(':');
      const hex = '0x' + Array.from(v6).map((b) => b.toString(16).padStart(2, '0')).join('');
      const reverse = ipToReverseDNS(ipStr);

      let scope = 'Global Unicast (グローバルユニキャスト)';
      const words = bytesToWords(v6);
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

      const extractedV4 = convertNat64ToV4(ipStr) || convertMappedToV4(ipStr);

      return {
        version: 6,
        standard,
        full,
        binary,
        hex,
        scope,
        reverseDNS: reverse ? reverse.record : null,
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

