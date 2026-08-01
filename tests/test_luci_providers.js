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
const defaultPolicy = JSON.parse(fs.readFileSync(path.join(root, 'mihomox/files/provider-discard.json'), 'utf8'));
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
assert.ok(acl.read.ubus['luci.mihomox'].includes('provider_discard_status'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('set_provider_discard'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('set_provider_discard_global'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('update_provider_discard'));
assert.ok(/method:\s*'set_provider_discard'[\s\S]*?nobatch:\s*true/.test(toolSource));
assert.ok(/method:\s*'set_provider_discard_global'[\s\S]*?nobatch:\s*true/.test(toolSource));
assert.ok(/method:\s*'update_provider_discard'[\s\S]*?nobatch:\s*true/.test(toolSource));
assert.ok(toolSource.includes("'unified_delay', 'max_delay'"));

assert.ok(viewSource.includes("_('Node Management')"));
assert.ok(viewSource.includes('mihomox-provider-details'));
assert.ok(!viewSource.includes('ui.showModal'), 'node settings must remain inline');
assert.ok(!viewSource.includes('mihomox.restart'), 'saving discard settings must not restart MihomoX');
assert.ok(!viewSource.includes('mihomox.reload'), 'saving discard settings must not reload MihomoX');
assert.ok(appSource.includes('Prerelease Alpha changes frequently'));
assert.ok(viewSource.includes("_('Direct Isolation')"));
assert.ok(viewSource.includes("_('Enable Automatic Filtering')"));
assert.ok(viewSource.includes("_('Unified Delay')"));
assert.ok(viewSource.includes("_('Maximum Delay')"));
assert.ok(viewSource.includes('mihomox-provider-max-delay'));
assert.ok(!viewSource.includes('updateAllButton.disabled = !executionEnabled'));
assert.ok(!viewSource.includes('supported && executionEnabled'));
assert.ok(/cbi-button cbi-button-action', type: 'button', click: \(\) => updateProvider\(name\)/.test(viewSource),
    'manual provider check button must never be disabled by provider state');
assert.ok(!viewSource.includes('manualSupported'));
assert.ok(viewSource.includes("_('Test Completed')"));
assert.ok(viewSource.includes("_('Waiting Test')"));
assert.ok(viewSource.includes('mihomox-provider-progress'));
assert.ok(viewSource.includes('refreshRenderedStatuses()'));
assert.ok(viewSource.includes('poll.add(() => refreshStatuses(false), 2)'));
assert.ok(viewSource.includes('mihomox.providerDiscardStatus()'));
assert.ok(viewSource.includes("['active', 'testing', 'fallback', 'disabled'].includes(status.state)"));
assert.strictEqual(defaultPolicy.global.enabled, true);
assert.strictEqual(defaultPolicy.global.unifiedDelay, true);
assert.strictEqual(defaultPolicy.global.maxDelay, 400);

assert.ok(rpcSource.includes("const PROVIDER_DISCARD_FILE = '/etc/mihomox/provider-discard.json'"));
assert.ok(rpcSource.includes("sprintf('%J\\n', config)"));
assert.ok(rpcSource.includes('maxDelay: 400'));
assert.ok(rpcSource.includes('config.global.unifiedDelay = config.global.unifiedDelay !== false'));
assert.ok(rpcSource.includes('provider_discard_status'));
assert.ok(rpcSource.includes('providers[name].proxyCount'));
assert.ok(rpcSource.includes('providers[name].proxies = []'));
assert.ok(rpcSource.includes('const managed = {}'));
assert.ok(rpcSource.includes('providers: managed'));
assert.ok(rpcSource.includes('provider_filter_enqueue(provider, manual)'));
assert.ok(rpcSource.includes("const action = manual ? 'manual' : 'enqueue'"));
assert.ok(rpcSource.includes('provider_filter_enqueue(provider, true)'));
assert.ok(rpcSource.includes('native_provider_check(provider)'));
assert.ok(rpcSource.includes("core_api_action_command('PUT', path)"));
assert.ok(rpcSource.includes("core_api_action_command('GET', path + '/healthcheck')"));
assert.ok(rpcSource.includes("' >/dev/null 2>&1 </dev/null &'"));
const nativeProviderCheck = rpcSource.match(/function native_provider_check[\s\S]*?\n}/)?.[0] || '';
assert.ok(!nativeProviderCheck.includes("process.read('all')"));
assert.ok(rpcSource.includes("error: 'restart_required'"));
assert.ok(rpcSource.includes("error: 'queue_failed'"));
assert.ok(viewSource.includes("_('Restart Required')"));
assert.ok(viewSource.includes('errorLabel(result?.error)'));
assert.ok(managerSource.includes("--noproxy '*'"));
assert.ok(managerSource.includes('routing-mark: $PROBE_MARK'));
assert.ok(managerSource.includes('HTTP_PROXY= HTTPS_PROXY= ALL_PROXY='));
assert.ok(managerSource.includes('probe_mark_available'));
assert.ok(managerSource.includes('manager_enabled'));
assert.ok(managerSource.includes('manager_enabled || return 0'));
assert.ok(managerSource.includes('MIHOMOX_PROVIDER_FILTER_STORE_DIR'));
assert.ok(managerSource.includes('STORE_DIR="${MIHOMOX_PROVIDER_FILTER_STORE_DIR:-$HOME_DIR/provider-filter}"'));
assert.ok(managerSource.includes('dir="$STORE_DIR/$key"'));
assert.ok(managerSource.includes('write_state "$name" queued'));
assert.ok(managerSource.includes('unified-delay: $UNIFIED_DELAY'));
assert.ok(managerSource.includes('global_field maxDelay 400'));
assert.ok(managerSource.includes("'.delay // 0'"));
assert.ok(managerSource.includes('"$delay" -le "$MAX_DELAY"'));
assert.ok(managerSource.includes("hexdump -ve '1/1 \"%02x\"'"));
assert.ok(!managerSource.includes('od -An'), 'provider filtering must not depend on the optional od utility');
assert.ok(managerSource.includes('$proxy != "DIRECT"'));
assert.ok(managerSource.includes('$proxy != "direct"'));
assert.ok(managerSource.includes('https://223.5.5.5/dns-query'));
assert.ok(managerSource.includes('https://1.1.1.1/dns-query'));
assert.ok(managerSource.includes('pid=$(read_pid "$PROBE_DIR/pid") || return 1'));
assert.ok(managerSource.includes('if pid=$(read_pid "$WORKER_PID"); then'));
assert.ok(managerSource.includes('enqueue_provider "$2" true'));
assert.ok(managerSource.includes("-name '*.manual'"));
assert.ok(managerSource.includes('case "$request" in *.manual) manual=true'));
assert.ok(managerSource.includes('update_one "$name" "$manual"'));
assert.ok(managerSource.includes('[ "$manual" != true ] && [ "$enabled" != true ]'));
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
