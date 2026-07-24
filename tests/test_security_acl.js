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
assert.ok(rpcSource.includes("popen(curl_args, 'r')"));
assert.ok(!rpcSource.includes('popen(`curl'));
assert.ok(rpcSource.includes("match(section_id, /^[A-Za-z0-9_-]{1,64}$/)"));

const installSource = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
assert.ok(!installSource.includes('eval "$(jsonfilter'));
assert.ok(!installSource.includes('--allow-untrusted'));

console.log('security ACL tests passed');
