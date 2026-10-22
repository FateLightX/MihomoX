'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const source = fs.readFileSync(path.join(__dirname,
    '../luci-app-mihomox/root/usr/share/rpcd/ucode/luci.mihomox'), 'utf8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mihomox-launch-'));
const script = path.join(root, 'update core.sh');
const pending = path.join(root, 'pending');
const status = path.join(root, 'status');
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
let launchPath = process.env.PATH;

// The update_core method uses the JS-compatible subset of ucode. Execute that
// method with filesystem/UCI fixtures, but run its launcher in a real shell.
const methodSource = source.slice(source.indexOf('\tupdate_core: {'), source.indexOf('\n\tapi: {'));
const method = new Function('shell_read', 'length', 'match', 'CORE_CHANNELS',
    'CORE_ARCHITECTURES', 'CORE_UPDATE_SCRIPT', 'CORE_PENDING_FILE', 'CORE_STATUS_FILE', 'access',
    'system', 'cursor', 'core_update_running', 'writefile', 'unlink', 'shell_quote',
    'return ({' + methodSource + '}).update_core;')(
    () => 'release', value => value.length, (value, expression) => value.match(expression),
    { release: true }, { auto: true }, script, pending, status,
    file => fs.existsSync(file),
    command => {
        if (command.startsWith('mkdir -p ')) return 0;
        const result = spawnSync('/bin/sh', ['-c', command.replace(
            '/var/log/mihomox/core-update.log', quote(path.join(root, 'update.log')))], {
            env: { ...process.env, PATH: launchPath }, timeout: 10000
        });
        assert.ifError(result.error);
        return result.status;
    },
    () => ({ load() {}, set() {}, commit: () => true }),
    () => false,
    (file, content) => { fs.writeFileSync(file, content); return content.length; },
    file => fs.rmSync(file, { force: true }), quote
);

try {
    const request = { args: { channel: 'release', architecture: 'auto' } };
    fs.writeFileSync(script, '#!/bin/sh\nrm -f ' + quote(pending) + '\n', { mode: 0o755 });
    const completed = method.call(request);
    assert.strictEqual(completed.success, true);
    assert.strictEqual(completed.started, true);
    assert.strictEqual(completed.running, false, 'completed work must not be reported as still running');

    // An asynchronous shell reports zero even when nohup does not exist.
    // The launch handshake must detect this and clear its pending marker.
    const emptyPath = path.join(root, 'empty-bin');
    fs.mkdirSync(emptyPath);
    launchPath = emptyPath;
    assert.strictEqual(method.call(request).error, 'start_failed');
    assert.ok(!fs.existsSync(pending));
    assert.match(fs.readFileSync(status, 'utf8'), /^state=failed/m);

    launchPath = process.env.PATH;
    fs.writeFileSync(script, '#!/bin/sh\nexit 1\n');
    assert.strictEqual(method.call(request).error, 'start_failed', 'a script exiting before initialization did not start');
    assert.ok(!fs.existsSync(pending));
    assert.match(fs.readFileSync(status, 'utf8'), /^state=failed/m);
    console.log('core launch handshake tests passed');
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}
