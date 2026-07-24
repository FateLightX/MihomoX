'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/app.js'
), 'utf8');

const formValues = {
    channel: 'Prerelease-Alpha',
    architecture: 'amd64-v3',
    mirror_prefix: 'https://mirror.example/',
    download_url: 'https://example.com/mihomo.gz',
    download_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
};
const nodes = {};
const pollCallbacks = [];
let renderedMap;
let updateArgs;

class FakeOption {
    constructor(name) {
        this.name = name;
    }

    value() { }
    depends() { }

    formvalue(sectionId) {
        assert.strictEqual(sectionId, 'core');
        return formValues[this.name];
    }

    getUIElement(sectionId) {
        assert.strictEqual(sectionId, 'core');
        return {
            setValue: (value) => {
                this.uiValue = value;
            }
        };
    }
}

class FakeSection {
    constructor(map) {
        this.map = map;
    }

    option(_, name) {
        const option = new FakeOption(name);
        this.map.options[name] = option;
        return option;
    }

    taboption(_, type, name) {
        return this.option(type, name);
    }

    tab() { }
}

class FakeMap {
    constructor() {
        this.options = {};
        renderedMap = this;
    }

    section() {
        return new FakeSection(this);
    }

    render() {
        return this;
    }
}

const form = {
    Map: FakeMap,
    TableSection: class { },
    NamedSection: class { },
    Value: class { },
    DummyValue: class { },
    Button: class { },
    ListValue: class { },
    Flag: class { },
    DynamicList: class { }
};
const view = { extend: (definition) => definition };
const uci = { load: () => Promise.resolve(), sections: () => [] };
const poll = { add: (callback) => pollCallbacks.push(callback) };
const coreStatus = {
    installed_architecture: 'linux-amd64-v3',
    detected_architecture: 'linux-amd64-v3',
    updated_at: '2026-07-24 12:34:56'
};
const mihomox = {
    updateCore: (...args) => {
        updateArgs = args;
        return Promise.resolve({ success: true, channel: args[0] });
    }
};
const E = (_, attributes) => Object.assign({ style: {}, value: '' }, attributes);
const translate = (value) => value;
const L = { resolveDefault: (value) => value };
const document = {
    getElementById: (id) => {
        nodes[id] ||= { style: {}, value: '', textContent: nodes[id]?.textContent || '', parentNode: { appendChild: () => {} } };
        return nodes[id];
    },
    querySelectorAll: () => {
        const btn = {
            value: 'Update Core',
            parentNode: {
                appendChild: (span) => {
                    nodes[span.id] = span;
                }
            }
        };
        return [btn];
    }
};

const loadView = new Function(
    'form', 'view', 'uci', 'poll', 'mihomox', 'E', '_', 'L', 'document',
    source
);
const appView = loadView(form, view, uci, poll, mihomox, E, translate, L, document);

appView.render([null, {}, false, [], coreStatus]);

assert.strictEqual(renderedMap.options.channel.default, 'Prerelease-Alpha');
assert.strictEqual(renderedMap.options._update_status, undefined);
const updateTime = renderedMap.options._update_time.cfgvalue();
assert.strictEqual(updateTime.value, coreStatus.updated_at);
assert.strictEqual(nodes.core_update_span, undefined);

Promise.resolve(renderedMap.options._update_core.onclick({ type: 'click' }, 'core'))
    .then(() => {
        assert.deepStrictEqual(updateArgs, [
            'Prerelease-Alpha',
            'amd64-v3',
            'https://mirror.example/',
            'https://example.com/mihomo.gz',
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        ]);
        assert.strictEqual(renderedMap.options.channel.uiValue, 'Prerelease-Alpha');
        assert.ok(nodes.core_update_span);
        assert.strictEqual(nodes.core_update_span.textContent, 'Updating');
        assert.strictEqual(nodes.core_update_span.style.display, 'inline');
        console.log('LuCI core update tests passed');
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
