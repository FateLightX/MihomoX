import { access, readfile, popen } from 'fs';

export function uci_bool(obj) {
	return obj == null ? null : obj == '1';
};

export function uci_int(obj) {
	return obj == null ? null : int(obj);
};

export function uci_array(obj) {
	if (obj == null) {
		return [];
	}
	if (type(obj) == 'array') {
		return uniq(obj);
	}
	return [obj];
};

export function trim_all(obj) {
	if (obj == null) {
		return null;
	}
	if (type(obj) == 'string') {
		if (length(obj) == 0) {
			return null;
		}
		return obj;
	}
	if (type(obj) == 'array') {
		if (length(obj) == 0) {
			return null;
		}
		return obj;
	}
	if (type(obj) == 'object') {
		const obj_keys = keys(obj);
		for (let key in obj_keys) {
			obj[key] = trim_all(obj[key]);
			if (obj[key] == null) {
				delete obj[key];
			}
		}
		if (length(keys(obj)) == 0) {
			return null;
		}
		return obj;
	}
	return obj;
};

export function get_cgroups_version() {
	// Avoid parsing `mount` output; cgroup v2 exposes this file.
	if (access('/sys/fs/cgroup/cgroup.controllers', 'r'))
		return 2;
	return 1;
};

export function get_users() {
	return map(split(readfile('/etc/passwd') || '', '\n'), (x) => split(x, ':')[0]);
};

export function get_groups() {
	return map(split(readfile('/etc/group') || '', '\n'), (x) => split(x, ':')[0]);
};

export function get_cgroups() {
	const result = [];
	if (get_cgroups_version() != 2)
		return result;

	// OpenWrt procd services live under services/; full-tree find is slow.
	const roots = [
		{ path: '/sys/fs/cgroup/services/', prefix: 'services/' },
		{ path: '/sys/fs/cgroup/system.slice/', prefix: 'system.slice/' }
	];
	for (let root in roots) {
		if (!access(root.path, 'r'))
			continue;
		const process = popen(['find', root.path, '-type', 'd', '-mindepth', '1', '-maxdepth', '2'], 'r');
		if (!process)
			continue;
		for (let line = process.read('line'); length(line); line = process.read('line')) {
			const relative = substr(trim(line), length('/sys/fs/cgroup/'));
			if (relative)
				push(result, relative);
		}
		process.close();
	}
	return result;
};

export function load_profile() {
	let result = {};
	const process = popen('yq -M -p yaml -o json /etc/mihomox/run/config.yaml');
	if (process) {
		result = json(process);
		process.close();
	}
	return result;
};
