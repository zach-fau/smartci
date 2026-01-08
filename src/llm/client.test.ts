import { describe, it, expect } from 'vitest';
import {
  buildTestSelectionPrompt,
  parseTestSelectionResponse,
  hashContext,
  type TestSelectionContext,
} from './client.js';
import type { FileDiff } from '../diff/parser.js';

describe('buildTestSelectionPrompt', () => {
  it('should include changed source files', () => {
    const context: TestSelectionContext = {
      changedFiles: [
        {
          path: 'src/utils.ts',
          changeType: 'modified',
          hunks: [
            {
              oldStart: 1,
              oldLines: 5,
              newStart: 1,
              newLines: 7,
              content: [],
              additions: ['line1', 'line2'],
              deletions: [],
            },
          ],
        },
      ],
      allTestFiles: ['src/utils.test.ts'],
      changedTestFiles: [],
      changedSourceFiles: ['src/utils.ts'],
      testMappings: new Map(),
    };

    const prompt = buildTestSelectionPrompt(context);

    expect(prompt).toContain('src/utils.ts');
    expect(prompt).toContain('+2');
    expect(prompt).toContain('Source Files Modified');
  });

  it('should include changed test files', () => {
    const context: TestSelectionContext = {
      changedFiles: [],
      allTestFiles: ['src/utils.test.ts'],
      changedTestFiles: [
        {
          path: 'src/utils.test.ts',
          framework: 'jest',
          sourceFile: 'src/utils.ts',
        },
      ],
      changedSourceFiles: [],
      testMappings: new Map(),
    };

    const prompt = buildTestSelectionPrompt(context);

    expect(prompt).toContain('src/utils.test.ts');
    expect(prompt).toContain('Test Files Modified');
    expect(prompt).toContain('tests: src/utils.ts');
  });

  it('should include dependency information', () => {
    const context: TestSelectionContext = {
      changedFiles: [],
      allTestFiles: [],
      changedTestFiles: [],
      changedSourceFiles: ['src/utils.ts'],
      dependencyGraph: {
        nodes: new Map([
          [
            'src/utils.ts',
            {
              path: 'src/utils.ts',
              imports: [],
              importedBy: ['src/app.ts', 'src/api.ts'],
              externalDeps: [],
              language: 'typescript',
            },
          ],
        ]),
        metadata: {
          builtAt: new Date().toISOString(),
          rootDir: '.',
          fileCount: 1,
        },
      },
      testMappings: new Map(),
    };

    const prompt = buildTestSelectionPrompt(context);

    expect(prompt).toContain('Dependency Information');
    expect(prompt).toContain('is imported by');
    expect(prompt).toContain('src/app.ts');
  });

  it('should include test mappings', () => {
    const context: TestSelectionContext = {
      changedFiles: [],
      allTestFiles: ['src/utils.test.ts'],
      changedTestFiles: [],
      changedSourceFiles: [],
      testMappings: new Map([['src/utils.test.ts', ['src/utils.ts', 'src/helpers.ts']]]),
    };

    const prompt = buildTestSelectionPrompt(context);

    expect(prompt).toContain('Test to Source Mappings');
    expect(prompt).toContain('src/utils.test.ts tests: src/utils.ts, src/helpers.ts');
  });

  it('should list all available tests', () => {
    const context: TestSelectionContext = {
      changedFiles: [],
      allTestFiles: ['test1.test.ts', 'test2.test.ts', 'test3.test.ts'],
      changedTestFiles: [],
      changedSourceFiles: [],
      testMappings: new Map(),
    };

    const prompt = buildTestSelectionPrompt(context);

    expect(prompt).toContain('All Available Tests');
    expect(prompt).toContain('test1.test.ts');
    expect(prompt).toContain('test2.test.ts');
    expect(prompt).toContain('test3.test.ts');
  });

  it('should truncate long test lists', () => {
    const allTestFiles = Array.from({ length: 100 }, (_, i) => `test${i}.test.ts`);
    const context: TestSelectionContext = {
      changedFiles: [],
      allTestFiles,
      changedTestFiles: [],
      changedSourceFiles: [],
      testMappings: new Map(),
    };

    const prompt = buildTestSelectionPrompt(context);

    expect(prompt).toContain('and 50 more test files');
  });

  it('should include JSON output instructions', () => {
    const context: TestSelectionContext = {
      changedFiles: [],
      allTestFiles: [],
      changedTestFiles: [],
      changedSourceFiles: [],
      testMappings: new Map(),
    };

    const prompt = buildTestSelectionPrompt(context);

    expect(prompt).toContain('```json');
    expect(prompt).toContain('testsToRun');
    expect(prompt).toContain('runAll');
    expect(prompt).toContain('confidence');
  });
});

