'use strict';
'require form';
'require view';
'require uci';
'require fs';
'require dom';
'require ui';
'require tools.mihomox as mihomox';

/* Load the bundled editor assets without requiring internet access. */
var ACE_BASE = L.resource('mihomox/ace');
var aceLoadPromise;

function filterEditableFiles(files) {
    return files.filter(function (file) {
        return !/\.mrs$/i.test(file.name);
    });
}

function loadScript(url) {
    return new Promise(function (resolve, reject) {
        var script = E('script', { src: url, type: 'text/javascript' });
        script.onload = function () { resolve(); };
        script.onerror = function () { reject(new Error('Failed to load ' + url)); };
        document.head.appendChild(script);
    });
}

function loadAce() {
    if (window.ace)
        return Promise.resolve(true);

    if (aceLoadPromise)
        return aceLoadPromise;

    aceLoadPromise = loadScript(ACE_BASE + '/ace.min.js').then(function () {
        return Promise.all([
            loadScript(ACE_BASE + '/mode-yaml.min.js'),
            loadScript(ACE_BASE + '/theme-tomorrow_night.min.js')
        ]);
    }).then(function () {
        if (!window.ace || typeof window.ace.edit !== 'function')
            throw new Error('ACE global is unavailable');
        return true;
    }).catch(function (error) {
        console.warn('[mihomox] ACE editor unavailable, falling back to plain textarea:', error);
        return false;
    });

    return aceLoadPromise;
}

var CBIAceValue = form.TextValue.extend({
    __init__: function () {
        this.super('__init__', arguments);
        this.mode = 'ace/mode/yaml';
        this.theme = 'ace/theme/tomorrow_night';
    },

    renderWidget: function (section_id, option_index, cfgvalue) {
        var node = this.super('renderWidget', [section_id, option_index, cfgvalue]);
        var textarea = (node.tagName === 'TEXTAREA') ? node : node.querySelector('textarea');
        if (!textarea)
            return node;

        var height = (this.rows ? this.rows * 20 : 500) + 'px';
        var editorContainer = E('div', {
            id: (textarea.id || this.cbid(section_id)) + '-ace',
            style: 'display:none; width:100%; height:' + height + ';'
        });

        var wrapper = E('div', { class: 'cbi-ace-wrapper' }, [node, editorContainer]);
        var self = this;

        loadAce().then(function (available) {
            if (!available) {
                editorContainer.remove();
                return;
            }

            var editor;
            try {
                editorContainer.style.display = '';
                editor = window.ace.edit(editorContainer, {
                    value: textarea.value || '',
                    mode: self.mode,
                    theme: self.theme,
                    fontSize: '13px',
                    useWorker: false,
                    wrap: false
                });
                textarea.style.display = 'none';
            } catch (error) {
                console.warn('[mihomox] Failed to initialize ACE editor, using plain textarea:', error);
                editorContainer.remove();
                textarea.style.display = '';
                return;
            }

            editor.session.on('change', function () {
                if (textarea.value === editor.getValue())
                    return;
                textarea.value = editor.getValue();
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
            });

            editorContainer._aceInstance = editor;
            var classInstance = dom.findClassInstance(textarea) || dom.findClassInstance(node);
            if (classInstance && typeof classInstance.setValue === 'function' && !classInstance._aceWrapped) {
                var originalSetValue = classInstance.setValue.bind(classInstance);
                classInstance.setValue = function (value) {
                    originalSetValue(value);
                    if (editor.getValue() !== (value || ''))
                        editor.setValue(value || '', -1);
                };
                classInstance._aceWrapped = true;
            }
        });

        return wrapper;
    }
});

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
            o.value(mihomox.profilesDir + '/' + profile.name, _('File:') + profile.name);

        for (const subscription of subscriptions)
            o.value(mihomox.subscriptionsDir + '/' + subscription['.name'] + '.yaml', _('Subscription:') + subscription.name);

        for (const ruleProvider of ruleProviders)
            o.value(mihomox.ruleProvidersDir + '/' + ruleProvider.name, _('Rule Provider:') + ruleProvider.name);

        for (const proxyProvider of proxyProviders)
            o.value(mihomox.proxyProvidersDir + '/' + proxyProvider.name, _('Proxy Provider:') + proxyProvider.name);

        o.value(mihomox.mixinFilePath, _('File for Mixin'));
        o.value(mihomox.runProfilePath, _('Profile for Startup'));
        o.write = function () { return true; };
        o.onchange = function (event, section_id, value) {
            return L.resolveDefault(fs.read_direct(value), '').then(function (content) {
                var uiElement = m.lookupOption('_file_content', section_id)[0].getUIElement(section_id);
                if (uiElement)
                    uiElement.setValue(content);
            });
        };

        o = s.option(CBIAceValue, '_file_content');
        o.rows = 25;
        o.wrap = false;
        o.write = function (section_id, formvalue) {
            const path = m.lookupOption('_file', section_id)[0].formvalue(section_id);
            return mihomox.writefile(path, formvalue);
        };
        o.remove = function (section_id) {
            const path = m.lookupOption('_file', section_id)[0].formvalue(section_id);
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
