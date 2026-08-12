'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js'
), 'utf8');

const apiResults = [];
const declarations = [];
const rpc = {
    declare: (definition) => {
        declarations.push(definition);
        return () => {
            if (definition.method === 'api')
                return Promise.resolve(apiResults.shift());
            return Promise.resolve({});
        };
    }
};
const baseclass = { extend: (definition) => definition };
const L = { resolveDefault: (value, fallback) => Promise.resolve(value).catch(() => fallback) };
const mihomox = new Function(
    'baseclass', 'uci', 'fs', 'rpc', 'request', 'L',
    source
)(baseclass, {}, { list: () => Promise.resolve([]) }, rpc, {}, L);

async function main() {
    assert.ok(declarations.some((definition) => definition.method === 'api'));

    apiResults.push({ success: true, status: 204, data: null, error: '' });
    assert.strictEqual(await mihomox.updateDashboard(), null, 'empty successful response must be accepted');

    apiResults.push({ success: false, status: 401, data: null, error: 'http_error' });
    await assert.rejects(mihomox.updateDashboard(), /HTTP 401/);

    apiResults.push({ success: false, status: 0, data: null, error: 'request_failed' });
    await assert.rejects(mihomox.updateDashboard(), /request_failed/);

    console.log('LuCI dashboard update tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
