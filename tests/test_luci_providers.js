'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const viewSource = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/providers.js'
), 'utf8');
const appSource = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/app.js'
), 'utf8');
const toolSource = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js'
), 'utf8');
const rpcSource = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/rpcd/ucode/luci.mihomox'
), 'utf8');
const corePatch = fs.readFileSync(path.join(
    root,
    'mihomox/patches/100-provider-discard-mode.patch'
), 'utf8');
const menu = JSON.parse(fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/luci/menu.d/luci-app-mihomox.json'
), 'utf8'));
const acl = JSON.parse(fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/rpcd/acl.d/luci-app-mihomox.json'
), 'utf8'))['luci-app-mihomox'];

const entry = menu['admin/services/mihomox/providers'];
assert.ok(entry, 'node management menu entry is missing');
assert.strictEqual(entry.order, 25);
assert.strictEqual(entry.action.path, 'mihomox/providers');

assert.ok(acl.read.ubus['luci.mihomox'].includes('provider_discard'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('set_provider_discard'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('update_provider_discard'));
assert.ok(/method:\s*'set_provider_discard'[\s\S]*?nobatch:\s*true/.test(toolSource));
assert.ok(/method:\s*'update_provider_discard'[\s\S]*?nobatch:\s*true/.test(toolSource));

assert.ok(viewSource.includes("_('Node Management')"));
assert.ok(viewSource.includes('mihomox-provider-details'));
assert.ok(!viewSource.includes('ui.showModal'), 'node settings must remain inline');
assert.ok(!viewSource.includes('mihomox.restart'), 'saving discard settings must not restart MihomoX');
assert.ok(!viewSource.includes('mihomox.reload'), 'saving discard settings must not reload MihomoX');
assert.ok(appSource.includes('unpatched Release or Alpha cores are rejected'));

assert.ok(rpcSource.includes("const PROVIDER_DISCARD_FILE = '/etc/mihomox/provider-discard.json'"));
assert.ok(rpcSource.includes("'/discard-policy'"));
assert.ok(rpcSource.includes("'/discard-update'"));
assert.ok(rpcSource.includes("sprintf('%J\\n', config)"));
assert.ok(rpcSource.includes("'Content-Type: application/json'"));
assert.ok(corePatch.includes('pp.baseProvider.setProxies(available)'));
assert.ok(corePatch.includes('all candidates unavailable; kept complete candidate set on initial load'));
assert.ok(corePatch.includes('status.State = "fallback"'));
assert.ok(corePatch.includes('status.Discarded = 0'));
assert.ok(corePatch.includes('SetOnUnchanged(pd.retestCandidates)'));
assert.ok(corePatch.includes('"features": []string{"provider-discard"}'));
assert.ok(!corePatch.includes('+\tpp.closeAllConnections()'), 'provider updates must not close active connections');

console.log('LuCI provider discard tests passed');
