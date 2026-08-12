'use strict';
'require view';
'require ui';
'require tools.mihomox as mihomox';

const tests = [
    { id: 'core', label: _('Mihomo Core'), icon: 'core', group: 'core' },
    { id: 'system_dns', label: _('System DNS'), icon: 'dns', group: 'core' },
    { id: 'mihomo_dns', label: _('Mihomo DNS'), icon: 'shield', group: 'core' },
    { id: 'domestic', label: _('Domestic Connection'), icon: 'home', group: 'domestic' },
    { id: 'domestic_baidu', label: _('Baidu'), icon: 'home', group: 'sites-domestic' },
    { id: 'domestic_netease', label: _('NetEase Cloud'), icon: 'home', group: 'sites-domestic' },
    { id: 'international', label: _('International Proxy'), icon: 'globe', group: 'international' },
    { id: 'international_google', label: _('Google'), icon: 'globe', group: 'sites-international' },
    { id: 'international_youtube', label: _('YouTube'), icon: 'globe', group: 'sites-international' },
    { id: 'ipv4_domestic', label: _('IPv4 Domestic'), icon: 'ipv4', group: 'ipv4' },
    { id: 'ipv4_overseas', label: _('IPv4 Overseas'), icon: 'ipv4', group: 'ipv4', timeout: 15000 },
    { id: 'ipv6_domestic', label: _('IPv6 Domestic'), icon: 'ipv6', group: 'ipv6' },
    { id: 'nat', label: _('NAT Type'), icon: 'nat', group: 'nat', timeout: 30000 }
];
const TEST_TIMEOUT_MS = 8000;

function iconUrl(name) {
    return L.resource(`icons/mihomox/network/${name}.svg`);
}

function renderIcon(name, className) {
    const url = iconUrl(name);
    return E('span', {
        'class': className || 'mihomox-network-icon',
        'aria-hidden': 'true',
        style: `-webkit-mask-image:url("${url}");mask-image:url("${url}");`
    });
}

function natType(value) {
    const types = {
        'Full Cone': _('Full Cone'),
        'Restricted Cone': _('Restricted Cone'),
        'Port Restricted Cone': _('Port Restricted Cone'),
        'Symmetric NAT': _('Symmetric NAT'),
        'Cone/Restricted': _('Cone/Restricted'),
        'Open Internet': _('Open Internet'),
        'Unknown': _('Unknown')
    };
    return types[value] || _('Unknown');
}

function errorText(result) {
	if (result?.error === 'timeout' && result?.udp)
		return _('UDP Timeout');
	const errors = {
        no_ipv6: _('No IPv6 Connectivity'),
        timeout: _('Test Timeout'),
        resolve_failed: _('DNS Resolution Failed'),
        missing_helper: _('NAT Helper Missing'),
        start_failed: _('Test Start Failed'),
        isolation_unavailable: _('Direct Test Isolation Unavailable'),
        mark_failed: _('Direct Test Mark Failed'),
        invalid_result: _('Invalid Test Result'),
        not_configured: _('Not Configured'),
        request_failed: _('Request Failed')
    };
    return errors[result?.error] || _('Unavailable');
}

function isAddressTest(test) {
    return test.id === 'ipv4_domestic' || test.id === 'ipv4_overseas' || test.id === 'ipv6_domestic';
}

function resultText(test, result) {
    if (!result?.success)
        return errorText(result);
    if (test.id === 'core')
        return result.version ? `${result.version} · ${_('Normal')}` : _('Normal');
    if (test.id === 'nat')
        return natType(result.type);
    if (test.id === 'system_dns' || test.id === 'mihomo_dns') {
        const latency = `${result.latency ?? 0} ms`;
        return result.server ? `${result.server} · ${latency}` : latency;
    }
    if (isAddressTest(test)) {
        if (test.id === 'ipv4_overseas' && result.country)
            return `${result.address || _('Normal')} · ${result.country}`;
        return result.address || _('Normal');
    }
    return `${result.latency ?? 0} ms`;
}

function stateOf(result) {
    return result?.success ? 'success' : 'failed';
}

function updateItem(item, state, value) {
    item.card.dataset.state = state;
    item.status.className = `mihomox-network-status mihomox-network-status-${state}`;
    item.status.textContent = state === 'loading' ? '…' : state === 'success' ? '✓' : state === 'failed' ? '×' : '•';
    item.status.setAttribute('aria-label', state === 'loading' ? _('Testing') : value);
    item.value.textContent = value;
}

