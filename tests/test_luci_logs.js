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
const rpc = {
    declare: (definition) => {
        declarations.push(definition);
        return (...args) => {
            rpcCalls.push({ method: definition.method, args });
            if (definition.method === 'log')
                return Promise.resolve({ log: args[0] === 'app' ? 'app tail' : 'core tail' });
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
        declarations.some((definition) => definition.method === 'log' && definition.params[0] === 'name'),
        'tools must declare the bounded log RPC'
    );
    assert.strictEqual(await mihomox.getAppLog(), 'app tail');
    assert.strictEqual(await mihomox.getCoreLog(), 'core tail');
    assert.deepStrictEqual(
        rpcCalls.filter((call) => call.method === 'log').map((call) => call.args[0]),
        ['app', 'core']
    );

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
const logMihomox = {
    debugLogPath: '/var/log/mihomox/debug.log',
    getAppLog: () => Promise.resolve('app'),
    getCoreLog: () => Promise.resolve('core'),
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
    }
};
const poll = { add: (callback) => polls.push(callback) };
const logL = {
    resolveDefault: (value) => Promise.resolve(value),
    bind: (fn, context, ...args) => fn.bind(context, ...args)
};
const logView = new Function(
    'form', 'view', 'uci', 'fs', 'poll', 'mihomox', 'window', 'document', '_', 'L',
    logSource
)(form, view, uci, fsModule, poll, logMihomox, window, document, (value) => value, logL);

async function testLogView() {
    await logView.load();
    logView.render([null, 'app', 'core']);
    assert.strictEqual(polls.length, 2);

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
