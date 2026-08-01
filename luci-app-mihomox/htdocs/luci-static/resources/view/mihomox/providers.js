'use strict';
'require view';
'require poll';
'require tools.mihomox as mihomox';

let currentData = {};
let expandedProvider = '';
let pageRoot = null;
let controls = {};
let refreshing = false;
let runLog = '';
let runLogOffset = 0;

function providerEntries(data) {
    return Object.entries(data?.providers || {})
        .filter((entry) => entry[1]?.discardPolicy && ['HTTP', 'File'].includes(entry[1].vehicleType))
        .sort((left, right) => left[0].localeCompare(right[0]));
}

function savedPolicy(data, name, provider) {
    const saved = data?.config?.providers?.[name] || {};
    const live = provider?.discardPolicy || {};
    return {
        enabled: saved.enabled ?? live.enabled ?? false,
        url: saved.url ?? live.url ?? '',
        timeout: Number(saved.timeout ?? live.timeout ?? 3000),
        retries: Number(saved.retries ?? live.retries ?? 2)
    };
}

function statusLabel(status) {
    const labels = {
        active: _('Normal'),
        queued: _('Waiting Test'),
        downloading: _('Downloading'),
        testing: _('Testing'),
        retained: _('Previous Version'),
        fallback: _('Keep All'),
        failed: _('Failed'),
        unsupported: _('Unsupported'),
        inactive: _('Restart Required'),
        disabled: _('Keep All')
    };
    if (status?.state === 'testing')
        return `${labels.testing} ${status.tested || 0} / ${status.total || 0}`;
    return labels[status?.state] || _('Not Tested');
}

function errorLabel(error) {
    const labels = {
        restart_required: _('Restart MihomoX once to activate provider filtering.'),
        unsupported_provider: _('This provider uses unsupported options.'),
        manager_missing: _('Provider filter manager is missing.'),
        start_failed: _('Failed to start provider filter manager.'),
        queue_failed: _('Failed to add provider to the update queue.'),
        native_update_failed: _('Mihomo Provider update failed.'),
        native_test_failed: _('Mihomo Provider test failed.'),
        controller_unavailable: _('Mihomo controller is unavailable.'),
        execution_disabled: _('Provider filtering is disabled.'),
        invalid_provider: _('Invalid provider.')
    };
    return labels[error] || error || _('Failed');
}

