'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const editorPath = path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/editor.js'
);
const source = fs.readFileSync(editorPath, 'utf8');

const profiles = [];
const ruleProviders = [];
const proxyProviders = [];
const renderedOptions = {};
let selectedPath = '';
let readCalls = 0;
let writeCalls = 0;

function TextValue() {}

function MockOption(type, name) {
    this.type = type;
    this.name = name;
    this.values = [];
}

MockOption.prototype.value = function (value, label) {
    this.values.push({ value, label });
};

MockOption.prototype.formvalue = function () {
    return selectedPath;
};

MockOption.prototype.getUIElement = function () {
    return { setValue: function () {} };
};

function MockMap() {}

MockMap.prototype.section = function () {
    return {
        option: function (type, name) {
            const option = new MockOption(type, name);
            renderedOptions[name] = option;
            return option;
        }
    };
};

MockMap.prototype.lookupOption = function (name) {
    return [renderedOptions[name]];
};

MockMap.prototype.render = function () {
    return renderedOptions;
};

const form = {
    ListValue: function () {},
    Map: MockMap,
    NamedSection: function () {},
    TextValue: TextValue
};
const view = { extend: (definition) => definition };
const uci = { load: () => Promise.resolve(), sections: () => [] };
const luciFs = {
    read_direct: function () {
        readCalls++;
        return Promise.resolve('');
    }
};
const mihomox = {
    profilesDir: '/etc/mihomox/profiles',
    subscriptionsDir: '/etc/mihomox/subscriptions',
    ruleProvidersDir: '/etc/mihomox/run/providers/rule',
    proxyProvidersDir: '/etc/mihomox/run/providers/proxy',
    mixinFilePath: '/etc/mihomox/mixin.yaml',
    runProfilePath: '/etc/mihomox/run/config.yaml',
    listProfiles: () => Promise.resolve(profiles),
    listRuleProviders: () => Promise.resolve(ruleProviders),
    listProxyProviders: () => Promise.resolve(proxyProviders),
    writefile: function () {
        writeCalls++;
        return Promise.resolve();
    }
};
const L = { resolveDefault: (value) => value };

const loadView = new Function(
    'form', 'view', 'uci', 'fs', 'mihomox', 'L', '_',
    source
);
const editorView = loadView(form, view, uci, luciFs, mihomox, L, (text) => text);

async function main() {
    assert.ok(!/\bace\b/i.test(source), 'editor must not load ACE');

    profiles.push({ name: 'config.yaml' }, { name: 'country.mrs' });
    ruleProviders.push({ name: 'rules.MRS' }, { name: 'rules.yaml' });
    proxyProviders.push({ name: 'proxy.mrs' }, { name: 'proxy.yml' });

    const loaded = await editorView.load();
    assert.deepStrictEqual(loaded[1].map((file) => file.name), ['config.yaml']);
    assert.deepStrictEqual(loaded[2].map((file) => file.name), ['rules.yaml']);
    assert.deepStrictEqual(loaded[3].map((file) => file.name), ['proxy.yml']);

    editorView.render([
        null,
        [{ name: 'config.yaml' }, { name: 'country.mrs' }],
        [{ name: 'rules.yaml' }, { name: 'rules.MRS' }],
        [{ name: 'proxy.yml' }, { name: 'proxy.mrs' }]
    ]);

    const fileOption = renderedOptions._file;
    const contentOption = renderedOptions._file_content;
    assert.strictEqual(contentOption.type, form.TextValue);
    assert.ok(fileOption.values.every((entry) => !/\.mrs$/i.test(entry.value)));

    selectedPath = '/etc/mihomox/run/providers/rule/rules.mrs';
    assert.strictEqual(fileOption.onchange(null, 'editor', selectedPath), undefined);
    assert.strictEqual(contentOption.write('editor', 'binary'), undefined);
    assert.strictEqual(contentOption.remove('editor'), undefined);
    assert.strictEqual(readCalls, 0);
    assert.strictEqual(writeCalls, 0);

    console.log('LuCI default editor tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
