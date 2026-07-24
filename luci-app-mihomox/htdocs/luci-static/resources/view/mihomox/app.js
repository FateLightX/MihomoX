'use strict';
'require form';
'require view';
'require uci';
'require poll';
'require tools.mihomox as mihomox';

function renderStatus(running) {
    return updateStatus(E('input', { id: 'core_status', style: 'border: unset; font-style: italic; font-weight: bold;', readonly: '' }), running);
}

function updateStatus(element, running) {
    if (element) {
        element.style.color = running ? 'green' : 'red';
        element.value = running ? _('Running') : _('Not Running');
    }
    return element;
}

function renderReadonlyText(id, value) {
    return updateReadonlyText(E('input', {
        id: id,
        style: 'border: unset; font-style: italic;',
        readonly: ''
    }), value);
}

function updateReadonlyText(element, value) {
    if (element)
        element.value = value || '-';
    return element;
}

var coreUpdateSessionActive = false;
var coreUpdateInFlight = false;

function renderCoreUpdateTime(updatedAt) {
    return updateCoreUpdateTime(E('input', {
        id: 'core_update_time',
        style: 'border: unset; font-style: italic;',
        readonly: ''
    }), updatedAt);
}

function updateCoreUpdateTime(element, updatedAt) {
    if (element)
        element.value = updatedAt || '-';
    return element;
}

function getOrCreateCoreUpdateSpan() {
    var span = document.getElementById('core_update_span');
    if (span)
        return span;

    var btn = null;
    var buttons = document.querySelectorAll('input[type="button"]');
    var title = _('Update Core');
    for (var i = 0; i < buttons.length; i++) {
        if ((buttons[i].value || '') === title) {
            btn = buttons[i];
            break;
        }
    }
    if (!btn || !btn.parentNode)
        return null;

    span = E('span', {
        id: 'core_update_span',
        style: 'margin-left: 8px; font-style: italic; font-weight: bold; display: none;'
    });
    btn.parentNode.appendChild(span);
    return span;
}

function updateCoreUpdateSpan(status) {
    if (!coreUpdateSessionActive)
        return;

    var span = getOrCreateCoreUpdateSpan();
    if (!span)
        return;

    status = status || {};
    if (status.updating) {
        span.style.color = '#b36b00';
        span.textContent = status.message || _('Updating');
        span.style.display = 'inline';
    } else if (status.state === 'failed') {
        span.style.color = 'red';
        span.textContent = status.message || _('Failed');
        span.style.display = 'inline';
    } else if (status.state === 'success') {
        span.style.color = 'green';
        span.textContent = status.message || _('Completed');
        span.style.display = 'inline';
    } else if (status.state === 'running') {
        span.style.color = '#b36b00';
        span.textContent = status.message || _('Updating');
        span.style.display = 'inline';
    } else {
        // Idle after a session still keeps last terminal text if any; hide only when empty.
        if (!span.textContent)
            span.style.display = 'none';
    }
}

function validateCron(value) {
    const fields = String(value || '').trim().split(/\s+/);
    if (fields.length !== 5 || fields.some(function (field) {
        return !/^[0-9*/,-]+$/.test(field);
    }))
        return _('Invalid cron expression');
    return true;
}