function numericValue(input, fallback, minimum, maximum) {
    const value = Number(input.value);
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function pageMessage(message, failed) {
    const node = pageRoot?.querySelector('.mihomox-provider-message');
    if (!node)
        return;
    node.textContent = message || '';
    node.classList.toggle('is-failed', !!failed);
}

function collectPolicy(name) {
    const row = controls[name];
    return {
        enabled: !!row.enabled.checked,
        url: row.url.value.trim(),
        timeout: numericValue(row.timeout, 3000, 500, 30000),
        retries: numericValue(row.retries, 2, 0, 5)
    };
}

function globalPolicy() {
    const concurrency = pageRoot?.querySelector('.mihomox-provider-concurrency');
    const unifiedDelay = pageRoot?.querySelector('.mihomox-provider-unified-delay');
    const maxDelay = pageRoot?.querySelector('.mihomox-provider-max-delay');
    return {
        concurrency: concurrency ? numericValue(concurrency, 5, 1, 20) : 5,
        unifiedDelay: unifiedDelay ? !!unifiedDelay.checked : true,
        maxDelay: maxDelay ? numericValue(maxDelay, 400, 0, 30000) : 400
    };
}

function globalExecutionEnabled() {
    return currentData?.config?.global?.enabled !== false;
}

function setGlobalExecution(enabled) {
    const global = globalPolicy();
    pageMessage(_('Saving'));
    return mihomox.setProviderDiscardGlobal(enabled, global).then(function (result) {
        if (!result?.success)
            return Promise.reject(new Error(errorLabel(result?.error)));
        currentData.config ||= {};
        currentData.config.global ||= {};
        Object.assign(currentData.config.global, global, { enabled: enabled });
        pageMessage(_('Saved'));
        renderContent();
    }).catch(function (error) {
        pageMessage(_('Failed') + ': ' + (error?.message || error), true);
        return Promise.reject(error);
    });
}

function saveProvider(name, global) {
    return mihomox.setProviderDiscard(name, collectPolicy(name), global || globalPolicy()).then(function (result) {
        if (!result?.success)
            return Promise.reject(new Error(result?.error || 'save_failed'));
        return result;
    });
}

function saveAll() {
    const names = Object.keys(controls).filter((name) => controls[name].supported);
    const global = globalPolicy();
    pageMessage(_('Saving'));
    return mihomox.setProviderDiscardGlobal(globalExecutionEnabled(), global).then(function (result) {
        if (!result?.success)
            return Promise.reject(new Error(result?.error || 'save_failed'));
        return names.reduce((promise, name) => promise.then(() => saveProvider(name, global)), Promise.resolve());
    }).then(function () {
        pageMessage(_('Saved'));
    }).catch(function (error) {
        pageMessage(_('Failed') + ': ' + (error?.message || error), true);
        return Promise.reject(error);
    });
}

function updateProvider(name) {
    pageMessage(_('Starting Update'));
    const save = controls[name]?.supported ? saveProvider(name) : Promise.resolve();
    return save.then(function () {
        return mihomox.updateProviderDiscard(name);
    }).then(function (result) {
        if (!result?.started && !result?.completed)
            return Promise.reject(new Error(errorLabel(result?.error)));
        pageMessage(result.completed ? _('Test Completed') : _('Update Started'));
        return refreshStatuses(true);
    }).catch(function (error) {
        pageMessage(_('Failed') + ': ' + (error?.message || error), true);
        return Promise.reject(error);
    });
}

function updateAll() {
    const names = Object.keys(controls).filter((name) =>
        !controls[name].supported || controls[name].enabled.checked);
    pageMessage(_('Starting Update'));
    return saveAll().then(function () {
        return Promise.all(names.map((name) => mihomox.updateProviderDiscard(name)));
    }).then(function (results) {
        const failed = results.find((result) => !result?.started && !result?.completed);
        if (failed)
            return Promise.reject(new Error(errorLabel(failed.error)));
        pageMessage(results.some((result) => result?.started) ? _('Update Started') : _('Test Completed'));
        return refreshStatuses(true);
    }).catch(function (error) {
        pageMessage(_('Failed') + ': ' + (error?.message || error), true);
        return Promise.reject(error);
    });
}

function settingRow(label, control) {
    return E('label', { 'class': 'mihomox-provider-setting' }, [
        E('span', {}, label),
        control
    ]);
}

function applyProviderStatus(row, provider) {
    const status = provider?.discardStatus || {};
    const measured = ['active', 'testing', 'fallback', 'disabled'].includes(status.state) && Number(status.total || 0) > 0;
    const active = measured ? Number(status.available || 0) : Number(provider?.proxyCount || 0);
    const total = Number(status.total || active);
    const tested = Math.min(Number(status.tested || 0), total);
    row.count.textContent = `${active} / ${total}`;
    row.discarded.textContent = String(status.discarded || 0);
    row.state.textContent = statusLabel(status);
    row.state.className = `mihomox-provider-state state-${status.state || 'idle'}`;
    row.progress.max = Math.max(total, 1);
    row.progress.value = tested;
    row.progress.hidden = status.state !== 'testing';
}

function refreshRenderedStatuses() {
    for (const [name, provider] of providerEntries(currentData)) {
        const row = controls[name];
        if (row)
            applyProviderStatus(row, provider);
    }
}

function updateRunLog(log, follow) {
    const node = pageRoot?.querySelector('.mihomox-provider-log');
    if (!node)
        return;
    const atBottom = follow || node.scrollHeight - node.scrollTop - node.clientHeight < 24;
    if (node.textContent !== log)
        node.textContent = log;
    if (atBottom)
        node.scrollTop = node.scrollHeight;
}

function providerRow(name, provider, concurrency) {
    const policy = savedPolicy(currentData, name, provider);
    const status = provider.discardStatus || {};
    const expanded = expandedProvider === name;
    const supported = provider.filterSupported === true && !['unsupported', 'inactive'].includes(status.state);
    const enabled = E('input', { type: 'checkbox', checked: policy.enabled ? '' : null, disabled: supported ? null : '' });
    enabled.checked = !!policy.enabled;
    const url = E('input', {
        'class': 'cbi-input-text',
        type: 'url',
        value: policy.url,
        placeholder: provider.testUrl || 'https://www.gstatic.com/generate_204'
    });
    const timeout = E('input', { 'class': 'cbi-input-text', type: 'number', min: '500', max: '30000', step: '500', value: String(policy.timeout) });
    const retries = E('input', { 'class': 'cbi-input-text', type: 'number', min: '0', max: '5', step: '1', value: String(policy.retries) });
    for (const input of [url, timeout, retries])
        input.disabled = !supported;
    const countNode = E('span', { 'class': 'mihomox-provider-count', 'data-label': _('Available / Total') });
    const discardedNode = E('span', { 'class': 'mihomox-provider-discarded', 'data-label': _('Discarded') });
    const stateNode = E('span', { 'class': 'mihomox-provider-state' });
    const progressNode = E('progress', { 'class': 'mihomox-provider-progress', max: '1', value: '0', hidden: '' });
    controls[name] = {
        enabled: enabled, url: url, timeout: timeout, retries: retries, supported: supported,
        count: countNode, discarded: discardedNode, state: stateNode, progress: progressNode
    };

    const details = E('div', { 'class': 'mihomox-provider-details' + (expanded ? '' : ' hidden') }, [
        settingRow(_('Test URL'), url),
        settingRow(_('Test Timeout'), E('span', { 'class': 'mihomox-provider-number' }, [ timeout, E('span', {}, 'ms') ])),
        settingRow(_('Failed Retries'), retries),
        E('div', { 'class': 'mihomox-provider-detail-actions' }, [
            E('button', { 'class': 'cbi-button cbi-button-neutral', type: 'button', disabled: supported ? null : '', click: () => saveProvider(name).then(() => pageMessage(_('Saved'))) }, _('Save')),
            E('button', { 'class': 'cbi-button cbi-button-action', type: 'button', click: () => updateProvider(name) }, _('Update and Test'))
        ])
    ]);
    const toggleDetails = E('button', {
        'class': 'cbi-button cbi-button-neutral mihomox-provider-expand',
        type: 'button',
        title: expanded ? _('Collapse') : _('Expand'),
        click: function () {
            expandedProvider = expandedProvider === name ? '' : name;
            renderContent();
        }
    }, expanded ? '-' : '+');
    const settings = details.querySelectorAll ? details : null;
    const enabledLabel = E('span', {}, policy.enabled ? _('Enabled') : _('Disabled'));
    enabled.addEventListener('change', function () {
        if (settings)
            settings.classList.toggle('disabled', !enabled.checked);
        enabledLabel.textContent = enabled.checked ? _('Enabled') : _('Disabled');
    });

    const item = E('div', { 'class': 'mihomox-provider-item' }, [
        E('div', { 'class': 'mihomox-provider-row' }, [
            toggleDetails,
            E('strong', { 'class': 'mihomox-provider-name' }, name),
            countNode,
            discardedNode,
            E('label', { 'class': 'mihomox-provider-toggle' }, [ enabled, enabledLabel ]),
            E('span', { 'class': 'mihomox-provider-status' }, [ stateNode, progressNode ])
        ]),
        details
    ]);
    applyProviderStatus(controls[name], provider);
    return item;
}

function renderContent() {
    if (!pageRoot)
        return;
    controls = {};
    const entries = providerEntries(currentData);
    const concurrency = Number(currentData?.config?.global?.concurrency || 5);
    const unifiedDelay = currentData?.config?.global?.unifiedDelay !== false;
    const maxDelay = Number(currentData?.config?.global?.maxDelay ?? 400);
    const executionEnabled = globalExecutionEnabled();
    const content = pageRoot.querySelector('.mihomox-provider-content');
    content.replaceChildren();

    if (!entries.length) {
        content.appendChild(E('div', { 'class': 'alert-message notice' }, _('No proxy providers found.')));
        return;
    }

    const executionToggle = E('input', { type: 'checkbox', checked: executionEnabled ? '' : null });
    executionToggle.checked = executionEnabled;
    executionToggle.addEventListener('change', () => setGlobalExecution(executionToggle.checked));
    const unifiedDelayToggle = E('input', { 'class': 'mihomox-provider-unified-delay', type: 'checkbox', checked: unifiedDelay ? '' : null });
    unifiedDelayToggle.checked = unifiedDelay;
    content.appendChild(E('div', { 'class': 'mihomox-provider-global' }, [
        E('label', { 'class': 'mihomox-provider-execution' }, [ executionToggle, E('span', {}, _('Enable Automatic Filtering')) ]),
        E('label', {}, [ unifiedDelayToggle, E('span', {}, _('Unified Delay')) ]),
        E('label', {}, [
            E('span', {}, _('Node Concurrency')),
            E('input', { 'class': 'cbi-input-text mihomox-provider-concurrency', type: 'number', min: '1', max: '20', step: '1', value: String(concurrency) })
        ]),
        E('label', {}, [
            E('span', {}, _('Maximum Delay')),
            E('span', { 'class': 'mihomox-provider-number' }, [
                E('input', { 'class': 'cbi-input-text mihomox-provider-max-delay', type: 'number', min: '0', max: '30000', step: '50', value: String(maxDelay) }),
                E('span', {}, 'ms')
            ])
        ]),
        E('span', { 'class': 'mihomox-provider-isolation' }, _('Detection Route') + ': ' + _('Direct Isolation')),
        E('span', { 'class': 'mihomox-provider-message' })
    ]));
    content.appendChild(E('div', { 'class': 'mihomox-provider-columns' }, [
        E('span'), E('span', {}, _('Provider')), E('span', {}, _('Available / Total')),
        E('span', {}, _('Discarded')), E('span', {}, _('Discard Mode')), E('span', {}, _('Status'))
    ]));
    const list = E('div', { 'class': 'mihomox-provider-list' });
    for (const [name, provider] of entries)
        list.appendChild(providerRow(name, provider, concurrency));
    content.appendChild(list);
    content.appendChild(E('section', { 'class': 'mihomox-provider-log-section' }, [
        E('h3', {}, _('Run Log')),
        E('pre', { 'class': 'mihomox-provider-log', role: 'log' }, runLog)
    ]));
    updateRunLog(runLog, true);
}

function refreshStatuses(force) {
    if (refreshing)
        return Promise.resolve();
    refreshing = true;
    return L.resolveDefault(mihomox.providerDiscardStatus(runLogOffset), {}).then(function (data) {
        for (const [name, status] of Object.entries(data?.statuses || {})) {
            if (currentData?.providers?.[name])
                currentData.providers[name].discardStatus = status || {};
        }
        if (data?.log_reset)
            runLog = data.log || '';
        else if (data?.log)
            runLog += data.log;
        runLog = runLog.slice(-65536);
        runLogOffset = Number(data?.log_offset ?? runLogOffset);
        if (force)
            renderContent();
        else {
            refreshRenderedStatuses();
            updateRunLog(runLog, false);
        }
    }).finally(function () {
        refreshing = false;
    });
}

return view.extend({
    load: function () {
        return mihomox.providerDiscard();
    },

    render: function (data) {
        currentData = data || {};
        runLog = currentData.log || '';
        runLogOffset = Number(currentData.log_offset || 0);
        pageRoot = E('div', { 'class': 'cbi-map mihomox-provider-page' }, [
            E('style', {}, `
                .mihomox-provider-header{display:flex;align-items:center;justify-content:space-between;gap:1em;margin-bottom:1em}
                .mihomox-provider-header h2{margin:0}.mihomox-provider-actions{display:flex;gap:.5em}
                .mihomox-provider-global{display:flex;align-items:center;justify-content:space-between;gap:1em;flex-wrap:wrap;padding:.75em 0;border-top:1px solid var(--border-color-medium,#dbe3ed);border-bottom:1px solid var(--border-color-medium,#dbe3ed)}
                .mihomox-provider-global label{display:flex;align-items:center;gap:.7em}.mihomox-provider-concurrency{width:5.5em}
                .mihomox-provider-message{color:#16a34a}.mihomox-provider-message.is-failed{color:#dc2626}
                .mihomox-provider-columns,.mihomox-provider-row{display:grid;grid-template-columns:2.5em minmax(10em,1fr) 9em 7em 8em 11em;align-items:center;gap:.75em}
                .mihomox-provider-columns{padding:.7em .5em;font-weight:600;color:#526176}
                .mihomox-provider-item{border-top:1px solid var(--border-color-medium,#dbe3ed)}.mihomox-provider-item:last-child{border-bottom:1px solid var(--border-color-medium,#dbe3ed)}
                .mihomox-provider-row{min-height:3.4em;padding:.35em .5em}.mihomox-provider-expand{width:2.2em;min-width:2.2em;padding:.3em}
                .mihomox-provider-name{overflow-wrap:anywhere}.mihomox-provider-toggle{display:flex;align-items:center;gap:.45em}
                .mihomox-provider-status{display:grid;gap:.35em}.mihomox-provider-state{font-weight:600}.mihomox-provider-progress{width:100%;height:.55em;accent-color:#2563eb}.state-active{color:#16a34a}.state-queued,.state-downloading,.state-testing{color:#2563eb}.state-fallback{color:#b45309}.state-retained,.state-failed,.state-unsupported,.state-inactive{color:#dc2626}
                .mihomox-provider-details{display:grid;grid-template-columns:repeat(3,minmax(10em,1fr));gap:.9em;padding:.8em 3.75em 1em;background:var(--background-color-low,#f7f9fc)}
                .mihomox-provider-details.hidden{display:none}.mihomox-provider-setting{display:grid;gap:.35em}.mihomox-provider-number{display:flex;align-items:center;gap:.4em}.mihomox-provider-number input{width:8em}
                .mihomox-provider-detail-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:.5em}
                .mihomox-provider-log-section{margin-top:1.25em;border-top:1px solid var(--border-color-medium,#dbe3ed);padding-top:.75em}.mihomox-provider-log-section h3{margin:.2em 0 .65em;font-size:1rem}
                .mihomox-provider-log{box-sizing:border-box;width:100%;height:12rem;margin:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:.75em;border:1px solid var(--border-color-medium,#dbe3ed);border-radius:4px;background:var(--background-color-low,#f7f9fc);font:12px/1.5 monospace}
                @media(max-width:800px){.mihomox-provider-columns{display:none}.mihomox-provider-row{grid-template-columns:2.5em minmax(8em,1fr) auto}.mihomox-provider-count,.mihomox-provider-discarded,.mihomox-provider-toggle{grid-column:2}.mihomox-provider-count:before,.mihomox-provider-discarded:before{content:attr(data-label) ': ';color:#526176}.mihomox-provider-status{grid-column:3;grid-row:1;min-width:8em}.mihomox-provider-details{grid-template-columns:1fr;padding:.8em 1em 1em 3.75em}.mihomox-provider-header{align-items:flex-start}.mihomox-provider-global{align-items:flex-start;flex-direction:column}}
            `),
            E('div', { 'class': 'mihomox-provider-header' }, [
                E('h2', {}, _('Node Management')),
                E('div', { 'class': 'mihomox-provider-actions' }, [
                    E('button', { 'class': 'cbi-button cbi-button-neutral', type: 'button', click: saveAll }, _('Save')),
                    E('button', { 'class': 'cbi-button cbi-button-action mihomox-provider-update-all', type: 'button', click: updateAll }, _('Update All'))
                ])
            ]),
            E('div', { 'class': 'mihomox-provider-content' })
        ]);
        renderContent();
        poll.add(() => refreshStatuses(false), 2);
        return pageRoot;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
