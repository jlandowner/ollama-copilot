import { describe, it, expect, vi } from 'vitest';
import { removeCodeBlockSyntax } from './RecommendationCache';

// Mock the vscode module
vi.mock('vscode', () => ({
	window: {
		showInformationMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn(),
		}),
	},
}));

describe('removeCodeBlockSyntax', () => {
	it('should remove code block syntax from the text', () => {
		const text = '```typescript\nconst a = 1;\n```';
		const result = removeCodeBlockSyntax(text);
		expect(result).toBe('const a = 1;\n');
	});

	it('should handle text without code block syntax', () => {
		const text = 'const a = 1;';
		const result = removeCodeBlockSyntax(text);
		expect(result).toBe(text);
	});

	it('should handle text with incomplete code block syntax', () => {
		const text = '```typescript\nconst a = 1;';
		const result = removeCodeBlockSyntax(text);
		expect(result).toBe('const a = 1;');
	});
});
