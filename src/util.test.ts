import { describe, it, expect, vi } from 'vitest';
import { Debouncer } from './util';

describe('Debouncer', () => {
	it('should call the function after the specified wait time', async () => {
		const f = vi.fn().mockResolvedValue('result');
		const debouncer = new Debouncer(f, 100);

		await debouncer.debounce();
		expect(f).toHaveBeenCalledTimes(1);
	});

	it(
		'should not call the function if debounced again before the wait time',
		async () => {
			const f = vi.fn().mockResolvedValue('result');
			const debouncer = new Debouncer(f, 1000);

			debouncer.debounce(); // First call
			await new Promise((resolve) => setTimeout(resolve, 500)); // Wait less than the debounce time
			await debouncer.debounce(); // Second call

			expect(f).toHaveBeenCalledTimes(1); // Ensure only the second call executes
		},
		15000 // Extended timeout to 15 seconds
	);
});