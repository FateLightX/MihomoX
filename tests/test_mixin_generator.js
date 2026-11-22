'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

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
    "const fake_ip_disable_mapping = uci.get('mihomox', 'mixin', 'fake_ip_disable_mapping');",
    "config['dns']['fake-ip-disable-mapping'] = fake_ip_disable_mapping == '1';",
    "config['tun']['dns-mode'] = tun_dns_mode;",
    "config['sniffer']['skip-src-address'] = uci_array(uci.get('mihomox', 'mixin', 'sniffer_skip_src_addresses'));",
    "config['sniffer']['skip-dst-address'] = uci_array(uci.get('mihomox', 'mixin', 'sniffer_skip_dst_addresses'));",
    "'size-limit': section.file_size_limit,",
    "config['experimental']['quic-go-disable-gso'] = uci_bool(uci.get('mihomox', 'procd', 'env_disable_quic_go_gso'));",
    "config['experimental']['quic-go-disable-ecn'] = uci_bool(uci.get('mihomox', 'procd', 'env_disable_quic_go_ecn'));",
];

for (const mapping of expectedMappings) {
    assertContains(mapping, `missing mixin mapping: ${mapping}`);
}

assert.ok(!source.includes("['port'] = uci_array(section.port)"), 'sniffer must not emit the obsolete port key');
assert.ok(!/\bsize_limit\s*:/.test(source), 'rule providers must not emit size_limit');
assert.ok(
    source.indexOf("const fake_ip_disable_mapping =") < source.indexOf("config['dns']['fake-ip-disable-mapping']"),
    'Fake-IP mapping boolean must be guarded by the UCI value'
);
assert.ok(
    source.includes("if (fake_ip_disable_mapping == '0' || fake_ip_disable_mapping == '1')"),
    'an unset Fake-IP mapping option must not override the profile'
);

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

const filterBlock = source.slice(source.indexOf('const fake_ip_filter ='), source.indexOf('const fake_ip_disable_mapping ='));
const renderFilter = new Function('config', 'uci', 'uci_array', 'getenv', filterBlock);
for (const [setting, fallback, shouldWrite] of [
    ['0', '1', false], ['1', '0', true], ['auto', '0', false], ['auto', '1', true]
]) {
    const options = { fake_ip_filter: setting, fake_ip_filters: ['+.lan'], fake_ip_filter_mode: 'blacklist' };
    const config = { dns: {} };
    renderFilter(config, { get: (_, section, key) => options[key] }, value => value,
        name => name === 'MIHOMOX_USE_FAKE_IP_DEFAULTS' && fallback);
    assert.deepStrictEqual(config.dns, shouldWrite ? {
        'fake-ip-filter': ['+.lan'], 'fake-ip-filter-mode': 'blacklist'
    } : {});
}

// Exercise the init script's actual yq expression when the device tool is available.
if (!spawnSync('yq', ['--version']).error) {
    const init = fs.readFileSync(path.join(__dirname, '../mihomox/files/mihomox.init'), 'utf8');
    const query = init.match(/filter_count=\$\(yq -M eval-all '([^']+)'/)[1];
    for (const [input, count] of [
        ['dns: {}', 0],
        ['dns: {fake-ip-filter: []}', 1],
        ['dns: {fake-ip-filter-mode: whitelist}', 1],
        ['dns: {}\n---\ndns: {fake-ip-filter-mode: rule}', 1],
        ['base: &base {fake-ip-filter: []}\ndns: {<<: *base}', 1]
    ]) {
        const result = execFileSync('yq', ['-M', 'eval-all', query, '-'], { input, encoding: 'utf8' });
        assert.strictEqual(result.trim(), String(count), input);
    }
}

console.log('Mixin generator regression tests passed');
