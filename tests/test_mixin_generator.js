'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const mixinPath = path.join(__dirname, '../mihomox/files/ucode/mixin.uc');
const source = fs.readFileSync(mixinPath, 'utf8');

function assertContains(fragment, message) {
    assert.ok(source.includes(fragment), message);
}

const expectedMappings = [
    "config['bind-address'] = uci.get('mihomox', 'mixin', 'bind_address');",
    "config['lan-allowed-ips'] = uci_array(uci.get('mihomox', 'mixin', 'lan_allowed_ips'));",
    "config['lan-disallowed-ips'] = uci_array(uci.get('mihomox', 'mixin', 'lan_disallowed_ips'));",
    "config['dns']['cache-max-size'] = uci_int(uci.get('mihomox', 'mixin', 'dns_cache_max_size'));",
    "config['dns']['ipv6-timeout'] = uci_int(uci.get('mihomox', 'mixin', 'dns_ipv6_timeout'));",
    "config['dns']['fallback-lazy-query'] = uci_bool(uci.get('mihomox', 'mixin', 'dns_fallback_lazy_query'));",
    "config['sniffer']['skip-src-address'] = uci_array(uci.get('mihomox', 'mixin', 'sniffer_skip_src_addresses'));",
    "config['sniffer']['skip-dst-address'] = uci_array(uci.get('mihomox', 'mixin', 'sniffer_skip_dst_addresses'));",
    "'size-limit': section.file_size_limit,",
];

for (const mapping of expectedMappings) {
    assertContains(mapping, `missing mixin mapping: ${mapping}`);
}

assert.ok(!source.includes("['port'] = uci_array(section.port)"), 'sniffer must not emit the obsolete port key');
assert.ok(!/\bsize_limit\s*:/.test(source), 'rule providers must not emit size_limit');

const sniffStart = source.indexOf("if (uci_bool(uci.get('mihomox', 'mixin', 'sniffer_sniff'))) {");
const sniffEnd = source.indexOf("\n\nconfig['profile'] = {};", sniffStart);
assert.ok(sniffStart >= 0 && sniffEnd > sniffStart, 'sniffer protocol block not found');

const sniffBlock = source.slice(sniffStart, sniffEnd);
const disabledGuard = sniffBlock.indexOf('if (!uci_bool(section.enabled)) {');
const disabledReturn = sniffBlock.indexOf('return;', disabledGuard);
const protocolInit = sniffBlock.indexOf("config['sniffer']['sniff'][section.protocol] = {};");
const portsOutput = sniffBlock.indexOf("config['sniffer']['sniff'][section.protocol]['ports'] = uci_array(section.port);");

assert.ok(disabledGuard >= 0, 'sniffer sections must check enabled state');
assert.ok(disabledReturn > disabledGuard && disabledReturn < protocolInit, 'disabled sniffer sections must return before creating a protocol object');
assert.ok(protocolInit > disabledGuard, 'protocol objects must be created only after the enabled check');
assert.ok(portsOutput > protocolInit, 'enabled protocols must emit ports after creating their object');
assert.ok(!/\['sniff'\]\['(?:HTTP|TLS|QUIC)'\]\s*=\s*\{\}/.test(sniffBlock), 'disabled protocols must not be pre-created');

console.log('Mixin generator regression tests passed');
