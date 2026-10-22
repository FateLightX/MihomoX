'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const toolsSource = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js'
), 'utf8');

const rpcCalls = [];
const declarations = [];
let rpcError = false;
const rpc = {
    declare: (definition) => {
        declarations.push(definition);
        return (...args) => {
            rpcCalls.push({ method: definition.method, args });
            if (rpcError) return Promise.reject(new Error("rpc unavailable"));
            if (definition.method === 'log')
                return Promise.resolve({
                    log: args[0] === 'app' ? 'app tail' : 'core tail',
                    offset: 0,
                    size: args[0] === 'app' ? 8 : 9,
                    next: args[0] === 'app' ? 8 : 9,
                    inode: args[0] === 'app' ? 101 : 102
                });
            return Promise.resolve({});
        };
    }
};
const baseclass = { extend: (definition) => definition };
const luciFs = {
    list: () => Promise.resolve([]),
    read_direct: () => Promise.reject(new Error('log reads must use RPC'))
};
const L = {
    resolveDefault: (value, fallback) => Promise.resolve(value).catch(() => fallback)
};
const mihomox = new Function(
    'baseclass', 'uci', 'fs', 'rpc', 'request', 'L',
    toolsSource
)(baseclass, {}, luciFs, rpc, {}, L);

async function testTools() {
    assert.ok(
        declarations.some((definition) => definition.method === 'log' && definition.params[0] === 'name' && definition.params[3] === 'inode' && definition.params.length === 4),
        'tools must declare the bounded log RPC'
    );
    assert.deepStrictEqual(await mihomox.getAppLog(), { log: 'app tail', offset: 0, size: 8, next: 8, inode: 101 });
    assert.deepStrictEqual(await mihomox.getCoreLog(), { log: 'core tail', offset: 0, size: 9, next: 9, inode: 102 });
    assert.deepStrictEqual(
        rpcCalls.filter((call) => call.method === 'log').map((call) => call.args[0]),
        ['app', 'core']
    );
    await mihomox.getAppLog(8, 101);
    assert.deepStrictEqual(rpcCalls.at(-1).args, ['app', 8, 65536, 101]);

    rpcError = true;
    await assert.rejects(mihomox.getAppLog(), /rpc unavailable/);
    await assert.rejects(mihomox.getCoreLog(), /rpc unavailable/);
    await assert.rejects(mihomox.coreStatus(), /rpc unavailable/);
    rpcError = false;

    const field = {
        classList: { contains: (name) => name === 'cbi-value-field' },
        style: {},
        firstChild: 'input',
        insertBefore: function (node) {
            this.firstChild = node;
        }
    };
    const description = { parentNode: field, style: {} };
    const renderedNode = { querySelectorAll: () => [description] };
    assert.strictEqual(mihomox.inlineDescriptions(renderedNode), renderedNode);
    assert.strictEqual(field.style.display, 'flex');
    assert.strictEqual(description.style.order, '1');
    assert.strictEqual(field.firstChild, 'input');
}

const logSource = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/log.js'
), 'utf8');

const rendered = {};
const polls = [];
class MockOption {
    constructor(name) {
        this.name = name;
        rendered[name] = this;
    }

    depends() { }

    value() { }

    getUIElement() {
        return {
            setValue: (value) => {
                this.uiValue = value;
                this.writes = (this.writes || 0) + 1;
            },
            node: { firstChild: { scrollTop: 0, scrollHeight: 1 } }
        };
    }
}
class MockSection {
    tab() { }

    taboption(_, __, name) {
        return new MockOption(name);
    }
}
class MockMap {
    section() {
        return new MockSection();
    }

    lookupOption(name) {
        return rendered[name] ? [rendered[name]] : null;
    }

