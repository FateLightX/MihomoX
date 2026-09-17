'use strict';
'require form';
'require view';
'require uci';
'require fs';
'require network';
'require poll';
'require tools.widgets as widgets';
'require tools.mihomox as mihomox';

function validateURL(value) {
    value = String(value || '').trim();
    return !value || /^https?:\/\/[^\s]+$/.test(value) ? true : _('Invalid URL');
}

function relativePathEscapes(value) {
    let depth = 0;
    for (const part of value.split('/')) {
        if (!part || part === '.')
            continue;
        if (part === '..') {
            if (depth === 0)
                return true;
            depth--;
        } else {
            depth++;
        }
    }
    return false;
}

const FAKE_IP_RULE_TYPES = new Set([
    'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-REGEX',
    'DOMAIN-WILDCARD', 'GEOSITE', 'RULE-SET', 'MATCH'
]);

function validateUIName(value) {
    value = String(value || '').trim();
    if (!value)
        return true;
    const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/');
    if (value.includes('\0') || normalized.startsWith('/') || relativePathEscapes(normalized))
        return _('UI Name must be a local relative path.');
    return true;
}

function validateUIPath(value) {
    value = String(value || '').trim();
    if (!value)
        return true;
    if (value.includes('\0'))
        return _('Relative UI Path must stay within Mihomo home.');
    if (value.startsWith('/'))
        return true;
    const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/');
    if (relativePathEscapes(normalized))
        return _('Relative UI Path must stay within Mihomo home.');
    return true;
}

function validateDomainPattern(value) {
    const values = Array.isArray(value) ? value : [value];
    for (const raw of values) {
        const item = String(raw || '');
        if (!item)
            continue;
        if (item.trim() !== item || item.endsWith('.'))
            return _('Invalid domain pattern.');

        const lower = item.toLowerCase();
        if (lower.startsWith('geosite:') || lower.startsWith('rule-set:')) {
            const payload = item.slice(item.indexOf(':') + 1);
            if (!payload || payload.split(',').some((part) => !part || part.trim() !== part))
                return _('Invalid domain pattern.');
            continue;
        }

        const labels = item.split('.');
        if (labels.length === 1 && labels[0] === '+')
            return _('Invalid domain pattern.');
        for (let index = 0; index < labels.length; index++) {
            const label = labels[index];
            if (index > 0 && label === '')
                return _('Invalid domain pattern.');
            if (label.includes('+') && !(index === 0 && label === '+'))
                return _('Invalid domain pattern.');
            if (label.includes('*') && label !== '*')
                return _('Invalid domain pattern.');
        }
    }
    return true;
}

function validatePolicyMatcher(section_id, value) {
    const matcher = String(value || '').trim();
    if (!matcher)
        return _('Invalid DNS policy matcher.');
    for (const part of matcher.split(',')) {
        const result = validateDomainPattern(part);
        if (result !== true)
            return _('Invalid DNS policy matcher.');
    }
    return true;
}

