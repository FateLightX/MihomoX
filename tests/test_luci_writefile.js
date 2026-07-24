'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(
    __dirname,
    '../luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js'
), 'utf8');

const writes = [];
const rpc = {
    declare: (definition) => {
        if (definition.object === 'luci.mihomox' && definition.method === 'write_file') {
            return (filePath, data, append, mode, token, commit) => {
                writes.push({ filePath, data, append, mode, token, commit });
                return Promise.resolve({ success: true });
            };
        }
        return () => Promise.resolve({});
    }
};
const baseclass = { extend: (definition) => definition };
const uci = {};
const luciFs = { list: () => Promise.resolve([]), read_direct: () => Promise.resolve('') };
const request = {};

const loadModule = new Function('baseclass', 'uci', 'fs', 'rpc', 'request', source);
const mihomox = loadModule(baseclass, uci, luciFs, rpc, request);
const content = 'a'.repeat(8191) + '中' + 'b'.repeat(9000) + '文';

Promise.resolve(mihomox.writefile('/etc/mihomox/profiles/test.yaml', content))
    .then(() => {
        assert.ok(writes.length > 1);
        assert.strictEqual(writes[0].append, false);
        assert.ok(writes.slice(1).every((write) => write.append === true));
        assert.ok(writes.every((write) => write.token === writes[0].token));
        assert.strictEqual(writes[writes.length - 1].commit, true);
        assert.ok(writes.slice(0, -1).every((write) => write.commit === false));
        assert.strictEqual(writes.map((write) => write.data).join(''), content);
        assert.ok(!writes.some((write) => write.data.includes('\uFFFD')));
        console.log('LuCI UTF-8 write tests passed');
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
