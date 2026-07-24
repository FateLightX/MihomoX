'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const editorPath = path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/editor.js'
);
const aceDir = path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/mihomox/ace'
);
const source = fs.readFileSync(editorPath, 'utf8');
const aceAssets = {
    'ace.min.js': '072d13e53d11e2ceccfffe1a0fa7f15cf69c5435d897df53d98c71be1c4a2e7f',
    'mode-yaml.min.js': '24faa242ac5085656ff0b9fe283edc8d8565c2ad84f5a824b5868eb5a7ca5cb3',
    'theme-tomorrow_night.min.js': '757fb017f0ff7a6f2b47f30a3ff7bd6211529deceebf07909d4647ae1175a38a'
};

const view = { extend: (definition) => definition };
const uci = { load: () => Promise.resolve(), sections: () => [] };
const L = { resource: (name) => '/luci-static/resources/' + name };
const E = (tag, attributes, children) => {
    const style = {};
    if (attributes?.style?.includes('display:none'))
        style.display = 'none';
    return {
        tagName: tag.toUpperCase(),
        attributes: attributes || {},
        children: children || [],
        style: style,
        remove: function () { this.removed = true; }
    };
};
const quietConsole = { warn: () => { } };

function createEnvironment(options = {}) {
    const scripts = [];
    let aceDefinition;
    const renderedOptions = [];
    const profiles = [];
    const ruleProviders = [];
    const proxyProviders = [];
    function MockMap() {}
    MockMap.prototype.section = function () {
        return {
            option: function (type, name) {
                const option = {
                    name: name,
                    values: [],
                    value: function (value, label) {
                        this.values.push({ value, label });
                    }
                };
                renderedOptions.push(option);
                return option;
            }
        };
    };
    MockMap.prototype.render = function () {
        return renderedOptions;
    };
    const form = {
        ListValue: function () {},
        Map: MockMap,
        NamedSection: function () {},
        TextValue: {
            extend: (definition) => {
                aceDefinition = definition;
                return definition;
            }
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
        listProxyProviders: () => Promise.resolve(proxyProviders)
    };
    const document = {
        head: {
            appendChild: (script) => scripts.push(script)
        }
    };
    const loadView = new Function(
        'form', 'view', 'uci', 'fs', 'dom', 'ui', 'mihomox',
        'E', 'window', 'document', 'console', 'L', '_',
        source
    );
    const editorView = loadView(
        form, view, uci, {}, options.dom || {}, {}, mihomox,
        E, options.window || {}, document, quietConsole, L, (text) => text
    );
    return {
        aceDefinition,
        editorView,
        profiles,
        renderedOptions,
        ruleProviders,
        proxyProviders,
        scripts
    };
}

async function main() {
    for (const [name, expectedHash] of Object.entries(aceAssets)) {
        const content = fs.readFileSync(path.join(aceDir, name));
        const actualHash = crypto.createHash('sha256').update(content).digest('hex');
        assert.strictEqual(actualHash, expectedHash, name + ' checksum mismatch');
    }

    const fallbackEnv = createEnvironment();

    fallbackEnv.profiles.push({ name: 'config.yaml' }, { name: 'country.mrs' });
    fallbackEnv.ruleProviders.push({ name: 'rules.MRS' }, { name: 'rules.yaml' });
    fallbackEnv.proxyProviders.push({ name: 'proxy.mrs' }, { name: 'proxy.yml' });
    const loaded = await fallbackEnv.editorView.load();
    assert.deepStrictEqual(loaded[1].map((file) => file.name), ['config.yaml']);
    assert.deepStrictEqual(loaded[2].map((file) => file.name), ['rules.yaml']);
    assert.deepStrictEqual(loaded[3].map((file) => file.name), ['proxy.yml']);
    assert.strictEqual(fallbackEnv.scripts.length, 0, 'page load must not wait for ACE');

    const renderEnv = createEnvironment();
    renderEnv.editorView.render([
        null,
        [{ name: 'config.yaml' }, { name: 'country.mrs' }],
        [{ name: 'rules.yaml' }, { name: 'rules.MRS' }],
        [{ name: 'proxy.yml' }, { name: 'proxy.mrs' }]
    ]);
    const fileOption = renderEnv.renderedOptions.find((option) => option.name === '_file');
    assert.ok(fileOption);
    assert.deepStrictEqual(
        fileOption.values
            .filter((entry) => /^\/etc\/mihomox\/(profiles|run\/providers)\//.test(entry.value))
            .map((entry) => entry.value),
        [
            '/etc/mihomox/profiles/config.yaml',
            '/etc/mihomox/run/providers/rule/rules.yaml',
            '/etc/mihomox/run/providers/proxy/proxy.yml'
        ]
    );
    assert.ok(fileOption.values.every((entry) => !/\.mrs$/i.test(entry.value)));

    const textarea = {
        tagName: 'TEXTAREA',
        id: 'editor-textarea',
        style: {},
        value: 'mode: rule'
    };
    const widget = fallbackEnv.aceDefinition.renderWidget.call({
        rows: 25,
        cbid: () => 'editor-textarea',
        super: () => textarea
    }, 'editor', 0, textarea.value);
    const editorContainer = widget.children[1];

    assert.notStrictEqual(textarea.style.display, 'none');
    assert.strictEqual(editorContainer.style.display, 'none');
    assert.strictEqual(fallbackEnv.scripts.length, 1);
    assert.strictEqual(
        fallbackEnv.scripts[0].attributes.src,
        '/luci-static/resources/mihomox/ace/ace.min.js'
    );
    assert.ok(!/^https?:/.test(fallbackEnv.scripts[0].attributes.src));

    fallbackEnv.scripts[0].onerror();
    await new Promise((resolve) => setImmediate(resolve));

    assert.notStrictEqual(textarea.style.display, 'none');
    assert.strictEqual(editorContainer.removed, true);

    const editors = [];
    const successEnv = createEnvironment({
        dom: { findClassInstance: () => null },
        window: {
            ace: {
                edit: (container, options) => {
                    const editor = {
                        container,
                        options,
                        resizeCalls: [],
                        setValueCalls: [],
                        value: '',
                        session: { on: (event, handler) => { editor.changeHandler = handler; } },
                        getValue: function () { return this.value; },
                        setValue: function (value, cursorPosition) {
                            this.value = value;
                            this.setValueCalls.push([value, cursorPosition]);
                        },
                        resize: function (force) { this.resizeCalls.push(force); }
                    };
                    editors.push(editor);
                    return editor;
                }
            }
        }
    });
    const successTextarea = {
        tagName: 'TEXTAREA',
        id: 'editor-success-textarea',
        style: {},
        value: 'mode: global'
    };
    const successWidget = successEnv.aceDefinition.renderWidget.call({
        rows: 25,
        cbid: () => 'editor-success-textarea',
        super: () => successTextarea
    }, 'editor', 0, successTextarea.value);
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(successEnv.scripts.length, 0);
    assert.strictEqual(successTextarea.style.display, 'none');
    assert.strictEqual(successWidget.children[1].style.display, '');
    assert.strictEqual(successWidget.children[1]._aceInstance, editors[0]);
    assert.deepStrictEqual(editors[0].setValueCalls, [['mode: global', -1]]);
    assert.deepStrictEqual(editors[0].resizeCalls, [true]);
    console.log('LuCI editor ACE tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
