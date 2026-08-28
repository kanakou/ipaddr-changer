const { test, describe } = require('node:test');
const assert = require('node:assert');
const IPUtils = require('../js/ip-utils.js');

describe('IPUtils IPv4 Tests', () => {
  test('isValidIPv4 valid addresses', () => {
    assert.strictEqual(IPUtils.isValidIPv4('0.0.0.0'), true);
    assert.strictEqual(IPUtils.isValidIPv4('192.168.1.1'), true);
    assert.strictEqual(IPUtils.isValidIPv4('255.255.255.255'), true);
    assert.strictEqual(IPUtils.isValidIPv4('8.8.8.8'), true);
  });

  test('isValidIPv4 invalid addresses', () => {
    assert.strictEqual(IPUtils.isValidIPv4('256.0.0.1'), false);
    assert.strictEqual(IPUtils.isValidIPv4('192.168.1'), false);
    assert.strictEqual(IPUtils.isValidIPv4('192.168.1.1.1'), false);
    assert.strictEqual(IPUtils.isValidIPv4('192.168.01.1'), false); // Leading zero
    assert.strictEqual(IPUtils.isValidIPv4('abc.def.ghi.jkl'), false);
    assert.strictEqual(IPUtils.isValidIPv4(''), false);
    assert.strictEqual(IPUtils.isValidIPv4(null), false);
  });
});