describe('parseTestSelectionResponse', () => {
  it('should parse valid JSON response with code block', () => {
    const response = `Here is my analysis:

\`\`\`json
{
  "testsToRun": ["src/utils.test.ts", "src/api.test.ts"],
  "runAll": false,
  "confidence": 85,
  "reasoning": "Changed utils.ts which is imported by api.ts",
  "timeSavedEstimate": 120
}
\`\`\`

The tests above should cover the changes.`;

    const result = parseTestSelectionResponse(response);

    expect(result.testsToRun).toEqual(['src/utils.test.ts', 'src/api.test.ts']);
    expect(result.runAll).toBe(false);
    expect(result.confidence).toBe(85);
    expect(result.reasoning).toBe('Changed utils.ts which is imported by api.ts');
    expect(result.timeSavedEstimate).toBe(120);
  });

  it('should parse JSON response without code block', () => {
    const response = `{
      "testsToRun": ["test.ts"],
      "runAll": true,
      "confidence": 50,
      "reasoning": "Uncertain impact"
    }`;

    const result = parseTestSelectionResponse(response);

    expect(result.testsToRun).toEqual(['test.ts']);
    expect(result.runAll).toBe(true);
    expect(result.confidence).toBe(50);
  });

  it('should handle missing fields with defaults', () => {
    const response = `\`\`\`json
{
  "testsToRun": ["test.ts"]
}
\`\`\``;

    const result = parseTestSelectionResponse(response);

    expect(result.testsToRun).toEqual(['test.ts']);
    expect(result.runAll).toBe(false);
    expect(result.confidence).toBe(50);
    expect(result.reasoning).toBe('No reasoning provided');
    expect(result.timeSavedEstimate).toBe(0);
  });

  it('should fallback to runAll on invalid JSON', () => {
    const response = 'This is not valid JSON at all';

    const result = parseTestSelectionResponse(response);

    expect(result.runAll).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain('Failed to parse');
  });

  it('should handle empty testsToRun array', () => {
    const response = `\`\`\`json
{
  "testsToRun": [],
  "runAll": true,
  "confidence": 30,
  "reasoning": "Core config changed"
}
\`\`\``;

    const result = parseTestSelectionResponse(response);

    expect(result.testsToRun).toEqual([]);
    expect(result.runAll).toBe(true);
  });

  it('should handle malformed code blocks', () => {
    const response = `\`\`\`json
{
  "testsToRun": ["test.ts"],
  "runAll": false
  invalid syntax
\`\`\``;

    // Should still try to parse and fallback
    const result = parseTestSelectionResponse(response);
    expect(result.runAll).toBe(true); // Fallback
  });
});

describe('hashContext', () => {
  it('should produce consistent hashes for same context', () => {
    const context: TestSelectionContext = {
      changedFiles: [{ path: 'src/index.ts', changeType: 'modified', hunks: [] }],
      allTestFiles: [],
      changedTestFiles: [],
      changedSourceFiles: ['src/index.ts'],
      testMappings: new Map(),
    };

    const hash1 = hashContext(context);
    const hash2 = hashContext(context);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different contexts', () => {
    const context1: TestSelectionContext = {
      changedFiles: [{ path: 'src/a.ts', changeType: 'modified', hunks: [] }],
      allTestFiles: [],
      changedTestFiles: [],
      changedSourceFiles: ['src/a.ts'],
      testMappings: new Map(),
    };

    const context2: TestSelectionContext = {
      changedFiles: [{ path: 'src/b.ts', changeType: 'modified', hunks: [] }],
      allTestFiles: [],
      changedTestFiles: [],
      changedSourceFiles: ['src/b.ts'],
      testMappings: new Map(),
    };

    const hash1 = hashContext(context1);
    const hash2 = hashContext(context2);

    expect(hash1).not.toBe(hash2);
  });

  it('should return a hex string', () => {
    const context: TestSelectionContext = {
      changedFiles: [],
      allTestFiles: [],
      changedTestFiles: [],
      changedSourceFiles: [],
      testMappings: new Map(),
    };

    const hash = hashContext(context);

    expect(hash).toMatch(/^-?[0-9a-f]+$/);
  });
});
