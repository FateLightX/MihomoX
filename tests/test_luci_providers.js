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
const managerSource = fs.readFileSync(path.join(
    root,
    'mihomox/files/scripts/provider_filter.sh'
), 'utf8');
const initSource = fs.readFileSync(path.join(root, 'mihomox/files/mihomox.init'), 'utf8');
const includeSource = fs.readFileSync(path.join(root, 'mihomox/files/scripts/include.sh'), 'utf8');
const hijackSource = fs.readFileSync(path.join(root, 'mihomox/files/ucode/hijack.ut'), 'utf8');
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
assert.ok(appSource.includes('Prerelease Alpha changes frequently'));
assert.ok(viewSource.includes("_('Direct Isolation')"));

assert.ok(rpcSource.includes("const PROVIDER_DISCARD_FILE = '/etc/mihomox/provider-discard.json'"));
assert.ok(rpcSource.includes("sprintf('%J\\n', config)"));
assert.ok(rpcSource.includes('provider_filter_enqueue(provider)'));
assert.ok(managerSource.includes("--noproxy '*'"));
assert.ok(managerSource.includes('routing-mark: $PROBE_MARK'));
assert.ok(managerSource.includes('HTTP_PROXY= HTTPS_PROXY= ALL_PROXY='));
assert.ok(managerSource.includes('probe_mark_available'));
assert.ok(managerSource.includes('expected=$EXPECTED_STATUS'));
assert.ok(managerSource.includes('select(.supported == true)'));
assert.ok(managerSource.includes('.type = "file"'));
assert.ok(managerSource.includes('mv -f "$filtered_file" "$current_file"'));
assert.ok(!managerSource.includes('/etc/init.d/mihomox reload'));
assert.ok(!managerSource.includes('/etc/init.d/mihomox restart'));
assert.ok(initSource.includes('PROVIDER_FILTER_SH'));
assert.ok(includeSource.includes('provider_filter.sh'));
assert.ok(hijackSource.includes('provider_probe_fw_mark'));

console.log('provider subscription filter tests passed');