return view.extend({
    load: function () {
        // Keep initial view load light; version/status/coreStatus can be slow on OpenWrt.
        return Promise.all([
            uci.load('mihomox'),
            L.resolveDefault(mihomox.listProfiles(), [])
        ]);
    },
    render: function (data) {
        const subscriptions = uci.sections('mihomox', 'subscription');
        const profiles = data[1] || [];
        let appVersion = '';
        let coreVersion = '';
        let running = false;
        let coreState = {};

        let m, s, o;

        m = new form.Map('mihomox', _('MihomoX'), _('Transparent Proxy with Mihomo on OpenWrt.'));

        s = m.section(form.TableSection, 'status', _('Status'));
        s.anonymous = true;

        o = s.option(form.DummyValue, '_app_version', _('App Version'));
        o.cfgvalue = function () {
            return renderReadonlyText('app_version', appVersion || '-');
        };

        o = s.option(form.DummyValue, '_core_version', _('Core Version'));
        o.cfgvalue = function () {
            return renderReadonlyText('core_version', coreVersion || '-');
        };

        o = s.option(form.DummyValue, '_core_status', _('Core Status'));
        o.cfgvalue = function () {
            return renderStatus(running);
        };

        // Populate slow fields after first paint so "Loading view" stays short.
        L.resolveDefault(mihomox.version(), {}).then(function (version) {
            appVersion = version.app || '';
            coreVersion = version.core || '';
            updateReadonlyText(document.getElementById('app_version'), appVersion || '-');
            updateReadonlyText(document.getElementById('core_version'), coreVersion || '-');
        });
        L.resolveDefault(mihomox.status()).then(function (isRunning) {
            running = !!isRunning;
            updateStatus(document.getElementById('core_status'), running);
        });
        L.resolveDefault(mihomox.coreStatus(), {}).then(function (status) {
            coreState = status || {};
            updateReadonlyText(document.getElementById('installed_architecture'), coreState.installed_architecture || _('Unknown'));
            updateReadonlyText(document.getElementById('detected_architecture'), coreState.detected_architecture || _('Unknown'));
            updateCoreUpdateTime(document.getElementById('core_update_time'), coreState.updated_at);
        });

        poll.add(function () {
            return L.resolveDefault(mihomox.status()).then(function (isRunning) {
                running = !!isRunning;
                updateStatus(document.getElementById('core_status'), running);
            });
        });

        o = s.option(form.Button, 'reload');
        o.inputstyle = 'action';
        o.inputtitle = _('Reload Service');
        o.onclick = function () {
            return mihomox.reload();
        };

        o = s.option(form.Button, 'restart');
        o.inputstyle = 'negative';
        o.inputtitle = _('Restart Service');
        o.onclick = function () {
            return mihomox.restart();
        };

        o = s.option(form.Button, 'update_dashboard');
        o.inputstyle = 'positive';
        o.inputtitle = _('Update Dashboard');
        o.onclick = function () {
            return mihomox.updateDashboard();
        };

        o = s.option(form.Button, 'open_dashboard');
        o.inputtitle = _('Open Dashboard');
        o.onclick = function () {
            return mihomox.openDashboard();
        };

        s = m.section(form.NamedSection, 'core', 'core', _('Core Update'));

        const channelOption = s.option(form.ListValue, 'channel', _('Core Channel'));
        channelOption.rmempty = false;
        channelOption.default = 'Prerelease-Alpha';
        channelOption.value('release', _('Release'));
        channelOption.value('Prerelease-Alpha', _('Prerelease Alpha'));

        o = s.option(form.DummyValue, '_installed_architecture', _('Installed Core Architecture'));
        o.cfgvalue = function () {
            return renderReadonlyText('installed_architecture', coreState.installed_architecture || _('Unknown'));
        };

        o = s.option(form.DummyValue, '_detected_architecture', _('Detected Architecture'));
        o.cfgvalue = function () {
            return renderReadonlyText('detected_architecture', coreState.detected_architecture || _('Unknown'));
        };

        const architectureOption = s.option(form.ListValue, 'architecture', _('Core Architecture'));
        architectureOption.rmempty = false;
        architectureOption.value('auto', _('Auto'));
        architectureOption.value('amd64-v1', 'amd64-v1');
        architectureOption.value('amd64-v2', 'amd64-v2');
        architectureOption.value('amd64-v3', 'amd64-v3');
        architectureOption.value('386', '386');
        architectureOption.value('arm64', 'arm64');
        architectureOption.value('armv7', 'armv7');
        architectureOption.value('armv6', 'armv6');
        architectureOption.value('armv5', 'armv5');
        architectureOption.value('mips', 'mips');
        architectureOption.value('mipsle', 'mipsle');
        architectureOption.value('mips64', 'mips64');
        architectureOption.value('mips64le', 'mips64le');
        architectureOption.value('riscv64', 'riscv64');
        architectureOption.value('loong64', 'loong64');

        const mirrorOption = s.option(form.Value, 'mirror_prefix', _('GitHub Mirror Prefix'));
        mirrorOption.placeholder = 'https://example.com/';

        const downloadUrlOption = s.option(form.Value, 'download_url', _('Custom Core URL'));
        downloadUrlOption.datatype = 'url';
        downloadUrlOption.placeholder = 'https://example.com/mihomo.gz';

        const downloadSha256Option = s.option(form.Value, 'download_sha256', _('Custom Core SHA256'));
        downloadSha256Option.placeholder = _('Required when using Custom Core URL');
        downloadSha256Option.validate = function (_, value) {
            if (!value)
                return true;
            return /^[0-9a-fA-F]{64}$/.test(value) ? true : _('Invalid SHA256');
        };

        o = s.option(form.DummyValue, '_update_time', _('Update At'));
        o.cfgvalue = function () {
            return renderCoreUpdateTime(coreState.updated_at);
        };

        poll.add(function () {
            return mihomox.coreStatus().then(function (status) {
                updateCoreUpdateTime(document.getElementById('core_update_time'), status.updated_at);
                if (!coreUpdateSessionActive)
                    return;
                if (status.updating || status.state === 'running')
                    updateCoreUpdateSpan({ updating: true, message: status.message });
                else
                    updateCoreUpdateSpan(status);
            });
        });

        o = s.option(form.Button, '_update_core', _('Mihomo Core'));
        o.inputstyle = 'positive';
        o.inputtitle = _('Update Core');
        o.onclick = function (ev, sectionId) {
            if (coreUpdateInFlight) {
                coreUpdateSessionActive = true;
                updateCoreUpdateSpan({ updating: true, message: _('Update request in progress') });
                return Promise.resolve();
            }

            const channel = channelOption.formvalue(sectionId) || 'Prerelease-Alpha';
            const architecture = architectureOption.formvalue(sectionId) || 'auto';
            const mirrorPrefix = (mirrorOption.formvalue(sectionId) || '').trim();
            const downloadUrl = (downloadUrlOption.formvalue(sectionId) || '').trim();
            const downloadSha256 = (downloadSha256Option.formvalue(sectionId) || '').trim();
            if (downloadUrl && !downloadSha256) {
                coreUpdateSessionActive = true;
                const message = _('Custom Core SHA256 is required');
                updateCoreUpdateSpan({ state: 'failed', message: message });
                // Resolve so LuCI re-enables the button.
                return Promise.resolve();
            }

            coreUpdateSessionActive = true;
            coreUpdateInFlight = true;
            updateCoreUpdateSpan({ updating: true });

            return mihomox.updateCore(channel, architecture, mirrorPrefix, downloadUrl, downloadSha256).then(function (result) {
                if (!result || !result.success) {
                    updateCoreUpdateSpan({ state: 'failed', message: result?.error || _('Failed') });
                    return;
                }
                const channelElement = channelOption.getUIElement(sectionId);
                if (channelElement && result.channel)
                    channelElement.setValue(result.channel);
                if (result.running && result.started === false) {
                    updateCoreUpdateSpan({
                        updating: true,
                        message: result.message === 'update_already_running'
                            ? _('Update already running')
                            : _('Updating')
                    });
                } else {
                    updateCoreUpdateSpan({ updating: true });
                }
            }).catch(function (error) {
                const message = error && error.message ? error.message : _('Failed');
                updateCoreUpdateSpan({ state: 'failed', message: message });
            }).then(function () {
                coreUpdateInFlight = false;
            });
        };

        s = m.section(form.NamedSection, 'config', 'config', _('App Config'));

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;

        o = s.option(form.ListValue, 'profile', _('Choose Profile'));
        o.optional = true;

        for (const profile of profiles) {
            o.value('file:' + profile.name, _('File:') + profile.name);
        };

        for (const subscription of subscriptions) {
            o.value('subscription:' + subscription['.name'], _('Subscription:') + subscription.name);
        };

        o = s.option(form.Value, 'start_delay', _('Start Delay'));
        o.datatype = 'uinteger';
        o.placeholder = _('Start Immidiately');

        o = s.option(form.Flag, 'scheduled_restart', _('Scheduled Restart'));
        o.rmempty = false;

        o = s.option(form.Value, 'scheduled_restart_cron', _('Scheduled Restart Cron'));
        o.retain = true;
        o.rmempty = false;
        o.validate = function (_, value) {
            return validateCron(value);
        };
        o.depends('scheduled_restart', '1');

        o = s.option(form.Flag, 'test_profile', _('Test Profile'));
        o.rmempty = false;

        o = s.option(form.Flag, 'core_only', _('Core Only'));
        o.rmempty = false;

        s = m.section(form.NamedSection, 'procd', 'procd', _('procd Config'));

        s.tab('general', _('General Config'));

        o = s.taboption('general', form.Flag, 'fast_reload', _('Fast Reload'));
        o.rmempty = false;

        s.tab('rlimit', _('RLIMIT Config'));

        o = s.taboption('rlimit', form.Value, 'rlimit_nproc_soft', _('Number of Processes Soft Limit'));
        o.datatype = 'uinteger';

        o = s.taboption('rlimit', form.Value, 'rlimit_nproc_hard', _('Number of Processes Hard Limit'));
        o.datatype = 'uinteger';

        o = s.taboption('rlimit', form.Value, 'rlimit_address_space_soft', _('Address Space Size Soft Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_address_space_hard', _('Address Space Size Hard Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_data_soft', _('Heap Size Soft Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_data_hard', _('Heap Size Hard Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_stack_soft', _('Stack Size Soft Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_stack_hard', _('Stack Size Hard Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_nofile_soft', _('Number of Open Files Soft Limit'));
        o.datatype = 'uinteger';

        o = s.taboption('rlimit', form.Value, 'rlimit_nofile_hard', _('Number of Open Files Hard Limit'));
        o.datatype = 'uinteger';

        s.tab('environment_variable', _('Environment Variable Config'));

        o = s.taboption('environment_variable', form.Value, 'env_go_max_procs', 'GOMAXPROCS');
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('environment_variable', form.Value, 'env_go_mem_limit', 'GOMEMLIMIT');
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('environment_variable', form.DynamicList, 'env_safe_paths', _('Safe Paths'));
        o.load = function (section_id) {
            return this.super('load', section_id)?.split(':');
        };
        o.write = function (section_id, formvalue) {
            this.super('write', section_id, formvalue?.join(':'));
        };

        o = s.taboption('environment_variable', form.Flag, 'env_disable_loopback_detector', _('Disable Loopback Detector'));
        o.rmempty = false;

        o = s.taboption('environment_variable', form.Flag, 'env_disable_quic_go_gso', _('Disable GSO of quic-go'));
        o.rmempty = false;

        o = s.taboption('environment_variable', form.Flag, 'env_disable_quic_go_ecn', _('Disable ECN of quic-go'));
        o.rmempty = false;

        o = s.taboption('environment_variable', form.Flag, 'env_skip_system_ipv6_check', _('Skip System IPv6 Check'));
        o.rmempty = false;

        return m.render();
    }
});
