'use strict';
'require form';
'require view';
'require uci';
'require fs';
'require poll';
'require tools.mihomox as mihomox';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('mihomox'),
            mihomox.getAppLog(),
            mihomox.getCoreLog()
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
        o.onclick = function (_, section_id) {
            m.lookupOption('_app_log', section_id)[0].getUIElement(section_id).setValue('');
            return mihomox.clearAppLog();
        };

        appLogOption = s.taboption('app_log', form.TextValue, '_app_log');
        appLogOption.rows = 25;
        appLogOption.wrap = false;
        appLogOption.load = function (section_id) {
            return appLog;
        };
        appLogOption.write = function (section_id, formvalue) {
            return true;
        };

        o = s.taboption('app_log', form.Button, 'scroll_app_log_to_bottom');
        o.inputtitle = _('Scroll To Bottom');
        o.onclick = function (_, section_id) {
            const element = m.lookupOption('_app_log', section_id)[0].getUIElement(section_id).node.firstChild;
            element.scrollTop = element.scrollHeight;
        };

        s.tab('core_log', _('Core Log'));

        o = s.taboption('core_log', form.Button, 'clear_core_log');
        o.inputstyle = 'negative';
        o.inputtitle = _('Clear Log');
        o.onclick = function (_, section_id) {
            m.lookupOption('_core_log', section_id)[0].getUIElement(section_id).setValue('');
            return mihomox.clearCoreLog();
        };

        coreLogOption = s.taboption('core_log', form.TextValue, '_core_log');
        coreLogOption.rows = 25;
        coreLogOption.wrap = false;
        coreLogOption.load = function (section_id) {
            return coreLog;
        };
        coreLogOption.write = function (section_id, formvalue) {
            return true;
        };

        o = s.taboption('core_log', form.Button, 'scroll_core_log_to_bottom');
        o.inputtitle = _('Scroll To Bottom');
        o.onclick = function (_, section_id) {
            const element = m.lookupOption('_core_log', section_id)[0].getUIElement(section_id).node.firstChild;
            element.scrollTop = element.scrollHeight;
        };

        s.tab('debug_log', _('Debug Log'));

        o = s.taboption('debug_log', form.Button, '_generate_download_debug_log');
        o.inputstyle = 'negative';
        o.inputtitle = _('Generate & Download');
        o.onclick = function () {
            return mihomox.debug().then(function () {
                fs.read_direct(mihomox.debugLogPath, 'blob').then(function (data) {
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

        // Nikki registers poll during option setup; on current LuCI/Aurora that
        // can run before map root exists. Keep Nikki read/update style, but
        // only start polling after render.
        return m.render().then(function (viewNode) {
            poll.add(function () {
                return L.resolveDefault(mihomox.getAppLog()).then(function (log) {
                    try {
                        appLogOption.getUIElement('log').setValue(log);
                    } catch (e) { }
                });
            });
            poll.add(function () {
                return L.resolveDefault(mihomox.getCoreLog()).then(function (log) {
                    try {
                        coreLogOption.getUIElement('log').setValue(log);
                    } catch (e) { }
                });
            });
            return viewNode;
        });
    }
});
