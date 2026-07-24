'use strict';
'require form';
'require view';
'require uci';
'require fs';
'require tools.mihomox as mihomox';

function filterEditableFiles(files) {
    return (files || []).filter(function (file) {
        return isEditablePath(file ? file.name : '');
    });
}

function isEditablePath(path) {
    return !/\.mrs$/i.test(String(path || ''));
}

function addEditableFileOption(option, path, label, name) {
    if (isEditablePath(name || path))
        option.value(path, label);
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('mihomox'),
            mihomox.listProfiles().then(filterEditableFiles),
            mihomox.listRuleProviders().then(filterEditableFiles),
            mihomox.listProxyProviders().then(filterEditableFiles)
        ]);
    },
    render: function (data) {
        const subscriptions = uci.sections('mihomox', 'subscription');
        const profiles = data[1];
        const ruleProviders = data[2];
        const proxyProviders = data[3];

        let m, s, o;

        m = new form.Map('mihomox');
        s = m.section(form.NamedSection, 'editor', 'editor', _('Editor'));

        o = s.option(form.ListValue, '_file', _('Choose File'));
        o.optional = true;

        for (const profile of profiles)
            addEditableFileOption(o, mihomox.profilesDir + '/' + profile.name, _('File:') + profile.name, profile.name);

        for (const subscription of subscriptions)
            o.value(mihomox.subscriptionsDir + '/' + subscription['.name'] + '.yaml', _('Subscription:') + subscription.name);

        for (const ruleProvider of ruleProviders)
            addEditableFileOption(o, mihomox.ruleProvidersDir + '/' + ruleProvider.name, _('Rule Provider:') + ruleProvider.name, ruleProvider.name);

        for (const proxyProvider of proxyProviders)
            addEditableFileOption(o, mihomox.proxyProvidersDir + '/' + proxyProvider.name, _('Proxy Provider:') + proxyProvider.name, proxyProvider.name);

        o.value(mihomox.mixinFilePath, _('File for Mixin'));
        o.value(mihomox.runProfilePath, _('Profile for Startup'));
        o.write = function () { return true; };
        o.onchange = function (event, section_id, value) {
            if (!isEditablePath(value))
                return;
            return L.resolveDefault(fs.read_direct(value), '').then(function (content) {
                var uiElement = m.lookupOption('_file_content', section_id)[0].getUIElement(section_id);
                if (uiElement)
                    uiElement.setValue(content);
            });
        };

        o = s.option(form.TextValue, '_file_content');
        o.rows = 25;
        o.wrap = false;
        o.write = function (section_id, formvalue) {
            const path = m.lookupOption('_file', section_id)[0].formvalue(section_id);
            if (!isEditablePath(path))
                return;
            return mihomox.writefile(path, formvalue);
        };
        o.remove = function (section_id) {
            const path = m.lookupOption('_file', section_id)[0].formvalue(section_id);
            if (!isEditablePath(path))
                return;
            return mihomox.writefile(path);
        };

        return m.render();
    },
    handleSaveApply: function (ev, mode) {
        return this.handleSave(ev).finally(function () {
            return mode === '0' ? mihomox.reload() : mihomox.restart();
        });
    },
    handleReset: null
});