    render() {
        return this;
    }
}
const form = {
    Map: MockMap,
    NamedSection: class { },
    Flag: class { },
    Value: class { },
    ListValue: class { },
    TextValue: class { },
    Button: class { }
};
const view = { extend: (definition) => definition };
const uci = { load: () => Promise.resolve() };
let debugResult = { success: false };
let readDebugLog;
let readDebugLogResolve;
const debugBlob = { type: 'blob' };
const appLogCalls = [];
let appLogResult = { log: '', offset: 3, size: 3, next: 3, inode: 1 };
let logError = false;
const notifications = [];
const ui = { addNotification: (_, content) => notifications.push(content) };
const E = (_, attrs, text) => text;
const logMihomox = {
    debugLogPath: '/var/log/mihomox/debug.log',
    getAppLog: (offset, inode) => {
        appLogCalls.push([offset, inode]);
        return logError ? Promise.reject(new Error("read failed")) : Promise.resolve(appLogResult);
    },
    getCoreLog: () => Promise.resolve({ log: '', offset: 4, size: 4, next: 4, inode: 2 }),
    clearAppLog: () => Promise.resolve(),
    clearCoreLog: () => Promise.resolve(),
    debug: () => Promise.resolve(debugResult)
};
const fsModule = {
    read_direct: () => {
        readDebugLog = new Promise((resolve) => {
            readDebugLogResolve = resolve;
        });
        return readDebugLog;
    }
};
const createdUrls = [];
let clicked = false;
const window = {
    URL: {
        createObjectURL: (blob) => {
            assert.strictEqual(blob, debugBlob);
            const url = 'blob:test';
            createdUrls.push(url);
            return url;
        },
        revokeObjectURL: () => { }
    }
};
const document = {
    createElement: () => ({
        click: () => { clicked = true; }
    }),
    body: {
        appendChild: () => { },
        removeChild: () => { }
    },
    hidden: false
};
const poll = { add: (callback) => polls.push(callback) };
const logL = {
    resolveDefault: (value) => Promise.resolve(value),
    bind: (fn, context, ...args) => fn.bind(context, ...args)
};
const logView = new Function(
    'form', 'view', 'uci', 'fs', 'poll', 'mihomox', 'window', 'document', '_', 'L', 'ui', 'E',
    logSource
)(form, view, uci, fsModule, poll, logMihomox, window, document, (value) => value, logL, ui, E);

async function testLogView() {
    await logView.load();
    logView.render([
        null,
        { log: 'app', size: 3, next: 3, inode: 1 },
        { log: 'core', size: 4, next: 4, inode: 2 }
    ]);
    assert.strictEqual(polls.length, 2);
    assert.strictEqual(rendered.scheduled_clear_cron.validate(null, '0 3 * * *'), true);
    assert.strictEqual(rendered.scheduled_clear_cron.validate(null, '* * * * *;reboot'), 'Invalid cron expression');

    appLogResult = { log: 'rotated', offset: 0, size: 7, next: 7, inode: 3 };
    await polls[0]();
    assert.strictEqual(rendered._app_log.uiValue, 'rotated');
    assert.deepStrictEqual(appLogCalls.at(-1), [3, 1]);

    appLogResult = { log: '+more', offset: 7, size: 12, next: 12, inode: 3 };
    await polls[0]();
    assert.strictEqual(rendered._app_log.uiValue, 'rotated+more');
    assert.deepStrictEqual(appLogCalls.at(-1), [7, 3]);

    appLogResult = { log: '', offset: 12, size: 12, next: 12, inode: 3 };
    const writes = rendered._app_log.writes;
    await polls[0]();
    assert.strictEqual(rendered._app_log.writes, writes, 'unchanged log must not rewrite the text area');
    logError = true;
    await polls[0]();
    await polls[0]();
    assert.strictEqual(notifications.length, 1, 'repeated failures must not flood notifications');
    assert.strictEqual(rendered._app_log.uiValue, 'rotated+more');
    assert.deepStrictEqual(appLogCalls.at(-1), [12, 3], 'failed reads must retain the offset');
    logError = false;
    appLogResult = { log: 'short', offset: 0, size: 5, next: 5, inode: 3 };
    await polls[0]();
    assert.strictEqual(rendered._app_log.uiValue, 'short', 'truncation replaces the old text');
    appLogResult = { log: '', offset: 0, size: 0, next: 0, inode: 4 };
    await polls[0]();
    assert.strictEqual(rendered._app_log.uiValue, '', 'rotation to an empty file must clear old text');

    logError = true;
    const initialFailure = await logView.load();
    assert.strictEqual(initialFailure[1].readFailed, true, 'initial errors remain visible without blocking the page');
    logError = false;

    await assert.rejects(
        rendered._generate_download_debug_log.onclick(),
        /Debug Log: Failed/
    );
    assert.strictEqual(readDebugLog, undefined, 'failed debug generation must not read a stale file');

    debugResult = { success: true };
    const download = rendered._generate_download_debug_log.onclick();
    await Promise.resolve();
    assert.strictEqual(clicked, false, 'download must wait for the generated file');
    readDebugLogResolve(debugBlob);
    await download;
    assert.strictEqual(clicked, true);
    assert.deepStrictEqual(createdUrls, ['blob:test']);
}

Promise.resolve()
    .then(testTools)
    .then(testLogView)
    .then(() => console.log('LuCI log RPC tests passed'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
