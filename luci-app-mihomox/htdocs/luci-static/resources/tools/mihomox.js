'use strict';
'require baseclass';
'require uci';
'require fs';
'require rpc';
'require request';

const callRCList = rpc.declare({
    object: 'rc',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

const callRCInit = rpc.declare({
    object: 'rc',
    method: 'init',
    params: ['name', 'action'],
    expect: { '': {} }
});

const callMihomoXVersion = rpc.declare({
    object: 'luci.mihomox',
    method: 'version',
    expect: { '': {} }
});

const callMihomoXProfile = rpc.declare({
    object: 'luci.mihomox',
    method: 'profile',
    params: ['defaults'],
    expect: { '': {} }
});

const callMihomoXUpdateSubscription = rpc.declare({
    object: 'luci.mihomox',
    method: 'update_subscription',
    params: ['section_id'],
    expect: { '': {} }
});

const callMihomoXAPI = rpc.declare({
    object: 'luci.mihomox',
    method: 'api',
    params: ['method', 'path', 'query', 'body'],
    expect: { '': {} }
});

const callMihomoXGetIdentifiers = rpc.declare({
    object: 'luci.mihomox',
    method: 'get_identifiers',
    expect: { '': {} }
});

const callMihomoXDebug = rpc.declare({
    object: 'luci.mihomox',
    method: 'debug',
    expect: { '': {} }
});

const callMihomoXCoreStatus = rpc.declare({
    object: 'luci.mihomox',
    method: 'core_status',
    expect: { '': {} }
});

const callMihomoXLog = rpc.declare({
    object: 'luci.mihomox',
    method: 'log',
    params: ['name'],
    expect: { log: '' }
});

const callMihomoXWriteFile = rpc.declare({
    object: 'luci.mihomox',
    method: 'write_file',
    params: ['path', 'data', 'append', 'mode', 'token', 'commit', 'abort'],
    expect: { '': {} }
});

const callMihomoXUpdateCore = rpc.declare({
    object: 'luci.mihomox',
    method: 'update_core',
    params: ['channel', 'architecture', 'mirror_prefix', 'download_url', 'download_sha256'],
    expect: { '': {} }
});

const homeDir = '/etc/mihomox';
const profilesDir = `${homeDir}/profiles`;
const subscriptionsDir = `${homeDir}/subscriptions`;
const mixinFilePath = `${homeDir}/mixin.yaml`;
const runDir = `${homeDir}/run`;
const runProfilePath = `${runDir}/config.yaml`;
const providersDir = `${runDir}/providers`;
const ruleProvidersDir = `${providersDir}/rule`;
const proxyProvidersDir = `${providersDir}/proxy`;
const logDir = `/var/log/mihomox`;
const appLogPath = `${logDir}/app.log`;
const coreLogPath = `${logDir}/core.log`;
const debugLogPath = `${logDir}/debug.log`;
const nftDir = `${homeDir}/nftables`;

return baseclass.extend({
    homeDir: homeDir,
    profilesDir: profilesDir,
    subscriptionsDir: subscriptionsDir,
    mixinFilePath: mixinFilePath,
    runDir: runDir,
    runProfilePath: runProfilePath,
    ruleProvidersDir: ruleProvidersDir,
    proxyProvidersDir: proxyProvidersDir,
    appLogPath: appLogPath,
    coreLogPath: coreLogPath,
    debugLogPath: debugLogPath,

    status: async function () {
        return (await callRCList('mihomox'))?.mihomox?.running;
    },

    reload: function () {
        return callRCInit('mihomox', 'reload');
    },

    restart: function () {
        return callRCInit('mihomox', 'restart');
    },

    writefile: function (path, data, mode) {
        data = (data != null) ? String(data) : '';
        mode = (mode != null) ? mode : 0o644;

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const chunkSize = 8 * 1024;
        const randomPart = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24).padEnd(16, '0');
        const token = `${Date.now().toString(36)}-${randomPart}`;

        const writeChunk = function (chunk, append, commit) {
            return callMihomoXWriteFile(path, chunk, append, mode, token, commit, false).then(function (result) {
                if (!result?.success)
                    return Promise.reject(new Error(result?.error || 'write_failed'));
                return result;
            });
        };

        const bytes = encoder.encode(data);

        let promise;
        if (bytes.length <= chunkSize) {
            promise = writeChunk(data, false, true);
        } else {
            promise = Promise.resolve();
            for(let offset = 0; offset < bytes.length; offset += chunkSize) {
                const chunkBytes = bytes.slice(offset, Math.min(offset + chunkSize, bytes.length));
                const finalChunk = offset + chunkSize >= bytes.length;
                const chunk = decoder.decode(chunkBytes, { stream: !finalChunk });
                const append = offset > 0;
                promise = promise.then(() => writeChunk(chunk, append, finalChunk));
            }
        }

        return promise.catch(function (error) {
            return callMihomoXWriteFile(path, '', false, mode, token, false, true)
                .catch(function () { })
                .then(function () { return Promise.reject(error); });
        });
    },

    version: function () {
        return callMihomoXVersion();
    },

    profile: function (defaults) {
        return callMihomoXProfile(defaults);
    },

    updateSubscription: function (section_id) {
        return callMihomoXUpdateSubscription(section_id);
    },

    updateDashboard: function () {
        return callMihomoXAPI('POST', '/upgrade/ui');
    },

    openDashboard: async function () {
        const profile = await callMihomoXProfile({
            'external-ui-name': null,
            'external-controller': null,
            'external-controller-tls': null,
            'secret': null
        });
        const uiName = profile['external-ui-name'];
        const apiListen = profile['external-controller'];
        const apiTLSListen = profile['external-controller-tls'];
        const apiSecret = profile['secret'] ?? '';
        if (!apiListen && !apiTLSListen) {
            return Promise.reject('API has not been configured');
        }

        let protocol;
        let port;
        if (apiTLSListen) {
            protocol = 'https';
            port = apiTLSListen.substring(apiTLSListen.lastIndexOf(':') + 1);
        } else {
            protocol = 'http';
            port = apiListen.substring(apiListen.lastIndexOf(':') + 1);
        }

        const params = {
            host: window.location.hostname,
            hostname: window.location.hostname,
            port: port,
            secret: apiSecret
        };
        const query = new URLSearchParams(params).toString();
        let url;
        if (uiName) {
            url = `${protocol}://${window.location.hostname}:${port}/ui/${uiName}/?${query}`;
        } else {
            url = `${protocol}://${window.location.hostname}:${port}/ui/?${query}`;
        }

        setTimeout(function () { window.open(url, '_blank', 'noopener,noreferrer') }, 0);

        return Promise.resolve();
    },

    getIdentifiers: function () {
        return callMihomoXGetIdentifiers();
    },

    listProfiles: function () {
        return L.resolveDefault(fs.list(this.profilesDir), []);
    },

    listRuleProviders: function () {
        return L.resolveDefault(fs.list(this.ruleProvidersDir), []);
    },

    listProxyProviders: function () {
        return L.resolveDefault(fs.list(this.proxyProvidersDir), []);
    },

    getAppLog: function () {
        return L.resolveDefault(callMihomoXLog('app'), '');
    },

    getCoreLog: function () {
        return L.resolveDefault(callMihomoXLog('core'), '');
    },

    clearAppLog: function () {
        return this.writefile(this.appLogPath, '');
    },

    clearCoreLog: function () {
        return this.writefile(this.coreLogPath, '');
    },

    debug: function () {
        return callMihomoXDebug();
    },

    coreStatus: function () {
        return L.resolveDefault(callMihomoXCoreStatus(), {});
    },

    updateCore: function (channel, architecture, mirrorPrefix, downloadUrl, downloadSha256) {
        return callMihomoXUpdateCore(channel, architecture, mirrorPrefix, downloadUrl, downloadSha256);
    },
})
