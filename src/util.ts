class Debouncer<T extends (...args: any) => Promise<any>> {
	private func: T;
	private wait: number;
	private timeout: NodeJS.Timeout | null;

	constructor(func: T, wait: number) {
		this.func = func;
		this.wait = wait;
		this.timeout = null;
	}

	async debounce(...args: any): Promise<any> {
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		return new Promise((resolve, reject) => {
			this.timeout = setTimeout(async () => {
				try {
					const res = await this.func(...args);
					resolve(res);
				} catch (e) {
					reject(e);
				}
			}, this.wait);
		});
	}
}

export { Debouncer };