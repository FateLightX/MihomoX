'use strict';
'require view';
'require ui';
'require tools.mihomox as mihomox';

const tests = [
    { id: 'core', label: _('Mihomo Core'), icon: 'core' },
    { id: 'system_dns', label: _('System DNS'), icon: 'dns' },
    { id: 'mihomo_dns', label: _('Mihomo DNS'), icon: 'shield' },
    { id: 'domestic', label: _('Domestic Connection'), icon: 'home' },
    { id: 'international', label: _('International Proxy'), icon: 'globe' },
    { id: 'ipv4', label: 'IPv4', icon: 'ipv4' },
    { id: 'ipv6', label: 'IPv6', icon: 'ipv6' },
    { id: 'nat', label: _('NAT Type'), icon: 'nat' }
];

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
    if (!result?.success)
        return _('Unavailable');
    if (test.id === 'core')
        return _('Normal');
    if (test.id === 'nat')
        return natType(result.type);
    if (test.id === 'ipv4' || test.id === 'ipv6')
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

function runTests(button, rows) {
    button.disabled = true;
    for (const test of tests)
        updateRow(rows[test.id], 'idle', _('Not Tested'));

    let sequence = Promise.resolve();
    for (const test of tests) {
        sequence = sequence.then(function () {
            updateRow(rows[test.id], 'loading', _('Testing'));
            return L.resolveDefault(mihomox.networkTest(test.id), { success: false }).then(function (result) {
                updateRow(rows[test.id], result?.success ? 'success' : 'failed', resultText(test, result));
            });
        });
    }

    return sequence.then(function () {
        button.disabled = false;
    }, function (error) {
        button.disabled = false;
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
            rows[test.id] = { statusIcon: statusIcon, value: value };
            return E('div', { 'class': 'mihomox-network-row' }, [
                E('div', { 'class': 'mihomox-network-label' }, [
                    renderIcon(test.icon),
                    E('span', {}, test.label)
                ]),
                E('div', { 'class': 'mihomox-network-result' }, [ statusIcon, value ])
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
