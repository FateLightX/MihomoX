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
    ListValue: class { },
    DummyValue: class { }
};
const view = { extend: (definition) => definition };
const ui = { addNotification: function () { notifications++; } };
let notifications = 0;
const E = function () { return {}; };
const values = {
    used: '1 MB',
    total: '2 MB',
    expire: '2026-08-01 00:00:00',
    update: '2026-07-31 12:00:00'
};
let loadCalls = 0;
let unloadCalls = 0;
let updateResult = { success: true };
let statusResult = {};
const pollCallbacks = [];
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
    updateSubscription: () => Promise.resolve(updateResult),
    subscriptionStatus: () => Promise.resolve(statusResult)
};
const L = { resolveDefault: (value, fallback) => Promise.resolve(value).catch(() => fallback) };
const poll = { add: (callback) => pollCallbacks.push(callback) };
const document = { hidden: false };

const profileView = new Function(
    'form', 'view', 'uci', 'ui', 'poll', 'document', 'E', 'mihomox', 'L', '_',
    source
)(form, view, uci, ui, poll, document, E, mihomox, L, (value) => value);

async function main() {
    profileView.render([null, { state: 'running', section: 'subscription_test' }]);
    assert.strictEqual(options._subscription_refresh_status.cfgvalue('subscription_test'), 'Updating');
    assert.strictEqual(options._subscription_refresh_status.cfgvalue('subscription_other'), '-');

    statusResult = { state: 'updated', message: 'restart_required', section: 'subscription_test' };
    await pollCallbacks.at(-1)();
    assert.strictEqual(notifications, 1);
    assert.strictEqual(options._subscription_refresh_status.uiValue, 'Updated, restart to apply');

    statusResult = { state: 'updated', message: 'applied', section: 'subscription_test' };
    profileView.render([null, statusResult]);
    assert.strictEqual(options._subscription_refresh_status.cfgvalue('subscription_test'), 'Updated and applied');

    assert.strictEqual(options.info_url.validate(null, ''), true);
    assert.strictEqual(options.info_url.validate(null, 'https://example.com/info'), true);
    assert.strictEqual(options.url.validate(null, 'ftp://example.com/sub'), 'Invalid URL');

    await options.update_subscription.onclick(null, 'subscription_test');
    assert.strictEqual(loadCalls, 1);
    assert.strictEqual(unloadCalls, 1);
    for (const name of ['used', 'total', 'expire', 'update'])
        assert.strictEqual(options[name].uiValue, values[name]);

    updateResult = { success: true, running: true };
    await options.update_subscription.onclick(null, 'subscription_test');
    assert.strictEqual(notifications, 2);
    assert.strictEqual(unloadCalls, 1, 'running update must not refresh stale data');

    updateResult = { success: true };
    await options.update_subscription.onclick(null, 'subscription_test');
    assert.strictEqual(unloadCalls, 2);

    updateResult = { success: false };
    await assert.rejects(
        options.update_subscription.onclick(null, 'subscription_test'),
        /Subscription: Failed/
    );
    assert.strictEqual(loadCalls, 2, 'failed update must not refresh stale data');

    console.log('LuCI profile update tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
