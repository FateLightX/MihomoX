'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/network.js'
), 'utf8');
const rpcSource = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/rpcd/ucode/luci.mihomox'
), 'utf8');
const toolSource = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js'
), 'utf8');
const menu = JSON.parse(fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/luci/menu.d/luci-app-mihomox.json'
), 'utf8'));
const acl = JSON.parse(fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/rpcd/acl.d/luci-app-mihomox.json'
), 'utf8'));

const entry = menu['admin/services/mihomox/network'];
assert.ok(entry, 'network test menu entry is missing');
assert.strictEqual(entry.order, 45);
assert.strictEqual(entry.action.path, 'mihomox/network');
assert.ok(
    acl['luci-app-mihomox'].read.ubus['luci.mihomox'].includes('network_test'),
    'network_test RPC is missing from the read ACL'
);
for (const test of ['core', 'system_dns', 'mihomo_dns', 'domestic', 'domestic_baidu', 'domestic_netease', 'international', 'international_google', 'international_youtube', 'ipv4_domestic', 'ipv4_overseas', 'ipv6_domestic', 'nat'])
    assert.ok(rpcSource.includes(`case '${test}':`), `network RPC is missing ${test}`);
assert.ok(!rpcSource.includes("case 'ipv6_overseas':"), 'overseas IPv6 test must be removed');
assert.ok(!source.includes("id: 'ipv6_overseas'"), 'overseas IPv6 row must be removed');
assert.ok(/method:\s*'network_test'[\s\S]*?nobatch:\s*true/.test(toolSource), 'network tests must bypass RPC batching');
assert.ok(source.includes('Promise.race(['), 'network tests must enforce a browser-side timeout');
assert.ok(!source.includes('stopped = true'), 'one network timeout must not skip later tests');
assert.ok(source.includes("timeout: 30000"), 'NAT must allow DNS isolation and STUN timeouts');
assert.ok(/id: 'ipv4_overseas',[^\n]+timeout: 15000/.test(source), 'overseas IPv4 must allow both curl probes to finish');
assert.ok(rpcSource.includes("readfile('/etc/resolv.conf')"), 'system DNS servers must be read from resolv.conf');
assert.ok(rpcSource.includes('version: installed_core_version()'), 'core version must be returned by the network RPC');
assert.ok(rpcSource.includes("plain_ip_probe('https://v4.ipgg.cn', 4)"), 'domestic IPv4 must use ipgg');
assert.ok(rpcSource.includes("curl_probe('https://www.baidu.com', 4, null, null, false)"), 'domestic tests must include Baidu');
assert.ok(rpcSource.includes("curl_probe('https://music.163.com', 4, null, null, false)"), 'domestic tests must include NetEase Cloud');
assert.ok(rpcSource.includes("curl_probe('https://www.google.com/generate_204', 4, proxy.url, proxy.auth, false)"), 'international tests must include Google');
assert.ok(rpcSource.includes("curl_probe('https://www.youtube.com/generate_204', 4, proxy.url, proxy.auth, false)"), 'international tests must include YouTube');
assert.ok(rpcSource.includes("curl_probe('https://ifconfig.co', 4, proxy.url, proxy.auth, true, false)"), 'overseas IPv4 must query ifconfig.co through the proxy');
assert.ok(rpcSource.includes("curl_probe('https://ifconfig.co/country', 4, proxy.url, proxy.auth, true, false)"), 'overseas IPv4 must query the country through the proxy');
assert.ok(rpcSource.includes("ipv6_probe([ 'https://v6.ipgg.cn' ])"), 'domestic IPv6 must use ipgg');
assert.ok(rpcSource.includes("const proxy = local_proxy()"), 'overseas probes must use the local Mihomo proxy');
assert.ok(rpcSource.indexOf('function local_proxy()') < rpcSource.indexOf('function overseas_ipv4_probe()'), 'local proxy helper must be declared before use for ucode compatibility');
assert.ok(rpcSource.includes("port = int(profile?.['port'])"), 'local proxy must fall back from mixed-port to the final HTTP port');
assert.ok(rpcSource.includes("port = int(profile?.['socks-port'])"), 'local proxy must fall back from HTTP to the final SOCKS port');
assert.ok(rpcSource.includes("scheme = 'socks5h'"), 'SOCKS fallback must use a SOCKS proxy URL');
assert.ok(rpcSource.includes('const authentications = profile?.authentication'), 'local proxy authentication must come from the final profile');
assert.ok(!/function local_proxy\(\)[\s\S]*?uci\.foreach\('mihomox', 'authentication'/.test(rpcSource), 'local proxy must not mix final profile ports with UCI authentication');
assert.ok(rpcSource.includes('!!valid_address && !!valid_country'), 'overseas IPv4 must validate the returned IP and country');
assert.ok(rpcSource.includes("'--doh-url', 'https://dns.alidns.com/dns-query'"), 'IPv6 probes must bypass fake-IP DNS');
assert.ok(rpcSource.includes("resolve_public_ipv4('stun.cloudflare.com')"), 'STUN must bypass fake-IP DNS');
assert.ok(rpcSource.includes("network_test_fw_mark"), 'STUN must bypass transparent proxy interception');
assert.ok(rpcSource.includes('direct_network_command(args)'), 'direct probes must use the MihomoX bypass cgroup');
assert.ok(rpcSource.includes("push(args, '--noproxy', '*')"), 'IP protocol probes must bypass environment proxies');
assert.ok(source.includes("no_ipv6: _('No IPv6 Connectivity')"), 'network errors must be visible');
assert.ok(source.includes("timeout: _('Test Timeout')"), 'browser watchdogs must use a generic timeout message');
assert.ok(source.includes("result?.error === 'timeout' && result?.udp"), 'NAT/STUN timeouts must retain the UDP-specific message');
assert.ok(source.includes("not_configured: _('Not Configured')"), 'missing local proxy configuration must be visible');
assert.ok(source.includes("request_failed: _('Request Failed')"), 'HTTP probe failures must be visible');
assert.ok(source.includes('mihomox-network-progress'), 'network page must expose overall progress');
assert.ok(source.includes('var(--success-color'), 'network status colors must use semantic theme variables');
assert.ok(source.includes('color-mix(in srgb,currentColor'), 'network outlines must inherit the active theme color');
assert.ok(source.includes('background:transparent') && source.includes('box-shadow:none'), 'network cards must use outlines without independent surface colors');
assert.ok(source.includes("E('details'"), 'detailed site tests must be collapsible');
assert.ok(!source.includes('background:#fff') && !source.includes('background: #fff'), 'cards must not use a fixed white background');

for (const icon of ['core', 'dns', 'shield', 'home', 'globe', 'ipv4', 'ipv6', 'nat', 'check', 'warning', 'close', 'loading']) {
    const iconPath = path.join(
        root,
        `luci-app-mihomox/htdocs/luci-static/resources/icons/mihomox/network/${icon}.svg`
    );
    assert.ok(fs.existsSync(iconPath), `missing network icon: ${icon}`);
    const iconSource = fs.readFileSync(iconPath, 'utf8');
    assert.ok(/<svg\b/.test(iconSource) && !/<image\b/.test(iconSource), `invalid SVG icon: ${icon}`);
}

const created = [];
function E(tag, attributes, children) {
    const node = {
        tag,
        attributes: attributes || {},
        style: {},
        children: Array.isArray(children) ? children : children == null ? [] : [children],
        textContent: typeof children === 'string' ? children : '',
        disabled: false,
        dataset: {},
        addEventListener: function (name, callback) {
            this.listeners ||= {};
            this.listeners[name] = callback;
        },
        setAttribute: function (name, value) {
            this.attributes[name] = value;
        }
    };
    node.className = node.attributes.class || '';
    created.push(node);
    return node;
}

const calls = [];
let releaseCore;
let rejectNext = false;
const results = {
    core: { success: true, version: 'v1.19.12' },
    system_dns: { success: true, latency: 12, server: '192.0.2.53' },
    mihomo_dns: { success: true, latency: 8, server: '127.0.0.1#1053' },
    domestic: { success: true, latency: 35 },
    domestic_baidu: { success: true, latency: 35 },
    domestic_netease: { success: true, latency: 35 },
    international: { success: true, latency: 86 },
    international_google: { success: true, latency: 86 },
    international_youtube: { success: true, latency: 86 },
    ipv4_domestic: { success: true, address: '198.51.100.10' },
    ipv4_overseas: { success: true, address: '203.0.113.1', country: 'Singapore' },
    ipv6_domestic: { success: true, address: '2001:db8::10' },
    nat: { success: true, type: 'Full Cone' }
};
const mihomox = {
    networkTest: (test) => {
        calls.push(test);
        if (rejectNext) {
            rejectNext = false;
            return Promise.reject(new Error('fixture failure'));
        }
        if (test === 'core')
            return new Promise((resolve) => { releaseCore = () => resolve(results[test]); });
        return Promise.resolve(results[test]);
    }
};
const L = {
    resource: (value) => `/luci-static/resources/${value}`,
    resolveDefault: (promise, fallback) => Promise.resolve(promise).catch(() => fallback)
};
const view = { extend: (definition) => definition };
const ui = {};
const translate = (value) => value;
const networkView = new Function('view', 'ui', 'mihomox', 'L', 'E', '_', source)(
    view, ui, mihomox, L, E, translate
);
networkView.render();
const button = created.find((node) => node.tag === 'button');
assert.ok(button?.listeners?.click, 'start test button is missing');
const metricGrids = created.filter((node) =>
    node.tag === 'div' && /(^|\s)mihomox-network-(grid|site-grid)(\s|$)/.test(node.attributes?.class || '')
);
assert.ok(metricGrids.length > 0, 'network metric grids are missing');
assert.ok(
    metricGrids.every((grid) => grid.children.every((child) =>
        child?.tag === 'div' && child.attributes?.class === 'mihomox-network-metric'
    )),
    'LuCI E() children must receive metric DOM nodes instead of wrapper objects'
);
assert.ok(
    metricGrids.some((grid) => {
        const ids = grid.children.map((child) => child.attributes?.['data-test-id']);
        return ids.length === 2 && ids.includes('domestic') && ids.includes('international');
    }),
    'domestic and international results must share the network status card'
);
assert.ok(
    metricGrids.some((grid) => {
        const ids = grid.children.map((child) => child.attributes?.['data-test-id']);
        return ids.length === 3 &&
            ids.includes('ipv4_domestic') && ids.includes('ipv4_overseas') && ids.includes('ipv6_domestic');
    }),
    'IPv4 and IPv6 results must share the network detection card'
);
const singleButtons = created.filter((node) => node.tag === 'button' && node.attributes?.['data-test-id']);
assert.strictEqual(singleButtons.length, 13, 'each network test must have a single-test button');
assert.ok(singleButtons.every((node) => node.listeners?.click), 'a network test button is missing its handler');

const run = button.listeners.click();
Promise.resolve().then(() => {
    assert.deepStrictEqual(calls, ['core'], 'network tests must run one at a time');
    assert.strictEqual(
        created.filter((node) => node.attributes?.class === 'mihomox-network-value' && node.textContent === 'Testing').length,
        1,
        'only the active network test should show as testing'
    );
    releaseCore();
    return run;
}).then(() => {
    assert.deepStrictEqual(calls, ['core', 'system_dns', 'mihomo_dns', 'domestic', 'domestic_baidu', 'domestic_netease', 'international', 'international_google', 'international_youtube', 'ipv4_domestic', 'ipv4_overseas', 'ipv6_domestic', 'nat']);
    assert.strictEqual(button.disabled, false);
    assert.strictEqual(created.find((node) => node.attributes?.class === 'mihomox-network-progress').textContent, '13 / 13');
    const valueFor = (id) => created.find((node) => node.tag === 'div' && node.attributes?.['data-test-id'] === id && node.attributes?.class === 'mihomox-network-metric').children[1].children[1].textContent;
    const testsForAssertion = ['core', 'system_dns', 'mihomo_dns', 'domestic', 'domestic_baidu', 'domestic_netease', 'international', 'international_google', 'international_youtube', 'ipv4_domestic', 'ipv4_overseas', 'ipv6_domestic', 'nat'];
    const values = testsForAssertion.map(valueFor);
    assert.deepStrictEqual(values, [
        'v1.19.12 · Normal', '192.0.2.53 · 12 ms', '127.0.0.1#1053 · 8 ms', '35 ms', '35 ms', '35 ms',
        '86 ms', '86 ms', '86 ms', '198.51.100.10',
        '203.0.113.1 · Singapore', '2001:db8::10', 'Full Cone'
    ]);
    const nonIpValues = values.filter((value) => !['198.51.100.10', '203.0.113.1 · Singapore', '2001:db8::10'].includes(value));
    assert.strictEqual(valueFor('system_dns'), '192.0.2.53 · 12 ms', 'system DNS must display its server');
    assert.strictEqual(valueFor('mihomo_dns'), '127.0.0.1#1053 · 8 ms', 'Mihomo DNS must display its server');
    for (const forbidden of ['connect.rom.miui.com', 'www.baidu.com', 'music.163.com', 'cp.cloudflare.com', 'www.google.com', 'www.youtube.com'])
        assert.ok(!nonIpValues.some((value) => value.includes(forbidden)), `non-IP result must not render ${forbidden}`);
    const ipv4Button = singleButtons.find((node) => node.attributes['data-test-id'] === 'ipv4_domestic');
    rejectNext = true;
    return ipv4Button.listeners.click().then(() => {
        assert.strictEqual(calls.at(-1), 'ipv4_domestic');
        assert.strictEqual(button.disabled, false);
        assert.ok(singleButtons.every((node) => node.disabled === false));
        assert.strictEqual(
            created.find((node) => node.attributes?.['data-test-id'] === 'ipv4_domestic' && node.attributes?.class === 'mihomox-network-metric')
                .children[1].children[1].textContent,
            'Test Start Failed',
            'single-test failure must render a reason and restore buttons'
        );
        assert.strictEqual(
            created.find((node) => node.attributes?.class === 'mihomox-network-summary-title').textContent,
            'Some Tests Unavailable',
            'single-test completion must leave the summary in a terminal state'
        );
        assert.ok(
            created.find((node) => node.textContent === '!')?.className.includes('mihomox-network-summary-mark-failed'),
            'failed summary must use the failed semantic state'
        );
        console.log('LuCI network test page tests passed');
    });
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
