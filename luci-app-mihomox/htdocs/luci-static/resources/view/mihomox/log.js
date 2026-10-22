'use strict';
'require form';
'require view';
'require uci';
'require fs';
'require poll';
'require ui';
'require tools.mihomox as mihomox';

function validateCron(value) {
    const fields = String(value || '').trim().split(/\s+/);
    if (fields.length !== 5 || fields.some(function (field) {
        return !/^[0-9*/,-]+$/.test(field);
    }))
        return _('Invalid cron expression');
    return true;
}

function appendLog(option, state, result) {
    const previousText = state.text;
    result = result || {};
    const size = Number(result.size) || 0;
    const offset = Number(result.offset) || 0;
    const chunk = String(result.log || '');
    const next = Number(result.next);
    const inode = result.inode ?? state.inode;
    const rotated = (state.inode != null && inode != null && String(state.inode) !== String(inode));
    // A truncation or rotation invalidates the old offset.
    if (rotated || (state.offset > 0 && (size < state.offset || (offset === 0 && size < state.offset + chunk.length)))) {
        state.text = '';
        state.offset = 0;
    }
    state.inode = inode;
    if (!state.text)
        state.text = chunk;
    else if (chunk)
        state.text += chunk;
    state.offset = Number.isFinite(next) ? next : Math.max(state.offset, offset + chunk.length);
    const element = option.getUIElement('log');
    if (element && state.text !== previousText)
        element.setValue(state.text);
}

function reportLogError(label, state) {
    if (!state.readFailed)
        ui.addNotification(null, E('p', {}, label + ': ' + _('Read failed')), 'warning');
    state.readFailed = true;
    return state;
}

function isLogVisible(option) {
    if (document.hidden)
        return false;
    const element = option.getUIElement('log');
    if (!element)
        return false;
    if (element.offsetParent === null && element.getClientRects && element.getClientRects().length === 0)
        return false;
    return true;
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('mihomox'),
            mihomox.getAppLog().catch(function () { return reportLogError(_('App Log'), {}); }),
            mihomox.getCoreLog().catch(function () { return reportLogError(_('Core Log'), {}); })
        ]);
    },
    render: function (data) {
        const appResult = data[1] || {};
        const coreResult = data[2] || {};
        const appInitial = String(appResult.log || '');
        const coreInitial = String(coreResult.log || '');
        const appNext = Number(appResult.next);
        const coreNext = Number(coreResult.next);
        const appLogState = {
            offset: Number.isFinite(appNext) ? appNext : (Number(appResult.size) || appInitial.length),
            text: appInitial,
            inode: appResult.inode ?? null,
            readFailed: !!appResult.readFailed
        };
        const coreLogState = {
            offset: Number.isFinite(coreNext) ? coreNext : (Number(coreResult.size) || coreInitial.length),
            text: coreInitial,
            inode: coreResult.inode ?? null,
            readFailed: !!coreResult.readFailed
        };

        let m, s, o;

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
        o.onclick = function (_, section_id) {
            m.lookupOption('_app_log', section_id)[0].getUIElement(section_id).setValue('');
            appLogState.offset = 0;
            appLogState.text = '';
            appLogState.inode = null;
            return mihomox.clearAppLog();
        };

        o = s.taboption('app_log', form.TextValue, '_app_log');
        o.rows = 25;
        o.wrap = false;
        o.load = function (section_id) {
            return appInitial;
        };
        o.write = function (section_id, formvalue) {
            return true;
        };
        poll.add(L.bind(function () {
            const option = this;
            if (!isLogVisible(option))
                return Promise.resolve();
            return mihomox.getAppLog(appLogState.offset, appLogState.inode).then(function (result) {
                appendLog(option, appLogState, result);
                appLogState.readFailed = false;
            }).catch(function () {
                reportLogError(_('App Log'), appLogState);
            });
        }, o));

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
            coreLogState.offset = 0;
            coreLogState.text = '';
            coreLogState.inode = null;
            return mihomox.clearCoreLog();
        };

        o = s.taboption('core_log', form.TextValue, '_core_log');
        o.rows = 25;
        o.wrap = false;
        o.load = function (section_id) {
            return coreInitial;
        };
        o.write = function (section_id, formvalue) {
            return true;
        };
        poll.add(L.bind(function () {
            const option = this;
            if (!isLogVisible(option))
                return Promise.resolve();
            return mihomox.getCoreLog(coreLogState.offset, coreLogState.inode).then(function (result) {
                appendLog(option, coreLogState, result);
                coreLogState.readFailed = false;
            }).catch(function () {
                reportLogError(_('Core Log'), coreLogState);
            });
        }, o));

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
            return mihomox.debug().then(function (result) {
                if (!result?.success)
                    return Promise.reject(new Error(_('Debug Log') + ': ' + _('Failed')));

                return fs.read_direct(mihomox.debugLogPath, 'blob').then(function (data) {
                    // create url
                    const url = window.URL.createObjectURL(data, { type: 'text/markdown' });
                    // create link
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'debug.log';
                    // append to body
                    document.body.appendChild(link);
                    // download
                    link.click();
                    // remove from body
                    document.body.removeChild(link);
                    // revoke url
                    window.URL.revokeObjectURL(url);
                });
            });
        };

        return m.render();
    }
});
