'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/profile.js'
), 'utf8');
const options = {};

function FakeOption(type, name) {
    this.type = type;
    this.name = name;
}

FakeOption.prototype.value = function () {};

function FakeSection() {}

FakeSection.prototype.option = function (type, name) {
    const option = new FakeOption(type, name);
    options[name] = option;
    return option;
};

function FakeMap() {}

FakeMap.prototype.section = function () {
    return new FakeSection();
};

FakeMap.prototype.render = function () {
    return options;
};

const form = {
    Button: function () {},
    FileUpload: function () {},
    GridSection: function () {},
    ListValue: function () {},
    Map: FakeMap,
    NamedSection: function () {},
    Value: function () {}
};
const view = { extend: (definition) => definition };
const uci = { load: () => Promise.resolve() };
const mihomox = {
    profilesDir: '/etc/mihomox/profiles',
    ruleProvidersDir: '/etc/mihomox/run/providers/rule'
};

const loadView = new Function('form', 'view', 'uci', 'mihomox', '_', source);
const profileView = loadView(form, view, uci, mihomox, (text) => text);
profileView.render([null]);

const upload = options._upload_rule;
assert.ok(upload);
assert.strictEqual(upload.type, form.FileUpload);
assert.strictEqual(upload.browser, true);
assert.strictEqual(upload.enable_upload, true);
assert.strictEqual(upload.enable_remove, false);
assert.strictEqual(upload.enable_download, false);
assert.strictEqual(upload.root_directory, mihomox.ruleProvidersDir);
assert.strictEqual(upload.write('config', '/tmp/rules.mrs'), true);

console.log('LuCI rule upload tests passed');
