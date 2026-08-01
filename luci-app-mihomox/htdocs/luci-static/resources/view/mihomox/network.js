'use strict';
'require view';
'require ui';
'require tools.mihomox as mihomox';

const tests = [
    { id: 'core', label: _('Mihomo Core'), icon: 'core' },
    { id: 'system_dns', label: _('System DNS'), icon: 'dns' },
    { id: 'mihomo_dns', label: _('Mihomo DNS'), icon: 'shield' },
    { id: 'domestic', label: _('Domestic Connection'), icon: 'home', target: 'connect.rom.miui.com' },
    { id: 'international', label: _('International Proxy'), icon: 'globe', target: 'cp.cloudflare.com' },
    { id: 'ipv4_domestic', label: _('IPv4 Domestic'), icon: 'ipv4' },
    { id: 'ipv4_overseas', label: _('IPv4 Overseas'), icon: 'ipv4' },
    { id: 'ipv6_domestic', label: _('IPv6 Domestic'), icon: 'ipv6' },
    { id: 'ipv6_overseas', label: _('IPv6 Overseas'), icon: 'ipv6' },
    { id: 'nat', label: _('NAT Type'), icon: 'nat', timeout: 30000 }
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

function resultText(test, result) {
    const state = result?.success ? _('Normal') : _('Unavailable');
    if (test.id === 'core')
        return result?.version ? `${result.version} · ${state}` : state;
    if (test.id === 'system_dns' || test.id === 'mihomo_dns') {
        const status = result?.success ? `${result.latency ?? 0} ms` : state;
        return result?.server ? `${result.server} · ${status}` : status;
    }
    if (test.target) {
        const status = result?.success ? `${result.latency ?? 0} ms` : state;
        return `${test.target} · ${status}`;
    }
    if (/^ipv[46]_overseas$/.test(test.id) && result?.address) {
        const exit = result.country ? `${result.address} · ${result.country}` : result.address;
        return result.success ? exit : `${exit} · ${state}`;
    }
    if (!result?.success) {
        const errors = {
            no_ipv6: _('No IPv6 Connectivity'),
            timeout: _('UDP Timeout'),
            resolve_failed: _('DNS Resolution Failed'),
            missing_helper: _('NAT Helper Missing'),
            start_failed: _('Test Start Failed'),
            isolation_unavailable: _('Direct Test Isolation Unavailable'),
            mark_failed: _('Direct Test Mark Failed'),
            invalid_result: _('Invalid Test Result')
        };
        return errors[result?.error] || state;
    }
    if (test.id === 'nat')
        return natType(result.type);
    if (/^ipv[46]_/.test(test.id))
        return result.address || _('Normal');
    return `${result.latency ?? 0} ms`;
}

function updateRow(row, state, value) {
    const colors = {
        idle: '#64748b',
        loading: '#64748b',
        success: '#16a34a',
        failed: '#dc2626'
    };
    const icons = {
        idle: 'warning',
        loading: 'loading',
        success: 'check',
        failed: 'close'
    };
    const url = iconUrl(icons[state]);
    row.statusIcon.style.backgroundColor = colors[state];
    row.statusIcon.style.webkitMaskImage = `url("${url}")`;
    row.statusIcon.style.maskImage = `url("${url}")`;
    row.value.style.color = colors[state];
    row.value.textContent = value;
}

function requestTest(test) {
    let timeoutId;
    const timeout = new Promise(function (resolve) {
        timeoutId = setTimeout(function () {
            resolve({ success: false, error: 'timeout', timedOut: true });
        }, test.timeout || TEST_TIMEOUT_MS);
    });

    return Promise.race([
        L.resolveDefault(mihomox.networkTest(test.id), { success: false }),
        timeout
    ]).then(function (result) {
        clearTimeout(timeoutId);
        return result;
    });
}

function setBusy(button, rows, busy) {
    button.disabled = busy;
    for (const test of tests)
        rows[test.id].button.disabled = busy;
}

function runSingleTest(button, rows, test) {
    setBusy(button, rows, true);
    updateRow(rows[test.id], 'loading', _('Testing'));
    return requestTest(test).then(function (result) {
        updateRow(rows[test.id], result?.success ? 'success' : 'failed', resultText(test, result));
        setBusy(button, rows, false);
    }, function (error) {
        updateRow(rows[test.id], 'failed', _('Unavailable'));
        setBusy(button, rows, false);
        return Promise.reject(error);
    });
}

function runTests(button, rows) {
    setBusy(button, rows, true);
    for (const test of tests)
        updateRow(rows[test.id], 'idle', _('Not Tested'));

    let sequence = Promise.resolve();
    for (const test of tests) {
        sequence = sequence.then(function () {
            updateRow(rows[test.id], 'loading', _('Testing'));
            return requestTest(test).then(function (result) {
                updateRow(rows[test.id], result?.success ? 'success' : 'failed', resultText(test, result));
            });
        });
    }

    return sequence.then(function () {
        setBusy(button, rows, false);
    }, function (error) {
        setBusy(button, rows, false);
        return Promise.reject(error);
    });
}

return view.extend({
    render: function () {
        const rows = {};
        const button = E('button', {
            'class': 'cbi-button cbi-button-action important',
            'type': 'button'
        }, _('Start Test'));
        button.addEventListener('click', function () {
            return runTests(button, rows);
        });

        const rowNodes = tests.map(function (test) {
            const statusIcon = renderIcon('warning', 'mihomox-network-status-icon');
            const value = E('span', { 'class': 'mihomox-network-value' }, _('Not Tested'));
            const testButton = E('button', {
                'class': 'cbi-button cbi-button-neutral mihomox-network-test-button',
                'type': 'button',
                'data-test-id': test.id
            }, _('Test'));
            rows[test.id] = { statusIcon: statusIcon, value: value, button: testButton };
            testButton.addEventListener('click', function () {
                return runSingleTest(button, rows, test);
            });
            return E('div', { 'class': 'mihomox-network-row' }, [
                E('div', { 'class': 'mihomox-network-label' }, [
                    renderIcon(test.icon),
                    E('span', {}, test.label)
                ]),
                E('div', { 'class': 'mihomox-network-result' }, [ statusIcon, value, testButton ])
            ]);
        });

        return E('div', { 'class': 'cbi-map' }, [
            E('style', {}, `
                .mihomox-network-header{display:flex;align-items:center;justify-content:space-between;gap:1em;margin-bottom:1em}
                .mihomox-network-header h2{margin:0}
                .mihomox-network-list{display:grid;gap:.65em}
                .mihomox-network-row{display:grid;grid-template-columns:minmax(12em,1fr) minmax(12em,auto);align-items:center;gap:1em;padding:.8em 1em;border:1px solid var(--border-color-medium,#dbe3ed);border-radius:.6em;background:var(--background-color-high,#fff)}
                .mihomox-network-label,.mihomox-network-result{display:flex;align-items:center;gap:.65em;min-width:0}
                .mihomox-network-result{justify-content:flex-end}
                .mihomox-network-icon,.mihomox-network-status-icon{display:inline-block;flex:none;background-color:currentColor;-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:contain;mask-size:contain}
                .mihomox-network-icon{width:1.45em;height:1.45em;color:#526176}
                .mihomox-network-status-icon{width:1.25em;height:1.25em;background-color:#64748b}
                .mihomox-network-value{font-weight:600;color:#64748b;overflow-wrap:anywhere;text-align:right}
                .mihomox-network-test-button{flex:none;margin-left:.25em}
                @media(max-width:600px){.mihomox-network-row{grid-template-columns:1fr}.mihomox-network-result{justify-content:flex-start;padding-left:2.1em}.mihomox-network-header{align-items:flex-start}}
            `),
            E('div', { 'class': 'mihomox-network-header' }, [
                E('h2', {}, _('Network Test')),
                button
            ]),
            E('div', { 'class': 'mihomox-network-list' }, rowNodes)
        ]);
    },
    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
