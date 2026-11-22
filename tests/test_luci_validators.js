'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/mixin.js'
), 'utf8');
const start = source.indexOf('function relativePathEscapes');
const end = source.indexOf('return view.extend');
assert.ok(start >= 0 && end > start, 'mixin validator helpers not found');

const helpers = new Function('_', 'mihomox', `${source.slice(start, end)}\nreturn {
    validateUIName,
    validateUIPath,
    parseSafePaths,
    validateDomainPattern,
    validatePolicyMatcher,
    validateFakeIPRule
};`)(value => value, { homeDir: '/etc/mihomox' });

assert.strictEqual(helpers.validateUIName('zashboard'), true);
assert.strictEqual(helpers.validateUIName('ui/../zashboard'), true);
assert.notStrictEqual(helpers.validateUIName('/tmp/zashboard'), true);
assert.notStrictEqual(helpers.validateUIName('../zashboard'), true);
assert.notStrictEqual(helpers.validateUIName('ui/../../zashboard'), true);
assert.strictEqual(helpers.validateUIPath('ui'), true);
assert.strictEqual(helpers.validateUIPath('ui/../zashboard'), true);
assert.strictEqual(helpers.validateUIPath('/etc/mihomox/ui'), true);
assert.strictEqual(helpers.validateUIPath('/etc/mihomox/ui/../zashboard'), true);
assert.strictEqual(helpers.validateUIPath('/srv/ui', ['/srv']), true);
assert.strictEqual(helpers.validateUIPath('/srv/ui/../zashboard', ['/srv/']), true);
assert.deepStrictEqual(helpers.parseSafePaths(['/srv', ' /opt/ui ']), ['/srv', '/opt/ui']);
assert.deepStrictEqual(helpers.parseSafePaths('/srv:/opt/ui'), ['/srv', '/opt/ui']);
assert.notStrictEqual(helpers.validateUIPath('/usr/share/mihomox/ui'), true);
assert.notStrictEqual(helpers.validateUIPath('/srv-evil/ui', ['/srv']), true);
assert.notStrictEqual(helpers.validateUIPath('/srv/../etc/ui', ['/srv']), true);
assert.notStrictEqual(helpers.validateUIPath('/srv/../../etc/ui', ['/srv']), true);
assert.notStrictEqual(helpers.validateUIPath('/etc/mihomox/../../etc/shadow'), true);
assert.notStrictEqual(helpers.validateUIPath('../ui'), true);
assert.notStrictEqual(helpers.validateUIPath('ui/../../zashboard'), true);

assert.strictEqual(helpers.validateDomainPattern('+.lan'), true);
assert.strictEqual(helpers.validateDomainPattern('Mijia Cloud'), true);
assert.notStrictEqual(helpers.validateDomainPattern('a*b.com'), true);
assert.notStrictEqual(helpers.validateDomainPattern('example.com.'), true);
assert.strictEqual(helpers.validatePolicyMatcher('section', 'geosite:private,cn'), true);
assert.notStrictEqual(helpers.validatePolicyMatcher('section', 'a*b.com'), true);

assert.strictEqual(helpers.validateFakeIPRule('DOMAIN-SUFFIX,lan,real-ip'), true);
assert.strictEqual(helpers.validateFakeIPRule('DOMAIN-SUFFIX, lan, real-ip, no-resolve'), true);
assert.strictEqual(helpers.validateFakeIPRule('DOMAIN-REGEX,^foo,(bar|baz)$,fake-ip'), true);
assert.strictEqual(helpers.validateFakeIPRule('MATCH,fake-ip'), true);
assert.notStrictEqual(helpers.validateFakeIPRule('+.lan'), true);

console.log('LuCI validator tests passed');
