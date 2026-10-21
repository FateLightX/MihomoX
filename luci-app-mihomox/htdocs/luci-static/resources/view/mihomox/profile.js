'use strict';
'require form';
'require view';
'require uci';
'require ui';
'require poll';
'require tools.mihomox as mihomox';

function validateURL(value) {
    value = String(value || '').trim();
    return !value || /^https?:\/\/[^\s]+$/.test(value) ? true : _('Invalid URL');
}

function subscriptionStatusText(status) {
    switch (status?.state) {
    case 'updated':
        return status.message === 'applied'
            ? _('Updated and applied')
            : _('Updated, restart to apply');
    case 'running':
        return _('Updating');
    case 'failed':
        return _('Update failed, cached profile remains active');
    default:
        return '-';
    }
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('mihomox'),
            L.resolveDefault(mihomox.subscriptionStatus(), {})
        ]);
    },
    render: function (data) {
        let subscriptionStatus = data[1] || {};
        let m, s, o, so;

        m = new form.Map('mihomox');

        s = m.section(form.NamedSection, 'config', 'config', _('Profile'));

        o = s.option(form.FileUpload, '_upload_profile', _('Upload Profile'));
        o.browser = true;
        o.enable_download = true;
        o.root_directory = mihomox.profilesDir;
        o.write = function (section_id, formvalue) {
            return true;
        };

        s = m.section(form.GridSection, 'subscription', _('Subscription'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.modaltitle = _('Edit Subscription');

        let statusOption;

        o = s.option(form.DummyValue, '_subscription_refresh_status', _('Update Status'));
        o.modalonly = false;
        o.optional = true;
        statusOption = o;
        statusOption.cfgvalue = function (section_id) {
            if (subscriptionStatus.section && section_id && subscriptionStatus.section !== section_id)
                return '-';
            return subscriptionStatusText(subscriptionStatus);
        };

        o = s.option(form.Value, 'name', _('Subscription Name'));
        o.rmempty = false;

        o = s.option(form.Value, 'used', _('Used'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Value, 'total', _('Total'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Value, 'expire', _('Expire At'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Value, 'update', _('Update At'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Button, 'update_subscription');
        o.editable = true;
        o.inputstyle = 'positive';
        o.inputtitle = _('Update');
        o.modalonly = false;
        o.onclick = function (ev, section_id) {
            return mihomox.updateSubscription(section_id).then(function (result) {
                if (!result?.success)
                    return Promise.reject(new Error(_('Subscription') + ': ' + _('Failed')));

                if (result.running) {
                    subscriptionStatus = { state: 'running', section: section_id };
                    const statusElement = statusOption.getUIElement(section_id);
                    if (statusElement)
                        statusElement.setValue(_('Updating'));
                    ui.addNotification(null, E('p', {}, _('Subscription update already running')), 'info');
                    return;
                }

                subscriptionStatus = { state: 'updated', message: 'restart_required', section: section_id };
                const updatedElement = statusOption.getUIElement(section_id);
                if (updatedElement)
                    updatedElement.setValue(_('Updated, restart to apply'));

                uci.unload('mihomox');
                return uci.load('mihomox').then(function () {
                    for (const name of ['used', 'total', 'expire', 'update']) {
                        const option = m.lookupOption(name, section_id);
                        const element = option?.[0]?.getUIElement(section_id);
                        if (element)
                            element.setValue(uci.get('mihomox', section_id, name) || '');
                    }
                });
            });
        };

        o = s.option(form.Value, 'info_url', _('Subscription Info Url'));
        o.modalonly = true;
        o.validate = function (_, value) {
            return validateURL(value);
        };

        o = s.option(form.Value, 'url', _('Subscription Url'));
        o.modalonly = true;
        o.rmempty = false;
        o.validate = function (_, value) {
            return validateURL(value);
        };

        o = s.option(form.Value, 'user_agent', _('User Agent'));
        o.default = 'clash';
        o.modalonly = true;
        o.rmempty = false;
        o.value('clash');
        o.value('clash.meta');
        o.value('mihomo');

        o = s.option(form.ListValue, 'prefer', _('Prefer'));
        o.default = 'remote';
        o.modalonly = true;
        o.rmempty = false;
        o.value('remote', _('Remote'));
        o.value('local', _('Local'));

        poll.add(function () {
            if (document.hidden)
                return Promise.resolve();
            return L.resolveDefault(mihomox.subscriptionStatus(), {}).then(function (status) {
                const previous = subscriptionStatus;
                subscriptionStatus = status || {};
                const sectionId = subscriptionStatus.section || previous.section;
                if (!sectionId)
                    return;
                if (previous.state === 'running' && subscriptionStatus.state === 'updated')
                    ui.addNotification(null, E('p', {}, _('Updated, restart to apply')), 'info');
                const element = statusOption.getUIElement(sectionId);
                if (element)
                    element.setValue(subscriptionStatusText(subscriptionStatus));
            });
        });

        return m.render();
    }
});