describe('IPUtils IPv6 Tests', () => {
  test('parse and compress IPv6 (RFC 5952)', () => {
    assert.strictEqual(IPUtils.compressIPv6('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
    assert.strictEqual(IPUtils.compressIPv6('2001:db8:0:0:1:0:0:1'), '2001:db8::1:0:0:1'); // first tie
    assert.strictEqual(IPUtils.compressIPv6('2001:db8:0:0:0:0:2:1'), '2001:db8::2:1');
    assert.strictEqual(IPUtils.compressIPv6('0:0:0:0:0:0:0:1'), '::1');
    assert.strictEqual(IPUtils.compressIPv6('0:0:0:0:0:0:0:0'), '::');
    assert.strictEqual(IPUtils.compressIPv6('::1'), '::1');
    assert.strictEqual(IPUtils.compressIPv6('::'), '::');
  });

  test('expand IPv6 to 32 hex chars with colons', () => {
    assert.strictEqual(IPUtils.expandIPv6('::1'), '0000:0000:0000:0000:0000:0000:0000:0001');
    assert.strictEqual(IPUtils.expandIPv6('2001:db8::1'), '2001:0db8:0000:0000:0000:0000:0000:0001');
    assert.strictEqual(IPUtils.expandIPv6('64:ff9b::192.0.2.1'), '0064:ff9b:0000:0000:0000:0000:c000:0201');
  });

  test('isValidIPv6 invalid addresses', () => {
    assert.strictEqual(IPUtils.isValidIPv6('1200::AB00:1234::2552:7777:1313'), false); // Double ::
    assert.strictEqual(IPUtils.isValidIPv6('1200:1200:1200:1200:1200:1200:1200:1200:1200'), false); // Too many
    assert.strictEqual(IPUtils.isValidIPv6('2001:xyz::1'), false); // Non-hex
    assert.strictEqual(IPUtils.isValidIPv6(''), false);
  });
});

describe('NAT64 and IPv4-Mapped Conversion Tests', () => {
  test('convertV4ToNat64', () => {
    const res = IPUtils.convertV4ToNat64('192.0.2.1');
    assert.ok(res);
    assert.strictEqual(res.standard, '64:ff9b::c000:201');
    assert.strictEqual(res.full, '0064:ff9b:0000:0000:0000:0000:c000:0201');
    assert.strictEqual(res.embedded, '64:ff9b::192.0.2.1');
  });

  test('convertNat64ToV4 from hex and dotted representations', () => {
    assert.strictEqual(IPUtils.convertNat64ToV4('64:ff9b::c000:201'), '192.0.2.1');
    assert.strictEqual(IPUtils.convertNat64ToV4('0064:ff9b:0000:0000:0000:0000:c000:0201'), '192.0.2.1');
    assert.strictEqual(IPUtils.convertNat64ToV4('64:ff9b::192.0.2.1'), '192.0.2.1');
    assert.strictEqual(IPUtils.convertNat64ToV4('2001:db8::1'), null); // wrong prefix
  });

  test('convertV4ToMapped and convertMappedToV4', () => {
    const res = IPUtils.convertV4ToMapped('192.168.1.100');
    assert.ok(res);
    assert.strictEqual(res.standard, '::ffff:c0a8:164');
    assert.strictEqual(res.dotted, '::ffff:192.168.1.100');

    assert.strictEqual(IPUtils.convertMappedToV4('::ffff:c0a8:164'), '192.168.1.100');
    assert.strictEqual(IPUtils.convertMappedToV4('::ffff:192.168.1.100'), '192.168.1.100');
    assert.strictEqual(IPUtils.convertMappedToV4('64:ff9b::c0a8:164'), null);
  });
});

describe('Reverse DNS (PTR & CIDR Zone) Tests', () => {
  test('ipToReverseDNS IPv4 Host', () => {
    const res = IPUtils.ipToReverseDNS('192.0.2.1');
    assert.ok(res);
    assert.strictEqual(res.record, '1.2.0.192.in-addr.arpa');
    assert.strictEqual(res.origin, '1.2.0.192.in-addr.arpa.');
    assert.strictEqual(res.type, 'ipv4');
    assert.strictEqual(res.isZone, false);
  });

  test('ipToReverseDNS IPv4 CIDR boundaries (/24, /16, /8, /0)', () => {
    const r24 = IPUtils.ipToReverseDNS('192.168.1.0/24');
    assert.ok(r24);
    assert.strictEqual(r24.record, '1.168.192.in-addr.arpa');
    assert.strictEqual(r24.origin, '1.168.192.in-addr.arpa.');
    assert.strictEqual(r24.isZone, true);

    const r16 = IPUtils.ipToReverseDNS('172.16.0.0/16');
    assert.ok(r16);
    assert.strictEqual(r16.record, '16.172.in-addr.arpa');
    assert.strictEqual(r16.origin, '16.172.in-addr.arpa.');
    assert.strictEqual(r16.isZone, true);

    const r8 = IPUtils.ipToReverseDNS('10.0.0.0/8');
    assert.ok(r8);
    assert.strictEqual(r8.record, '10.in-addr.arpa');
    assert.strictEqual(r8.origin, '10.in-addr.arpa.');
    assert.strictEqual(r8.isZone, true);

    const r0 = IPUtils.ipToReverseDNS('0.0.0.0/0');
    assert.ok(r0);
    assert.strictEqual(r0.record, 'in-addr.arpa');
    assert.strictEqual(r0.origin, 'in-addr.arpa.');
    assert.strictEqual(r0.isZone, true);
  });

  test('ipToReverseDNS IPv4 Non-Octet Boundary RFC 2317 (/25)', () => {
    const r25 = IPUtils.ipToReverseDNS('192.168.1.0/25');
    assert.ok(r25);
    assert.strictEqual(r25.record, '0/25.1.168.192.in-addr.arpa');
    assert.strictEqual(r25.origin, '0/25.1.168.192.in-addr.arpa.');
    assert.strictEqual(r25.parentZone, '1.168.192.in-addr.arpa.');
    assert.ok(r25.rfc2317);
    assert.ok(r25.warning);
  });

  test('ipToReverseDNS IPv6 Host', () => {
    const res = IPUtils.ipToReverseDNS('2001:db8::1');
    assert.ok(res);
    assert.strictEqual(
      res.record,
      '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
    );
    assert.strictEqual(res.type, 'ipv6');
    assert.strictEqual(res.isZone, false);
  });

  test('ipToReverseDNS IPv6 Nibble Boundary CIDR (/32, /48, /56, /64)', () => {
    const r32 = IPUtils.ipToReverseDNS('2001:db8::/32');
    assert.ok(r32);
    assert.strictEqual(r32.record, '8.b.d.0.1.0.0.2.ip6.arpa');
    assert.strictEqual(r32.origin, '8.b.d.0.1.0.0.2.ip6.arpa.');
    assert.strictEqual(r32.nibbleCount, 8);
    assert.strictEqual(r32.isZone, true);

    const r56 = IPUtils.ipToReverseDNS('2001:db8:1234:5600::/56');
    assert.ok(r56);
    assert.strictEqual(r56.record, '6.5.4.3.2.1.8.b.d.0.1.0.0.2.ip6.arpa');
    assert.strictEqual(r56.origin, '6.5.4.3.2.1.8.b.d.0.1.0.0.2.ip6.arpa.');
    assert.strictEqual(r56.nibbleCount, 14);
    assert.strictEqual(r56.isZone, true);
  });

  test('ipToReverseDNS IPv6 Non-Nibble Boundary (/58)', () => {
    const r58 = IPUtils.ipToReverseDNS('2001:db8:1234:5600::/58');
    assert.ok(r58);
    // Closest lower nibble is /56 (14 nibbles)
    assert.strictEqual(r58.record, '6.5.4.3.2.1.8.b.d.0.1.0.0.2.ip6.arpa');
    assert.strictEqual(r58.parentZone, '6.5.4.3.2.1.8.b.d.0.1.0.0.2.ip6.arpa.');
    assert.strictEqual(r58.parentPrefix, 56);
    assert.ok(r58.warning);
  });

  test('reverseDNSToIP IPv4 host & zone', () => {
    const host = IPUtils.reverseDNSToIP('1.2.0.192.in-addr.arpa');
    assert.ok(host);
    assert.strictEqual(host.ip, '192.0.2.1');
    assert.strictEqual(host.type, 'ipv4');
    assert.strictEqual(host.isZone, false);

    const z24 = IPUtils.reverseDNSToIP('1.168.192.in-addr.arpa');
    assert.ok(z24);
    assert.strictEqual(z24.ip, '192.168.1.0/24');
    assert.strictEqual(z24.isZone, true);

    const z16 = IPUtils.reverseDNSToIP('16.172.in-addr.arpa.');
    assert.ok(z16);
    assert.strictEqual(z16.ip, '172.16.0.0/16');
    assert.strictEqual(z16.isZone, true);

    const z8 = IPUtils.reverseDNSToIP('10.in-addr.arpa');
    assert.ok(z8);
    assert.strictEqual(z8.ip, '10.0.0.0/8');
    assert.strictEqual(z8.isZone, true);

    const rfc2317 = IPUtils.reverseDNSToIP('0/25.1.168.192.in-addr.arpa');
    assert.ok(rfc2317);
    assert.strictEqual(rfc2317.ip, '192.168.1.0/25');
  });

  test('reverseDNSToIP IPv6 host & zone', () => {
    const host = IPUtils.reverseDNSToIP(
      '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
    );
    assert.ok(host);
    assert.strictEqual(host.ip, '2001:db8::1');
    assert.strictEqual(host.isZone, false);

    const z32 = IPUtils.reverseDNSToIP('8.b.d.0.1.0.0.2.ip6.arpa.');
    assert.ok(z32);
    assert.strictEqual(z32.ip, '2001:db8::/32');
    assert.strictEqual(z32.prefix, 32);
    assert.strictEqual(z32.isZone, true);

    const z56 = IPUtils.reverseDNSToIP('6.5.4.3.2.1.8.b.d.0.1.0.0.2.ip6.arpa');
    assert.ok(z56);
    assert.strictEqual(z56.ip, '2001:db8:1234:5600::/56');
    assert.strictEqual(z56.prefix, 56);
    assert.strictEqual(z56.isZone, true);
  });

  test('reverseDNSToIP invalid records', () => {
    assert.strictEqual(IPUtils.reverseDNSToIP('999.2.0.192.in-addr.arpa'), null);
    assert.strictEqual(IPUtils.reverseDNSToIP('g.0.0.ip6.arpa'), null);
    assert.strictEqual(IPUtils.reverseDNSToIP('invalid-string'), null);
  });
});

describe('getIPDetails Tests', () => {
  test('IPv4 Details with CIDR', () => {
    const details = IPUtils.getIPDetails('192.168.1.0/24');
    assert.ok(details);
    assert.strictEqual(details.version, 4);
    assert.strictEqual(details.standard, '192.168.1.0/24');
    assert.strictEqual(details.isCIDR, true);
    assert.strictEqual(details.prefix, 24);
    assert.strictEqual(details.reverseDNS, '1.168.192.in-addr.arpa');
    assert.strictEqual(details.reverseOrigin, '1.168.192.in-addr.arpa.');
  });

  test('IPv6 Details with CIDR', () => {
    const details = IPUtils.getIPDetails('2001:db8::/32');
    assert.ok(details);
    assert.strictEqual(details.version, 6);
    assert.strictEqual(details.standard, '2001:db8::/32');
    assert.strictEqual(details.prefix, 32);
    assert.strictEqual(details.reverseDNS, '8.b.d.0.1.0.0.2.ip6.arpa');
    assert.strictEqual(details.reverseOrigin, '8.b.d.0.1.0.0.2.ip6.arpa.');
  });
});
