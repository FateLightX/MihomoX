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
for (const test of ['core', 'system_dns', 'mihomo_dns', 'domestic', 'international', 'ipv4', 'ipv6', 'nat'])
    assert.ok(rpcSource.includes(`case '${test}':`), `network RPC is missing ${test}`);

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
const results = {
    core: { success: true },
    system_dns: { success: true, latency: 12 },
    mihomo_dns: { success: true, latency: 8 },
    domestic: { success: true, latency: 35 },
    international: { success: true, latency: 86 },
    ipv4: { success: true, address: '203.0.113.1' },
    ipv6: { success: false },
    nat: { success: true, type: 'Full Cone' }
};
const mihomox = {
    networkTest: (test) => {
        calls.push(test);
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

Promise.resolve(button.listeners.click()).then(() => {
    assert.deepStrictEqual(calls, ['core', 'system_dns', 'mihomo_dns', 'domestic', 'international', 'ipv4', 'ipv6', 'nat']);
    assert.strictEqual(button.disabled, false);
    console.log('LuCI network test page tests passed');
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
