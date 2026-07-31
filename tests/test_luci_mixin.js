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

console.log('LuCI mixin tests passed');