function requestTest(test) {
    let timeoutId;
    const timeout = new Promise(function (resolve) {
        timeoutId = setTimeout(function () {
            resolve({ success: false, error: 'timeout', timedOut: true });
        }, test.timeout || TEST_TIMEOUT_MS);
    });

    return Promise.race([
        L.resolveDefault(mihomox.networkTest(test.id), { success: false, error: 'start_failed' }),
        timeout
    ]).then(function (result) {
        clearTimeout(timeoutId);
        return result || { success: false, error: 'invalid_result' };
    }, function () {
        clearTimeout(timeoutId);
        return { success: false, error: 'start_failed' };
    });
}

function setBusy(button, items, busy) {
    button.disabled = busy;
    for (const item of Object.values(items))
        item.button.disabled = busy;
}

function updateProgress(summary, completed, active) {
    const total = tests.length;
    summary.progress.textContent = `${completed} / ${total}`;
    summary.bar.style.width = `${Math.round((completed / total) * 100)}%`;
    summary.active.textContent = active ? `${_('Testing')} · ${active}` : '';
    if (active) {
        summary.title.textContent = _('Testing');
        summary.mark.textContent = '…';
        summary.mark.className = 'mihomox-network-summary-mark mihomox-network-summary-mark-loading';
    } else if (!completed) {
        summary.title.textContent = _('Not Tested');
        summary.mark.textContent = '•';
        summary.mark.className = 'mihomox-network-summary-mark mihomox-network-summary-mark-idle';
    } else {
        summary.title.textContent = summary.failed
            ? _('Some Tests Unavailable')
            : completed === total ? _('All Tests Normal') : _('Normal');
        summary.mark.textContent = summary.failed ? '!' : '✓';
        summary.mark.className = `mihomox-network-summary-mark mihomox-network-summary-mark-${summary.failed ? 'failed' : 'success'}`;
    }
}

function recordResult(summary, test, result) {
    summary.results[test.id] = result;
    summary.completed = Object.keys(summary.results).length;
    summary.failed = Object.values(summary.results).filter((entry) => !entry?.success).length;
    updateProgress(summary, summary.completed, '');
}

function runSingleTest(button, items, summary, test) {
    setBusy(button, items, true);
    updateItem(items[test.id], 'loading', _('Testing'));
    updateProgress(summary, summary.completed, test.label);
    return requestTest(test).then(function (result) {
        updateItem(items[test.id], stateOf(result), resultText(test, result));
        recordResult(summary, test, result);
    }).finally(function () {
        setBusy(button, items, false);
    });
}

function runTests(button, items, summary) {
    setBusy(button, items, true);
    summary.completed = 0;
    summary.failed = 0;
    summary.results = {};
    updateProgress(summary, 0, '');
    for (const test of tests)
        updateItem(items[test.id], 'idle', _('Not Tested'));

    let sequence = Promise.resolve();
    for (const test of tests) {
        sequence = sequence.then(function () {
            updateItem(items[test.id], 'loading', _('Testing'));
            updateProgress(summary, summary.completed, test.label);
            return requestTest(test).then(function (result) {
                updateItem(items[test.id], stateOf(result), resultText(test, result));
                recordResult(summary, test, result);
            });
        });
    }

    return sequence.finally(function () {
        summary.active.textContent = '';
        setBusy(button, items, false);
    });
}

function makeMetric(test, items, button, summary) {
    const status = E('span', { 'class': 'mihomox-network-status mihomox-network-status-idle', 'aria-hidden': 'true' }, '•');
    const value = E('span', { 'class': 'mihomox-network-value' }, _('Not Tested'));
    const rerun = E('button', {
        'class': 'mihomox-network-rerun cbi-button cbi-button-neutral',
        'type': 'button',
        'data-test-id': test.id,
        'aria-label': _('Test')
    }, '↻');
    const card = E('div', { 'class': 'mihomox-network-metric', 'data-test-id': test.id }, [
        E('div', { 'class': 'mihomox-network-metric-head' }, [
            renderIcon(test.icon),
            E('span', { 'class': 'mihomox-network-metric-label' }, test.label)
        ]),
        E('div', { 'class': 'mihomox-network-metric-result' }, [status, value, rerun])
    ]);
    const item = { card, status, value, button: rerun };
    items[test.id] = item;
    rerun.addEventListener('click', function () {
        return runSingleTest(button, items, summary, test);
    });
    return item;
}

