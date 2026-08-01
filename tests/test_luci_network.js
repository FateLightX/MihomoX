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
for (const test of ['core', 'system_dns', 'mihomo_dns', 'domestic', 'international', 'ipv4_domestic', 'ipv4_overseas', 'ipv6_domestic', 'ipv6_overseas', 'nat'])
    assert.ok(rpcSource.includes(`case '${test}':`), `network RPC is missing ${test}`);
assert.ok(/method:\s*'network_test'[\s\S]*?nobatch:\s*true/.test(toolSource), 'network tests must bypass RPC batching');
assert.ok(source.includes('Promise.race(['), 'network tests must enforce a browser-side timeout');
assert.ok(!source.includes('stopped = true'), 'one network timeout must not skip later tests');
assert.ok(source.includes("timeout: 30000"), 'NAT must allow DNS isolation and STUN timeouts');
assert.ok(rpcSource.includes("readfile('/etc/resolv.conf')"), 'system DNS servers must be read from resolv.conf');
assert.ok(rpcSource.includes('version: installed_core_version()'), 'core version must be returned by the network RPC');
assert.ok(rpcSource.includes("plain_ip_probe('https://v4.ipgg.cn', 4)"), 'domestic IPv4 must use ipgg');
assert.ok(rpcSource.includes('return overseas_ip_probe(4)'), 'overseas IPv4 must use the proxy geo probe');
assert.ok(rpcSource.includes("ipv6_probe([ 'https://v6.ipgg.cn' ])"), 'domestic IPv6 must use ipgg');
assert.ok(rpcSource.includes('return overseas_ip_probe(6)'), 'overseas IPv6 must use the proxy geo probe');
assert.ok(rpcSource.includes("'https://1.1.1.1/cdn-cgi/trace'"), 'overseas IPv4 must force a fixed IPv4 target');
assert.ok(rpcSource.includes("'https://[2606:4700:4700::1111]/cdn-cgi/trace'"), 'overseas IPv6 must force a fixed IPv6 target');
assert.ok(rpcSource.includes("const proxy = local_proxy()"), 'overseas probes must use the local Mihomo proxy');
assert.ok(rpcSource.includes("country != 'CN'"), 'overseas probes must reject mainland China exits');
assert.ok(rpcSource.includes("'--doh-url', 'https://dns.alidns.com/dns-query'"), 'IPv6 probes must bypass fake-IP DNS');
assert.ok(rpcSource.includes("resolve_public_ipv4('stun.cloudflare.com')"), 'STUN must bypass fake-IP DNS');
assert.ok(rpcSource.includes("network_test_fw_mark"), 'STUN must bypass transparent proxy interception');
assert.ok(rpcSource.includes('direct_network_command(args)'), 'direct probes must use the MihomoX bypass cgroup');
assert.ok(rpcSource.includes("push(args, '--noproxy', '*')"), 'IP protocol probes must bypass environment proxies');
assert.ok(source.includes("no_ipv6: _('No IPv6 Connectivity')"), 'network errors must be visible');

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
        addEventListener: function (name, callback) {
            this.listeners ||= {};
            this.listeners[name] = callback;
        }
    };
    created.push(node);
    return node;
}

const calls = [];
let releaseCore;
const results = {
    core: { success: true, version: 'v1.19.12' },
    system_dns: { success: true, latency: 12, server: '192.0.2.53' },
    mihomo_dns: { success: true, latency: 8, server: '127.0.0.1#1053' },
    domestic: { success: true, latency: 35 },
    international: { success: true, latency: 86 },
    ipv4_domestic: { success: true, address: '198.51.100.10' },
    ipv4_overseas: { success: true, address: '203.0.113.1', country: 'KR' },
    ipv6_domestic: { success: true, address: '2001:db8::10' },
    ipv6_overseas: { success: false, address: '2001:db8::20', country: 'CN' },
    nat: { success: true, type: 'Full Cone' }
};
const mihomox = {
    networkTest: (test) => {
        calls.push(test);
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
const singleButtons = created.filter((node) => node.attributes?.['data-test-id']);
assert.strictEqual(singleButtons.length, 10, 'each network row must have a test button');
assert.ok(singleButtons.every((node) => node.listeners?.click), 'a network row test button is missing its handler');

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
    assert.deepStrictEqual(calls, ['core', 'system_dns', 'mihomo_dns', 'domestic', 'international', 'ipv4_domestic', 'ipv4_overseas', 'ipv6_domestic', 'ipv6_overseas', 'nat']);
    assert.strictEqual(button.disabled, false);
    const values = created
        .filter((node) => node.attributes?.class === 'mihomox-network-value')
        .map((node) => node.textContent);
    assert.deepStrictEqual(values.slice(0, 5), [
        'v1.19.12 · Normal',
        '192.0.2.53 · 12 ms',
        '127.0.0.1#1053 · 8 ms',
        'connect.rom.miui.com · 35 ms',
        'cp.cloudflare.com · 86 ms'
    ]);
    assert.deepStrictEqual(values.slice(5, 9), [
        '198.51.100.10',
        '203.0.113.1 · KR',
        '2001:db8::10',
        '2001:db8::20 · CN · Unavailable'
    ]);
    const ipv4Button = singleButtons.find((node) => node.attributes['data-test-id'] === 'ipv4_domestic');
    return ipv4Button.listeners.click().then(() => {
        assert.strictEqual(calls.at(-1), 'ipv4_domestic');
        assert.strictEqual(button.disabled, false);
        assert.ok(singleButtons.every((node) => node.disabled === false));
        console.log('LuCI network test page tests passed');
    });
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
