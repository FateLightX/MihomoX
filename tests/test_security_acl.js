'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const acl = JSON.parse(fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/rpcd/acl.d/luci-app-mihomox.json'
), 'utf8'))['luci-app-mihomox'];

assert.deepStrictEqual(acl.read.ubus.rc, ['list']);
assert.ok(!acl.read.ubus['luci.mihomox'].includes('*'));
assert.ok(!acl.read.ubus['luci.mihomox'].includes('update_core'));
assert.ok(acl.read.ubus['luci.mihomox'].includes('log'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('update_core'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('write_file'));
assert.ok(acl.write.ubus['luci.mihomox'].includes('api'));

const rpcSource = fs.readFileSync(path.join(
    root,
    'luci-app-mihomox/root/usr/share/rpcd/ucode/luci.mihomox'
), 'utf8');
assert.ok(rpcSource.includes("popen(join(' ', map(curl_args, shell_quote)), 'r')"));
assert.ok(rpcSource.includes('function shell_quote(value)'));
assert.ok(!rpcSource.includes('popen(`curl'));
assert.ok(
    rpcSource.includes("const listen = api_tls_listen || api_listen;"),
    'core API requests must prefer the configured TLS listen address'
);
assert.ok(
    rpcSource.includes('const url = controller_url(listen, protocol, path);'),
    'core API requests must build the URL from the selected listen address'
);
assert.ok(
    rpcSource.includes("'--write-out', '\\n__MIHOMOX_API__%{http_code}'"),
    'core API requests must capture the HTTP status'
);
assert.ok(
    rpcSource.includes("return { success: false, status: 0, data: null, error: 'not_configured' }"),
    'core API requests must expose configuration failures'
);
assert.ok(
    rpcSource.includes("error: success ? '' : (status > 0 ? 'http_error' : 'request_failed')"),
    'core API requests must expose non-2xx HTTP responses'
);
assert.ok(!rpcSource.includes("'--proto-default', protocol,\n\t\t'--insecure'"), 'core API must not disable TLS verification unconditionally');
assert.ok(
    rpcSource.includes("protocol == 'https' && tls?.certificate && tls?.['private-key']") &&
    rpcSource.includes("push(curl_args, '--insecure')"),
    'core API may relax TLS verification only for the explicit local certificate/key configuration'
);
assert.ok(rpcSource.includes("match(section_id, /^[A-Za-z0-9_-]{1,64}$/)"));

const installSource = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
assert.ok(!installSource.includes('eval "$(jsonfilter'));
assert.ok(!installSource.includes('--allow-untrusted'));

console.log('security ACL tests passed');
