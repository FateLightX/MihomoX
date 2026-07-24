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
    'ace.min.js': '116962fc63b120f6f6973e7e82ec8faa02c3bf1ceb59a3effaafb57ea09bee88',
    'mode-yaml.min.js': '25afd0b54386dae0f9389c14c25c149d14ff86a6ec23e94391469f7a83bd302b',
    'theme-tomorrow_night.min.js': '8ba3064c7eff1c7384a6d8a4a30ad0ea2c09f270b6097f7b4ab415bf97aa449e'
};

const scripts = [];
let aceDefinition;

const form = {
    TextValue: {
        extend: (definition) => {
            aceDefinition = definition;
            return definition;
        }
    }
};
const view = { extend: (definition) => definition };
const uci = { load: () => Promise.resolve(), sections: () => [] };
const profiles = [];
const ruleProviders = [];
const proxyProviders = [];
const mihomox = {
    listProfiles: () => Promise.resolve(profiles),
    listRuleProviders: () => Promise.resolve(ruleProviders),
    listProxyProviders: () => Promise.resolve(proxyProviders)
};
const window = {};
const L = { resource: (name) => '/luci-static/resources/' + name };
const document = {
    head: {
        appendChild: (script) => scripts.push(script)
    }
};
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

const loadView = new Function(
    'form', 'view', 'uci', 'fs', 'dom', 'ui', 'mihomox',
    'E', 'window', 'document', 'console', 'L',
    source
);
const editorView = loadView(
    form, view, uci, {}, {}, {}, mihomox,
    E, window, document, quietConsole, L
);

async function main() {
    for (const [name, expectedHash] of Object.entries(aceAssets)) {
        const content = fs.readFileSync(path.join(aceDir, name));
        const actualHash = crypto.createHash('sha256').update(content).digest('hex');
        assert.strictEqual(actualHash, expectedHash, name + ' checksum mismatch');
    }

    profiles.push({ name: 'config.yaml' }, { name: 'country.mrs' });
    ruleProviders.push({ name: 'rules.MRS' }, { name: 'rules.yaml' });
    proxyProviders.push({ name: 'proxy.mrs' }, { name: 'proxy.yml' });
    const loaded = await editorView.load();
    assert.deepStrictEqual(loaded[1].map((file) => file.name), ['config.yaml']);
    assert.deepStrictEqual(loaded[2].map((file) => file.name), ['rules.yaml']);
    assert.deepStrictEqual(loaded[3].map((file) => file.name), ['proxy.yml']);
    assert.strictEqual(scripts.length, 0, 'page load must not wait for ACE');

    const textarea = {
        tagName: 'TEXTAREA',
        id: 'editor-textarea',
        style: {},
        value: 'mode: rule'
    };
    const widget = aceDefinition.renderWidget.call({
        rows: 25,
        cbid: () => 'editor-textarea',
        super: () => textarea
    }, 'editor', 0, textarea.value);
    const editorContainer = widget.children[1];

    assert.notStrictEqual(textarea.style.display, 'none');
    assert.strictEqual(editorContainer.style.display, 'none');
    assert.strictEqual(scripts.length, 1);
    assert.strictEqual(
        scripts[0].attributes.src,
        '/luci-static/resources/mihomox/ace/ace.min.js'
    );
    assert.ok(!/^https?:/.test(scripts[0].attributes.src));

    scripts[0].onerror();
    await new Promise((resolve) => setImmediate(resolve));

    assert.notStrictEqual(textarea.style.display, 'none');
    assert.strictEqual(editorContainer.removed, true);
    console.log('LuCI editor fallback tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