function validateFakeIPRule(value) {
    const values = Array.isArray(value) ? value : [value];
    for (const raw of values) {
        const item = String(raw || '').trim();
        if (!item)
            continue;
        const parts = item.split(',').map((part) => part.trim());
        const type = String(parts[0] || '').trim().toUpperCase();
        const regexRule = type === 'DOMAIN-REGEX';
        const actionIndex = type === 'MATCH' ? 1 : regexRule ? parts.length - 1 : 2;
        const action = String(parts[actionIndex] || '').toLowerCase();
        const validShape = type === 'MATCH'
            ? parts.length === 2
            : parts.length >= 3;
        const payload = regexRule ? parts.slice(1, -1).join(',').trim() : String(parts[1] || '');
        const domainTypes = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD'];
        const payloadValid = type === 'MATCH'
            ? true
            : regexRule
                ? !!payload
                : !domainTypes.includes(type) || validateDomainPattern(payload) === true;
        if (!FAKE_IP_RULE_TYPES.has(type) || !validShape || !payloadValid || !/^(fake-ip|real-ip)$/.test(action))
            return _('Rule mode requires complete domain rules ending with fake-ip or real-ip.');
    }
    return true;
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('mihomox'),
            network.getNetworks(),
        ]);
    },
    render: function (data) {
        const networks = data[1];

        let m, s, o, so;
        let apiTlsListenOption, apiTlsCertOption, apiTlsKeyOption, apiTlsEchKeyOption;
        let fakeIpFilterModeOption, ruleTypeOption;

        function validateTLSBundle(section_id) {
            const listen = String(apiTlsListenOption?.formvalue(section_id) || '').trim();
            const cert = String(apiTlsCertOption?.formvalue(section_id) || '').trim();
            const key = String(apiTlsKeyOption?.formvalue(section_id) || '').trim();
            const ech = String(apiTlsEchKeyOption?.formvalue(section_id) || '').trim();
            if ((listen || cert || key || ech) && !(listen && cert && key))
                return _('API TLS requires listen address, certificate and private key together.');
            return true;
        }

        m = new form.Map('mihomox');

        s = m.section(form.NamedSection, 'mixin', 'mixin', _('Mixin Option'));

        s.tab('general', _('General Config'));

        o = s.taboption('general', form.ListValue, 'log_level', _('Log Level'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('silent');
        o.value('error');
        o.value('warning');
        o.value('info');
        o.value('debug');

        o = s.taboption('general', form.ListValue, 'mode', _('Mode'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('global', _('Global Mode'));
        o.value('rule', _('Rule Mode'));
        o.value('direct', _('Direct Mode'));

        o = s.taboption('general', form.ListValue, 'match_process', _('Match Process'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('off');
        o.value('strict');
        o.value('always');

        o = s.taboption('general', form.ListValue, 'outbound_interface', _('Outbound Interface'));
        o.optional = true;
        o.placeholder = _('Unmodified');

        for (const network of networks) {
            if (network.getName() === 'loopback') {
                continue;
            }
            o.value(network.getName());
        }

        o = s.taboption('general', form.ListValue, 'ipv6', 'IPv6');
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.ListValue, 'unify_delay', _('Unify Delay'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.ListValue, 'tcp_concurrent', _('TCP Concurrent'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.ListValue, 'disable_tcp_keep_alive', _('Disable TCP Keep Alive'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.Value, 'tcp_keep_alive_idle', _('TCP Keep Alive Idle'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');
        o.description = _('Seconds.');

        o = s.taboption('general', form.Value, 'tcp_keep_alive_interval', _('TCP Keep Alive Interval'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');
        o.description = _('Seconds.');

        s.tab('external_control', _('External Control Config'));

        o = s.taboption('external_control', form.Value, 'ui_path', _('UI Path'));
        o.placeholder = _('Unmodified');
        o.datatype = 'directory';
        o.validate = function (_, value) {
            return validateUIPath(value);
        };

        o = s.taboption('external_control', form.Value, 'ui_name', _('UI Name'));
        o.placeholder = _('Unmodified');
        o.validate = function (_, value) {
            return validateUIName(value);
        };

        o = s.taboption('external_control', form.Value, 'ui_url', _('UI Url'));
        o.placeholder = _('Unmodified');
        o.validate = function (_, value) {
            return validateURL(value);
        };
        o.value('https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip', 'Zashboard (CDN Fonts)');
        o.value('https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip', 'Zashboard');
        o.value('https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip', 'MetaCubeXD');
        o.value('https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip', 'YACD');
        o.value('https://github.com/MetaCubeX/Razord-meta/archive/refs/heads/gh-pages.zip', 'Razord');

        o = s.taboption('external_control', form.Value, 'api_listen', _('API Listen'));
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('Unmodified');

        apiTlsListenOption = s.taboption('external_control', form.Value, 'api_tls_listen', _('API TLS Listen'));
        o = apiTlsListenOption;
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('Unmodified');
        o.validate = validateTLSBundle;

        apiTlsCertOption = s.taboption('external_control', form.Value, 'api_tls_cert', _('API TLS Cert'));
        o = apiTlsCertOption;
        o.placeholder = _('Unmodified');
        o.datatype = 'file';
        o.validate = validateTLSBundle;

        apiTlsKeyOption = s.taboption('external_control', form.Value, 'api_tls_key', _('API TLS Key'));
        o = apiTlsKeyOption;
        o.placeholder = _('Unmodified');
        o.datatype = 'file';
        o.validate = validateTLSBundle;

        apiTlsEchKeyOption = s.taboption('external_control', form.Value, 'api_tls_ech_key', _('API TLS ECH Key'));
        o = apiTlsEchKeyOption;
        o.placeholder = _('Unmodified');
        o.datatype = 'file';
        o.validate = validateTLSBundle;

        o = s.taboption('external_control', form.Value, 'api_secret', _('API Secret'));
        o.password = true;
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.ListValue, 'selection_cache', _('Save Proxy Selection'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        s.tab('inbound', _('Inbound Config'));

        o = s.taboption('inbound', form.ListValue, 'allow_lan', _('Allow Lan'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('inbound', form.Value, 'bind_address', _('Bind Address'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.description = _('Only applies when Allow Lan is enabled; use * for all addresses.');
        o.depends('allow_lan', '1');

        o = s.taboption('inbound', form.DynamicList, 'lan_allowed_ips', _('LAN Allowed IPs'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.datatype = 'cidr';
        o.description = _('Only applies when Allow Lan is enabled.');
        o.depends('allow_lan', '1');

        o = s.taboption('inbound', form.DynamicList, 'lan_disallowed_ips', _('LAN Disallowed IPs'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.datatype = 'cidr';
        o.description = _('Deny entries take precedence over allowed entries.');
        o.depends('allow_lan', '1');

        o = s.taboption('inbound', form.Value, 'http_port', _('HTTP Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'socks_port', _('SOCKS Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'mixed_port', _('Mixed Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'redir_port', _('Redirect Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'tproxy_port', _('TPROXY Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Flag, 'authentication', _('Overwrite Authentication'));
        o.rmempty = false;

        o = s.taboption('inbound', form.SectionValue, '_authentications', form.TableSection, 'authentication', _('Edit Authentications'));
        o.retain = true;
        o.depends('authentication', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'username', _('Username'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'password', _('Password'));
        so.password = true;
        so.rmempty = false;

        s.tab('tun', _('TUN Config'));

        o = s.taboption('tun', form.ListValue, 'tun_enabled', _('Enable'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('tun', form.Value, 'tun_device', _('Device Name'));
        o.placeholder = _('Unmodified');

        o = s.taboption('tun', form.ListValue, 'tun_stack', _('Stack'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('system', 'System');
        o.value('gvisor', 'gVisor');
        o.value('mixed', 'Mixed');
        // mipstack (Mihomo Alpha 2026-09-14, ab405bad): lower memory than gVisor
        // on memory-constrained routers, no with_gvisor build tag required.
        o.value('mips', 'Mips');

        o = s.taboption('tun', form.Value, 'tun_mtu', _('MTU'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        o = s.taboption('tun', form.ListValue, 'tun_gso', _('GSO'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('tun', form.Value, 'tun_gso_max_size', _('GSO Max Size'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        o = s.taboption('tun', form.Flag, 'tun_dns_hijack', _('Overwrite DNS Hijack'));
        o.rmempty = false;

        o = s.taboption('tun', form.DynamicList, 'tun_dns_hijacks', _('Edit DNS Hijacks'));
        o.retain = true;
        o.depends('tun_dns_hijack', '1');
        o.value('tcp://any:53');
        o.value('udp://any:53');

        s.tab('dns', _('DNS Config'));

        o = s.taboption('dns', form.ListValue, 'dns_enabled', _('Enable'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_cache_algorithm', _('DNS Cache Algorithm'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('lru', _('Least Recently Used (LRU)'));
        o.value('arc', _('Adaptive Replacement Cache (ARC)'));

        o = s.taboption('dns', form.Value, 'dns_cache_max_size', _('DNS Cache Max Size'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.datatype = 'uinteger';
        o.description = _('Maximum cached DNS entries; blank leaves Mihomo unchanged, default is 4096.');

        o = s.taboption('dns', form.Value, 'dns_ipv6_timeout', _('IPv6 Query Timeout (ms)'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.datatype = 'uinteger';
        o.description = _('Time to wait for an AAAA response during dual-stack DNS queries.');

        o = s.taboption('dns', form.ListValue, 'dns_fallback_lazy_query', _('Lazy Fallback Query'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));
        o.description = _('Check the primary result before sending a fallback query.');

        o = s.taboption('dns', form.Value, 'dns_listen', _('DNS Listen'));
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.ListValue, 'dns_ipv6', 'IPv6');
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_mode', _('DNS Mode'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('redir-host', 'Redir-Host');
        o.value('fake-ip', 'Fake-IP');

        o = s.taboption('dns', form.Value, 'fake_ip_range', _('Fake-IP Range'));
        o.datatype = 'cidr4';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.Value, 'fake_ip6_range', _('Fake-IP6 Range'));
        o.datatype = 'cidr6';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.Value, 'fake_ip_ttl', _('Fake-IP TTL'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.Flag, 'fake_ip_filter', _('Overwrite Fake-IP Filter'));
        o.rmempty = false;

        o = s.taboption('dns', form.DynamicList, 'fake_ip_filters', _('Edit Fake-IP Filters'));
        o.retain = true;
        o.depends('fake_ip_filter', '1');
        o.validate = function (section_id, value) {
            const mode = String(fakeIpFilterModeOption?.formvalue(section_id) || 'blacklist');
            return mode === 'rule' ? validateFakeIPRule(value) : validateDomainPattern(value);
        };

        fakeIpFilterModeOption = s.taboption('dns', form.ListValue, 'fake_ip_filter_mode', _('Fake-IP Filter Mode'));
        o = fakeIpFilterModeOption;
        o.default = 'blacklist';
        o.value('blacklist', _('Block Mode'));
        o.value('whitelist', _('Allow Mode'));
        o.value('rule', _('Rule Mode'));

        o = s.taboption('dns', form.ListValue, 'fake_ip_cache', _('Fake-IP Cache'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_respect_rules', _('Respect Rules'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));
        o.description = _('Requires at least one proxy-server-nameserver in the final profile.');

        o = s.taboption('dns', form.ListValue, 'dns_doh_prefer_http3', _('DoH Prefer HTTP/3'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_system_hosts', _('Use System Hosts'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_hosts', _('Use Hosts'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.Flag, 'hosts', _('Overwrite Hosts'));
        o.rmempty = false;

        o = s.taboption('dns', form.SectionValue, '_hosts', form.TableSection, 'hosts', _('Edit Hosts'));
        o.retain = true;
        o.depends('hosts', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'domain_name', _('Domain Name'));
        so.rmempty = false;

        so = o.subsection.option(form.DynamicList, 'ip', 'IP');

        o = s.taboption('dns', form.Flag, 'dns_nameserver', _('Overwrite Nameserver'));
        o.rmempty = false;

        o = s.taboption('dns', form.SectionValue, '_dns_nameservers', form.TableSection, 'nameserver', _('Edit Nameservers'));
        o.retain = true;
        o.depends('dns_nameserver', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.ListValue, 'type', _('Type'));
        so.value('default-nameserver');
        so.value('proxy-server-nameserver');
        so.value('direct-nameserver');
        so.value('nameserver');
        so.value('fallback');

        so = o.subsection.option(form.DynamicList, 'nameserver', _('Nameserver'));

        o = s.taboption('dns', form.Flag, 'dns_proxy_server_nameserver_policy', _('Overwrite Proxy Server Nameserver Policy'));
        o.rmempty = false;
        o.description = _('The final profile must also define proxy-server-nameserver.');

        o = s.taboption('dns', form.SectionValue, '_dns_proxy_server_nameserver_policies', form.TableSection, 'proxy_server_nameserver_policy', _('Edit Proxy Server Nameserver Policies'));
        o.retain = true;
        o.depends('dns_proxy_server_nameserver_policy', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'matcher', _('Matcher'));
        so.rmempty = false;
        so.validate = validatePolicyMatcher;

        so = o.subsection.option(form.DynamicList, 'nameserver', _('Nameserver'));

        o = s.taboption('dns', form.ListValue, 'dns_direct_nameserver_follow_policy', _('Direct Nameserver Follow Policy'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.Flag, 'dns_nameserver_policy', _('Overwrite Nameserver Policy'));
        o.rmempty = false;

        o = s.taboption('dns', form.SectionValue, '_dns_nameserver_policies', form.TableSection, 'nameserver_policy', _('Edit Nameserver Policies'));
        o.retain = true;
        o.depends('dns_nameserver_policy', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'matcher', _('Matcher'));
        so.rmempty = false;
        so.validate = validatePolicyMatcher;

        so = o.subsection.option(form.DynamicList, 'nameserver', _('Nameserver'));

        s.tab('sniffer', _('Sniffer Config'));

        o = s.taboption('sniffer', form.ListValue, 'sniffer', _('Enable'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('sniffer', form.ListValue, 'sniffer_sniff_dns_mapping', _('Sniff Redir-Host'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('sniffer', form.ListValue, 'sniffer_sniff_pure_ip', _('Sniff Pure IP'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('sniffer', form.DynamicList, 'sniffer_skip_src_addresses', _('Skip Source Addresses'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.datatype = 'cidr';

        o = s.taboption('sniffer', form.DynamicList, 'sniffer_skip_dst_addresses', _('Skip Destination Addresses'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.datatype = 'cidr';

        o = s.taboption('sniffer', form.Flag, 'sniffer_force_domain_name', _('Overwrite Force Sniff Domain Name'));
        o.rmempty = false;

        o = s.taboption('sniffer', form.DynamicList, 'sniffer_force_domain_names', _('Force Sniff Domain Name'));
        o.retain = true;
        o.depends('sniffer_force_domain_name', '1');
        o.validate = function (_, value) {
            return validateDomainPattern(value);
        };

        o = s.taboption('sniffer', form.Flag, 'sniffer_ignore_domain_name', _('Overwrite Ignore Sniff Domain Name'));
        o.rmempty = false;

        o = s.taboption('sniffer', form.DynamicList, 'sniffer_ignore_domain_names', _('Ignore Sniff Domain Name'));
        o.retain = true;
        o.depends('sniffer_ignore_domain_name', '1');
        o.validate = function (_, value) {
            return validateDomainPattern(value);
        };

        o = s.taboption('sniffer', form.Flag, 'sniffer_sniff', _('Overwrite Sniff By Protocol'));
        o.rmempty = false;

        o = s.taboption('sniffer', form.SectionValue, '_sniffer_sniffs', form.TableSection, 'sniff', _('Sniff By Protocol'));
        o.retain = true;
        o.depends('sniffer_sniff', '1');

        o.subsection.anonymous = true;
        o.subsection.addremove = false;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.ListValue, 'protocol', _('Protocol'));
        so.value('HTTP');
        so.value('TLS');
        so.value('QUIC');
        so.readonly = true;

        so = o.subsection.option(form.DynamicList, 'port', _('Port'));
        so.datatype = 'portrange';

        so = o.subsection.option(form.Flag, 'overwrite_destination', _('Overwrite Destination'));
        so.rmempty = false;

        s.tab('rule', _('Rule Config'));

        o = s.taboption('rule', form.Flag, 'rule_provider', _('Append Rule Provider'));
        o.rmempty = false;

        o = s.taboption('rule', form.SectionValue, '_rule_providers', form.GridSection, 'rule_provider', _('Edit Rule Providers'));
        o.retain = true;
        o.depends('rule_provider', '1');

        o.subsection.anonymous = true;
        o.subsection.addremove = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.default = 1;
        so.editable = true;
        so.modalonly = false;
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'name', _('Name'));
        so.rmempty = false;

        so = o.subsection.option(form.ListValue, 'type', _('Type'));
        so.default = 'http';
        so.rmempty = false;
        so.value('http');
        so.value('file');

        so = o.subsection.option(form.Value, 'url', _('Url'));
        so.modalonly = true;
        so.rmempty = false;
        so.validate = function (_, value) {
            return validateURL(value);
        };
        so.depends('type', 'http');

        so = o.subsection.option(form.Value, 'node', _('Node'));
        so.default = 'DIRECT';
        so.modalonly = true;
        so.depends('type', 'http');
        so.value('GLOBAL');
        so.value('DIRECT');

        so = o.subsection.option(form.Value, 'file_size_limit', _('File Size Limit'));
        so.datatype = 'uinteger';
        so.default = 0;
        so.description = _('Bytes; 0 means unlimited.');
        so.modalonly = true;
        so.depends('type', 'http');

        so = o.subsection.option(form.FileUpload, 'file_path', _('File Path'));
        so.modalonly = true;
        so.rmempty = false;
        so.root_directory = mihomox.ruleProvidersDir;
        so.depends('type', 'file');

        const fileFormatOption = o.subsection.option(form.ListValue, 'file_format', _('File Format'));
        fileFormatOption.default = 'yaml';
        fileFormatOption.value('mrs');
        fileFormatOption.value('yaml');
        fileFormatOption.value('text');

        const behaviorOption = o.subsection.option(form.ListValue, 'behavior', _('Behavior'));
        fileFormatOption.validate = function (section_id, value) {
            return value === 'mrs' && behaviorOption.formvalue(section_id) === 'classical'
                ? _('MRS format only supports Domain or IPCIDR behavior.')
                : true;
        };

        so = behaviorOption;
        so.default = 'classical';
        so.rmempty = false;
        so.value('classical');
        so.value('domain');
        so.value('ipcidr');

        so = o.subsection.option(form.Value, 'update_interval', _('Update Interval'));
        so.datatype = 'uinteger';
        so.description = _('Seconds; 0 disables periodic refresh.');
        so.default = 0;
        so.modalonly = true;
        so.depends('type', 'http');

        o = s.taboption('rule', form.Flag, 'rule', _('Append Rule'));
        o.rmempty = false;

        o = s.taboption('rule', form.SectionValue, '_rules', form.TableSection, 'rule', _('Edit Rules'));
        o.retain = true;
        o.depends('rule', '1');

        o.subsection.anonymous = true;
        o.subsection.addremove = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.default = 1;
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'type', _('Type'));
        ruleTypeOption = so;
        so.rmempty = false;
        so.value('RULE-SET', _('Rule Set'));
        so.value('DOMAIN', _('Domain Name'));
        so.value('DOMAIN-SUFFIX', _('Domain Name Suffix'));
        so.value('DOMAIN-WILDCARD', _('Domain Name Wildcard'));
        so.value('DOMAIN-KEYWORD', _('Domain Name Keyword'));
        so.value('DOMAIN-REGEX', _('Domain Name Regex'));
        so.value('IP-CIDR', _('Destination IP'));
        so.value('IP-CIDR6', _('Destination IPv6'));
        so.value('IP-ASN', _('Destination ASN'));
        so.value('SRC-IP-CIDR', _('Source IP'));
        so.value('SRC-PORT', _('Source Port'));
        so.value('DST-PORT', _('Destination Port'));
        so.value('NETWORK', _('Network Type'));
        so.value('PROCESS-NAME', _('Process Name'));
        so.value('PROCESS-PATH', _('Process Path'));
        so.value('IN-NAME', _('Inbound Name'));
        so.value('GEOSITE', _('Domain Name Geo'));
        so.value('GEOIP', _('Destination IP Geo'));
        so.value('REMATCH-NAME', _('Rematch Name'));
        so.value('SUB-RULE', _('Sub-Rule'));
        so.value('MATCH', _('Match All'));

        so = o.subsection.option(form.Value, 'matcher', _('Matcher'));
        so.rmempty = false;
        so.depends({ 'type': /MATCH/i, '!reverse': true });
        so.validate = function (section_id, value) {
            const type = String(ruleTypeOption?.formvalue(section_id) || '').toUpperCase();
            if (['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD', 'GEOSITE'].includes(type))
                return validatePolicyMatcher(section_id, value);
            return true;
        };

        so = o.subsection.option(form.Value, 'node', _('Node'));
        so.default = 'GLOBAL';
        so.value('GLOBAL');
        so.value('DIRECT');
        so.value('REJECT');
        so.value('REJECT-DROP');

        so = o.subsection.option(form.Flag, 'no_resolve', _('No Resolve'));
        so.rmempty = false;
        so.depends('type', /IP-CIDR6?/i);
        so.depends('type', /IP-ASN/i);
        so.depends('type', /GEOIP/i);
        so.depends('type', /RULE-SET/i);

        s.tab('geox', _('GeoX Config'));

        o = s.taboption('geox', form.ListValue, 'geoip_format', _('GeoIP Format'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('dat', 'DAT');
        o.value('mmdb', 'MMDB');

        o = s.taboption('geox', form.ListValue, 'geodata_loader', _('GeoData Loader'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('standard', _('Standard Loader'));
        o.value('memconservative', _('Memory Conservative Loader'));

        o = s.taboption('geox', form.Value, 'geosite_url', _('GeoSite Url'));
        o.placeholder = _('Unmodified');
        o.validate = function (_, value) {
            return validateURL(value);
        };

        o = s.taboption('geox', form.Value, 'geoip_mmdb_url', _('GeoIP(MMDB) Url'));
        o.placeholder = _('Unmodified');
        o.validate = function (_, value) {
            return validateURL(value);
        };

        o = s.taboption('geox', form.Value, 'geoip_dat_url', _('GeoIP(DAT) Url'));
        o.placeholder = _('Unmodified');
        o.validate = function (_, value) {
            return validateURL(value);
        };

        o = s.taboption('geox', form.Value, 'geoip_asn_url', _('GeoIP(ASN) Url'));
        o.placeholder = _('Unmodified');
        o.validate = function (_, value) {
            return validateURL(value);
        };

        o = s.taboption('geox', form.ListValue, 'geox_auto_update', _('GeoX Auto Update'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('geox', form.Value, 'geox_update_interval', _('GeoX Update Interval'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');
        o.description = _('Hours.');

        s.tab('mixin_file_content', _('Mixin File Content'));

        o = s.taboption('mixin_file_content', form.Flag, 'mixin_file_content', _('Enable'), _('Please go to the editor tab to edit the file for mixin'));
        o.rmempty = false;

        return Promise.resolve(m.render()).then(mihomox.inlineDescriptions);
    }
});
