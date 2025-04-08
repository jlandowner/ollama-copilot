import * as vscode from 'vscode';
import { CONFIG, EXTENTION_ID, RESTART_EXTENTION_CONFIG_LIST } from './constants';
import { Debouncer } from './util';

class Config {
	_watch: { [key in CONFIG]?: { callback: (value: any) => void; previousValue: any } };
	private debounceHandleConfigChange: Debouncer<() => Promise<void>>;

	constructor(private readonly section: string) {
		this._watch = {};
		this.debounceHandleConfigChange = new Debouncer(this.handleConfigChange.bind(this), 500);
	}

	get<T>(key: CONFIG, defaultValue?: T): T {
		const config = vscode.workspace.getConfiguration(this.section);
		const v = config.get<T>(key);
		if (v === undefined) {
			if (defaultValue !== undefined) {
				return defaultValue;
			}
			throw new Error(`Config not found: ${key}`);
		}
		return v;
	}

	update<T>(key: CONFIG, value: T) {
		const config = vscode.workspace.getConfiguration(this.section);
		config.update(key, value).then(() => {
            vscode.window.showInformationMessage(`Updated setting: ${key}="${value}"`);
        }, (error) => {
            vscode.window.showErrorMessage(`Failed to update setting: key="${key}": ${error}`);
        });
	}

	onChange<T>(key: CONFIG, callback: (value: T) => void) {
		this._watch[key] = { callback, previousValue: this.get<T>(key) };
	}

	registerConfigChangeHandler(context: vscode.ExtensionContext): vscode.Disposable {
		// register restart extention on change handler
		for (const key of RESTART_EXTENTION_CONFIG_LIST) {
			this.onChange(key, () => {
				vscode.window.showInformationMessage('Please restart the extention to apply the changes', 'Reload').then((value) => {
					if (value === 'Reload') {
						vscode.commands.executeCommand('workbench.action.reloadWindow');
					}
				});
			});
		}

		// register on change handler for config
		return vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(this.section)) {
				this.debounceHandleConfigChange.debounce();
			}
		});
	}

	async handleConfigChange() {
		for (const key in this._watch) {
			const watch = this._watch[key as CONFIG];
			if (!watch) return;
			const newValue = this.get(key as CONFIG);
			if (watch.previousValue !== newValue) {
				watch.callback(newValue);
				this._watch[key as CONFIG]!.previousValue = newValue;
			}
		}
	}
}
 
export default new Config(EXTENTION_ID);
