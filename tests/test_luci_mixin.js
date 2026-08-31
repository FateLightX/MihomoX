'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/mixin.js'
), 'utf8');

for (const option of [
    'bind_address',
    'lan_allowed_ips',
    'lan_disallowed_ips',
    'dns_cache_max_size',
    'dns_ipv6_timeout',
    'dns_fallback_lazy_query',
    'sniffer_skip_src_addresses',
    'sniffer_skip_dst_addresses'
]) {
    assert.ok(source.includes(`'${option}'`), `missing LuCI option: ${option}`);
}

for (const ruleType of [
    'IP-CIDR6', 'IP-ASN', 'SRC-IP-CIDR', 'SRC-PORT', 'NETWORK',
    'PROCESS-PATH', 'IN-NAME', 'REMATCH-NAME', 'SUB-RULE', 'MATCH'
]) {
    assert.ok(source.includes(`'${ruleType}'`), `missing rule type hint: ${ruleType}`);
}

assert.ok(source.includes("value === 'mrs'"), 'MRS format validation is missing');
assert.ok(source.includes("behaviorOption.formvalue(section_id) === 'classical'"), 'MRS/Classical guard is missing');
assert.ok(source.includes("description = _('Bytes; 0 means unlimited.')"), 'size limit unit is missing');
assert.ok(source.includes('mihomox.inlineDescriptions'), 'tips must render inline beside their fields');
for (const option of ['ui_url', 'geosite_url', 'geoip_mmdb_url', 'geoip_dat_url', 'geoip_asn_url']) {
    assert.ok(
        new RegExp(`'${option}'[\\s\\S]{0,240}validateURL\\(value\\)`).test(source),
        `${option} must validate URL syntax`
    );
}
for (const option of ['api_tls_cert', 'api_tls_key', 'api_tls_ech_key']) {
    assert.ok(
        new RegExp(`'${option}'[\\s\\S]{0,180}\\.datatype = 'file'`).test(source),
        `${option} must validate file path syntax`
    );
}
assert.ok(/'ui_path'[\s\S]{0,180}\.datatype = 'directory'/.test(source), 'UI path must validate directory syntax');
assert.ok(/'url', _\('Url'\)[\s\S]{0,280}validateURL\(value\)/.test(source), 'HTTP rule providers must validate URL syntax');
assert.ok(source.includes('function validateDomainPattern'), 'domain pattern validation is missing');
assert.ok(source.includes('function validateFakeIPRule'), 'Fake-IP rule validation is missing');
assert.ok(source.includes('function validateTLSBundle'), 'TLS bundle validation is missing');
assert.ok(source.includes('function validatePolicyMatcher'), 'DNS policy matcher validation is missing');
assert.ok(source.includes("UI Name must be a local relative path."), 'UI name path validation is missing');
assert.ok(source.includes("Relative UI Path must stay within Mihomo home."), 'UI path validation is missing');
assert.ok(source.includes("API TLS requires listen address, certificate and private key together."), 'TLS pair validation is missing');
assert.ok(source.includes("mode === 'rule' ? validateFakeIPRule(value) : validateDomainPattern(value)"), 'Fake-IP mode-aware validation is missing');
assert.ok(source.includes('so.validate = validatePolicyMatcher;'), 'DNS policy matcher validation is missing');
// The core also honours no-resolve on RULE-SET (rules/provider/rule_set.go), which
// matters for ipcidr rule sets under Fake-IP.
assert.ok(
    /'no_resolve'[\s\S]{0,320}depends\('type', \/RULE-SET\/i\)/.test(source),
    'no-resolve must be offered for RULE-SET rules'
);
for (const type of ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD', 'GEOSITE', 'RULE-SET', 'MATCH']) {
    assert.ok(source.includes(`'${type}'`), `missing Fake-IP rule type: ${type}`);
}

console.log('LuCI mixin tests passed');