function makeSection(title, className, children, action) {
    const headingChildren = [E('h3', {}, title)];
    if (action)
        headingChildren.push(action);
    const heading = E('div', { 'class': 'mihomox-network-section-head' }, headingChildren);
    return E('section', { 'class': `mihomox-network-section ${className || ''}` }, [heading, children]);
}

return view.extend({
    render: function () {
        const items = {};
        const summary = {
            completed: 0,
            failed: 0,
            results: {},
            progress: null,
            bar: null,
            active: null,
            title: null,
            mark: null
        };
        const button = E('button', {
            'class': 'cbi-button cbi-button-action important mihomox-network-primary',
            'type': 'button'
        }, _('Start Test'));
        button.addEventListener('click', function () {
            return runTests(button, items, summary);
        });

        summary.progress = E('span', { 'class': 'mihomox-network-progress' }, `0 / ${tests.length}`);
        summary.bar = E('span', { 'class': 'mihomox-network-progress-bar' });
        summary.active = E('span', { 'class': 'mihomox-network-active' });

        const metric = function (id) {
            return makeMetric(tests.find((test) => test.id === id), items, button, summary).card;
        };
        const core = E('div', { 'class': 'mihomox-network-grid mihomox-network-grid-core' }, [
            metric('core'), metric('system_dns'), metric('mihomo_dns')
        ]);
        const networkStatus = E('div', { 'class': 'mihomox-network-grid' }, [metric('domestic'), metric('international')]);
        const networkDetection = E('div', { 'class': 'mihomox-network-grid mihomox-network-grid-detection' }, [
            metric('ipv4_domestic'), metric('ipv4_overseas'), metric('ipv6_domestic')
        ]);
        const nat = E('div', { 'class': 'mihomox-network-grid' }, [metric('nat')]);
        const domesticSites = E('div', { 'class': 'mihomox-network-site-grid' }, [metric('domestic_baidu'), metric('domestic_netease')]);
        const internationalSites = E('div', { 'class': 'mihomox-network-site-grid' }, [metric('international_google'), metric('international_youtube')]);
        const details = E('details', { 'class': 'mihomox-network-details' }, [
            E('summary', {}, _('Detailed Site Tests')),
            E('div', { 'class': 'mihomox-network-details-body' }, [
                E('h4', {}, _('Domestic Sites')), domesticSites,
                E('h4', {}, _('International Sites')), internationalSites
            ])
        ]);

        return E('div', { 'class': 'cbi-map mihomox-network-page' }, [
            E('style', {}, `
                .mihomox-network-page{max-width:72rem;color:inherit;--mihomox-line:color-mix(in srgb,currentColor 16%,transparent);--mihomox-track:color-mix(in srgb,currentColor 12%,transparent)}
                .mihomox-network-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin:0 0 1.25rem}
                .mihomox-network-header h2{margin:0 0 .25rem;font-size:1.65rem;letter-spacing:-.02em}
                .mihomox-network-subtitle{color:inherit;opacity:.68;font-size:.9rem}
                .mihomox-network-primary{min-height:2.6rem;border-radius:.7rem}
                .mihomox-network-summary,.mihomox-network-section{border:1px solid rgba(127,127,127,.24);border-color:var(--mihomox-line);border-radius:1rem;background:transparent;box-shadow:none;color:inherit}
                .mihomox-network-summary{display:grid;grid-template-columns:minmax(0,1fr) minmax(12rem,18rem);gap:1.5rem;align-items:center;padding:1.25rem 1.4rem;margin-bottom:1rem}
                .mihomox-network-summary-main{display:flex;align-items:center;gap:.85rem;min-width:0}
                .mihomox-network-summary-mark{display:grid;place-items:center;width:2.8rem;height:2.8rem;flex:none;border-radius:.85rem;color:#fff;font-weight:800;font-size:1.25rem;background:var(--text-color-medium,#64748b)}
                .mihomox-network-summary-mark-success{background:var(--success-color,#2f7a57)}
                .mihomox-network-summary-mark-failed{background:var(--error-color,#dc2626)}
                .mihomox-network-summary-mark-loading{background:var(--primary-color,#2563eb)}
                .mihomox-network-summary-title{color:inherit;font-size:1.05rem;font-weight:700}
                .mihomox-network-active{display:block;min-height:1.25em;color:inherit;opacity:.68;font-size:.8rem}
                .mihomox-network-progress-label{display:flex;justify-content:space-between;gap:.75rem;margin-bottom:.4rem;color:inherit;opacity:.68;font-size:.78rem}
                .mihomox-network-progress-track{height:.35rem;overflow:hidden;border-radius:99px;background:var(--mihomox-track)}
                .mihomox-network-progress-bar{display:block;width:0;height:100%;border-radius:inherit;background:var(--success-color,#2f7a57);transition:width .2s ease}
                .mihomox-network-section{padding:1rem;margin-bottom:1rem}
                .mihomox-network-section-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem}
                .mihomox-network-section-head h3{margin:0;color:inherit;font-size:1rem}
                .mihomox-network-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
                .mihomox-network-grid-core{grid-template-columns:repeat(3,minmax(0,1fr))}
                .mihomox-network-grid-detection{grid-template-columns:repeat(3,minmax(0,1fr))}
                .mihomox-network-metric{min-width:0;padding:.9rem 1rem;border:1px solid rgba(127,127,127,.24);border-color:var(--mihomox-line);border-radius:.8rem;background:transparent;color:inherit}
                .mihomox-network-metric-head,.mihomox-network-metric-result{display:flex;align-items:center;gap:.55rem;min-width:0}
                .mihomox-network-metric-result{margin-top:.65rem}
                .mihomox-network-metric-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650;color:inherit}
                .mihomox-network-icon{display:inline-block;width:1.25rem;height:1.25rem;flex:none;background:currentColor;opacity:.68;-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:contain;mask-size:contain}
                .mihomox-network-status{display:grid;place-items:center;width:1.35rem;height:1.35rem;flex:none;border-radius:50%;color:#fff;font-size:.8rem;font-weight:800;background:var(--text-color-medium,#64748b)}
                .mihomox-network-status-success{background:var(--success-color,#16a34a)}
                .mihomox-network-status-failed{background:var(--error-color,#dc2626)}
                .mihomox-network-status-loading{background:var(--primary-color,#2563eb)}
                .mihomox-network-value{min-width:0;flex:1;overflow-wrap:anywhere;color:inherit;opacity:.74;font-size:.9rem;font-weight:650}
                .mihomox-network-rerun{flex:none;margin-left:auto;padding:.15rem .45rem;line-height:1.2;opacity:.7}
                .mihomox-network-details{margin-top:.25rem;border:1px solid rgba(127,127,127,.24);border-color:var(--mihomox-line);border-radius:1rem;background:transparent;box-shadow:none;color:inherit}
                .mihomox-network-details summary{padding:1rem 1.1rem;cursor:pointer;color:inherit;font-weight:700}
                .mihomox-network-details-body{padding:0 1.1rem 1.1rem}
                .mihomox-network-details-body h4{margin:1rem 0 .6rem;color:inherit;opacity:.68;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}
                .mihomox-network-site-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
                @media(max-width:700px){.mihomox-network-header{flex-direction:column}.mihomox-network-primary{width:100%}.mihomox-network-summary{grid-template-columns:1fr}.mihomox-network-grid-core,.mihomox-network-grid,.mihomox-network-site-grid{grid-template-columns:1fr}}
            `),
            E('div', { 'class': 'mihomox-network-header' }, [
                E('div', {}, [E('h2', {}, _('Network Test')), E('div', { 'class': 'mihomox-network-subtitle' }, _('Check the current network path'))]),
                button
            ]),
            E('section', { 'class': 'mihomox-network-summary' }, [
                E('div', { 'class': 'mihomox-network-summary-main' }, [
                    (summary.mark = E('span', { 'class': 'mihomox-network-summary-mark', 'aria-hidden': 'true' }, '•')),
                    E('div', {}, [(summary.title = E('div', { 'class': 'mihomox-network-summary-title' }, _('Not Tested'))), summary.active])
                ]),
                E('div', {}, [
                    E('div', { 'class': 'mihomox-network-progress-label' }, [E('span', {}, _('Progress')), summary.progress]),
                    E('div', { 'class': 'mihomox-network-progress-track' }, summary.bar)
                ])
            ]),
            makeSection(_('Core and DNS'), 'mihomox-network-section-core', core),
            makeSection(_('Network Status'), 'mihomox-network-section-status', networkStatus),
            makeSection(_('Network Detection'), 'mihomox-network-section-detection', networkDetection),
            makeSection(_('NAT Type'), 'mihomox-network-section-nat', nat),
            details
        ]);
    },
    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
