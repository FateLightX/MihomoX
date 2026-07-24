'use strict';
'require form';
'require view';
'require uci';
'require fs';
'require poll';
'require tools.mihomox as mihomox';

function validateCron(value) {
    const fields = String(value || '').trim().split(/\s+/);
    if (fields.length !== 5 || fields.some(function (field) {
        return !/^[0-9*/,-]+$/.test(field);
    }))
        return _('Invalid cron expression');
    return true;
}

function getOptionUI(option, sectionId) {
    if (!option || typeof option.getUIElement !== 'function')
        return null;
    try {
        return option.getUIElement(sectionId) || null;
    } catch (e) {
        return null;
    }
}

function getTextareaNode(uiElement) {
    if (!uiElement)
        return null;
    if (uiElement.node) {
        if (uiElement.node.tagName === 'TEXTAREA')
            return uiElement.node;
        if (uiElement.node.firstChild && uiElement.node.firstChild.tagName === 'TEXTAREA')
            return uiElement.node.firstChild;
        return uiElement.node;
    }
    if (uiElement.tagName === 'TEXTAREA')
        return uiElement;
    return null;
}

function isVisibleNode(node) {
    return !!(node && node.offsetParent !== null && !document.hidden);
}

function setLogValue(option, sectionId, value) {
    const uiElement = getOptionUI(option, sectionId);
    if (!uiElement || typeof uiElement.setValue !== 'function')
        return false;
    const node = getTextareaNode(uiElement);
    if (node && !isVisibleNode(node) && !(uiElement.node && isVisibleNode(uiElement.node)))
        return false;
    try {
        uiElement.setValue(value);
        return true;
    } catch (e) {
        return false;
    }
}

function scrollLogToBottom(map, optionName, sectionId) {
    const option = map.lookupOption(optionName, sectionId);
    if (!option || !option[0])
        return;
    const uiElement = getOptionUI(option[0], sectionId);
    const node = getTextareaNode(uiElement);
    if (!node)
        return;
    node.scrollTop = node.scrollHeight;
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('mihomox'),
            L.resolveDefault(mihomox.getAppLog(), ''),
            L.resolveDefault(mihomox.getCoreLog(), '')
        ]);
    },
    render: function (data) {
        const appLog = data[1];
        const coreLog = data[2];

        let m, s, o;
        let appLogOption;
        let coreLogOption;

        m = new form.Map('mihomox');

        s = m.section(form.NamedSection, 'log', 'log', _('Log'));

        s.tab('log_config', _('Log Config'));

        o = s.taboption('log_config', form.Flag, 'clear_at_stop', _('Clear At Stop'));
        o.rmempty = false;

        o = s.taboption('log_config', form.Flag, 'scheduled_clear', _('Scheduled Clear'));
        o.rmempty = false;

        o = s.taboption('log_config', form.Value, 'scheduled_clear_cron', _('Scheduled Clear Cron'));
        o.retain = true;
        o.rmempty = false;
        o.validate = function (_, value) {
            return validateCron(value);
        };
        o.depends('scheduled_clear', '1');

        o = s.taboption('log_config', form.Value, 'scheduled_clear_size_limit', _('Scheduled Clear Size Limit'));
        o.retain = true;
        o.rmempty = false;
        o.datatype = 'uinteger';
        o.depends('scheduled_clear', '1');

        o = s.taboption('log_config', form.ListValue, 'scheduled_clear_size_limit_unit', _('Scheduled Clear Size Limit Unit'));
        o.retain = true;
        o.rmempty = false;
        o.depends('scheduled_clear', '1');
        o.value('KB', 'KB');
        o.value('MB', 'MB');
        o.value('GB', 'GB');

        s.tab('app_log', _('App Log'));

        o = s.taboption('app_log', form.Button, 'clear_app_log');
        o.inputstyle = 'negative';
        o.inputtitle = _('Clear Log');
        o.onclick = function (ev, section_id) {
            setLogValue(appLogOption, section_id, '');
            return mihomox.clearAppLog();
        };

        appLogOption = s.taboption('app_log', form.TextValue, '_app_log');
        appLogOption.rows = 25;
        appLogOption.wrap = false;
        appLogOption.readonly = true;
        appLogOption.load = function () {
            return appLog;
        };
        appLogOption.write = function () {
            return true;
        };

        o = s.taboption('app_log', form.Button, 'scroll_app_log_to_bottom');
        o.inputtitle = _('Scroll To Bottom');
        o.onclick = function (ev, section_id) {
            scrollLogToBottom(m, '_app_log', section_id);
        };

        s.tab('core_log', _('Core Log'));

        o = s.taboption('core_log', form.Button, 'clear_core_log');
        o.inputstyle = 'negative';
        o.inputtitle = _('Clear Log');
        o.onclick = function (ev, section_id) {
            setLogValue(coreLogOption, section_id, '');
            return mihomox.clearCoreLog();
        };

        coreLogOption = s.taboption('core_log', form.TextValue, '_core_log');
        coreLogOption.rows = 25;
        coreLogOption.wrap = false;
        coreLogOption.readonly = true;
        coreLogOption.load = function () {
            return coreLog;
        };
        coreLogOption.write = function () {
            return true;
        };

        o = s.taboption('core_log', form.Button, 'scroll_core_log_to_bottom');
        o.inputtitle = _('Scroll To Bottom');
        o.onclick = function (ev, section_id) {
            scrollLogToBottom(m, '_core_log', section_id);
        };

        s.tab('debug_log', _('Debug Log'));

        o = s.taboption('debug_log', form.Button, '_generate_download_debug_log');
        o.inputstyle = 'negative';
        o.inputtitle = _('Generate & Download');
        o.onclick = function () {
            return mihomox.debug().then(function () {
                return fs.read_direct(mihomox.debugLogPath, 'blob').then(function (data) {
                    const url = window.URL.createObjectURL(data, { type: 'text/markdown' });
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'debug.log';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                });
            });
        };

        return m.render().then(function (viewNode) {
            // Register poll only after map DOM root exists to avoid
            // getUIElement -> root.querySelectorAll on undefined.
            poll.add(function () {
                if (document.hidden)
                    return Promise.resolve();
                return L.resolveDefault(mihomox.getAppLog(), '').then(function (log) {
                    setLogValue(appLogOption, 'log', log);
                });
            });
            poll.add(function () {
                if (document.hidden)
                    return Promise.resolve();
                return L.resolveDefault(mihomox.getCoreLog(), '').then(function (log) {
                    setLogValue(coreLogOption, 'log', log);
                });
            });
            return viewNode;
        });
    }
});
