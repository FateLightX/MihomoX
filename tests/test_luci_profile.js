'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/profile.js'
), 'utf8');

const options = {};

class MockOption {
    constructor(name) {
        this.name = name;
        options[name] = this;
    }

    value() { }

    getUIElement() {
        return {
            setValue: (value) => {
                this.uiValue = value;
            }
        };
    }
}

class MockSection {
    option(_, name) {
        return new MockOption(name);
    }
}

class MockMap {
    section() {
        return new MockSection();
    }

    lookupOption(name) {
        return options[name] ? [options[name]] : null;
    }

    render() {
        return this;
    }
}

const form = {
    Map: MockMap,
    NamedSection: class { },
    GridSection: class { },
    FileUpload: class { },
    Value: class { },
    Button: class { },
    ListValue: class { }
};
const view = { extend: (definition) => definition };
const values = {
    used: '1 MB',
    total: '2 MB',
    expire: '2026-08-01 00:00:00',
    update: '2026-07-31 12:00:00'
};
let loadCalls = 0;
let unloadCalls = 0;
let updateResult = { success: true };
const uci = {
    load: () => {
        loadCalls++;
        return Promise.resolve();
    },
    unload: () => {
        unloadCalls++;
    },
    sections: () => [],
    get: (_, __, name) => values[name]
};
const mihomox = {
    profilesDir: '/etc/mihomox/profiles',
    updateSubscription: () => Promise.resolve(updateResult)
};

const profileView = new Function(
    'form', 'view', 'uci', 'mihomox', '_',
    source
)(form, view, uci, mihomox, (value) => value);

async function main() {
    profileView.render();

    await options.update_subscription.onclick(null, 'subscription_test');
    assert.strictEqual(loadCalls, 1);
    assert.strictEqual(unloadCalls, 1);
    for (const name of ['used', 'total', 'expire', 'update'])
        assert.strictEqual(options[name].uiValue, values[name]);

    updateResult = { success: false };
    await assert.rejects(
        options.update_subscription.onclick(null, 'subscription_test'),
        /Subscription: Failed/
    );
    assert.strictEqual(loadCalls, 1, 'failed update must not refresh stale data');

    console.log('LuCI profile update tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
