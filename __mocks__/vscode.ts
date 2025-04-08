import { vi } from 'vitest';

module.exports = {
	// Mock the necessary parts of the vscode module
	window: {
		showInformationMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn(),
		}),
	},
	// Add other necessary mocks as needed
};