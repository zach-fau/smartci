import { describe, it, expect } from 'vitest';
import {
  matchesAlwaysRunPattern,
  applySafetyRules,
  quickSafetyCheck,
  generateSafetyReport,
} from './rules.js';
import { DEFAULT_CONFIG, type SmartCIConfig } from './config.js';
import type { TestSelectionResult } from '../llm/client.js';

describe('matchesAlwaysRunPattern', () => {
  const patterns = ['package.json', '*.lock', '.github/**', '*.config.*'];

  it('should match exact filenames', () => {
    const result = matchesAlwaysRunPattern(['package.json'], patterns);
    expect(result.matches).toBe(true);
    expect(result.matchedPattern).toBe('package.json');
  });

  it('should match wildcard patterns', () => {
    const result = matchesAlwaysRunPattern(['yarn.lock'], patterns);
    expect(result.matches).toBe(true);
    expect(result.matchedPattern).toBe('*.lock');
  });

  it('should match globstar patterns', () => {
    const result = matchesAlwaysRunPattern(['.github/workflows/ci.yml'], patterns);
    expect(result.matches).toBe(true);
    expect(result.matchedPattern).toBe('.github/**');
  });

  it('should match config patterns', () => {
    const result = matchesAlwaysRunPattern(['jest.config.ts'], patterns);
    expect(result.matches).toBe(true);
    expect(result.matchedPattern).toBe('*.config.*');
  });

  it('should not match regular source files', () => {
    const result = matchesAlwaysRunPattern(['src/index.ts', 'src/utils.js'], patterns);
    expect(result.matches).toBe(false);
  });

  it('should return the matched file', () => {
    const result = matchesAlwaysRunPattern(['src/index.ts', 'package.json'], patterns);
    expect(result.matches).toBe(true);
    expect(result.matchedFile).toBe('package.json');
  });
});

describe('applySafetyRules', () => {
  const allTests = ['test1.test.ts', 'test2.test.ts', 'test3.test.ts', 'critical.test.ts'];
  const config: SmartCIConfig = {
    ...DEFAULT_CONFIG,
    criticalTests: ['critical.test.ts'],
    maxSkipRatio: 0.75,
  };

  it('should enforce always-run patterns', () => {
    const selection: TestSelectionResult = {
      testsToRun: ['test1.test.ts'],
      runAll: false,
      confidence: 90,
      reasoning: 'Only one file changed',
      timeSavedEstimate: 100,
    };

    const result = applySafetyRules(
      selection,
      allTests,
      ['package.json'], // Changed files
      config
    );

    expect(result.allowSkipping).toBe(false);
    expect(result.reason).toContain('Always-run pattern');
    expect(result.finalTests).toEqual(allTests);
  });

  it('should enforce confidence threshold', () => {
    const selection: TestSelectionResult = {
      testsToRun: ['test1.test.ts'],
      runAll: false,
      confidence: 50, // Below default 80%
      reasoning: 'Not sure about impact',
      timeSavedEstimate: 100,
    };

    const result = applySafetyRules(
      selection,
      allTests,
      ['src/index.ts'],
      config
    );

    expect(result.allowSkipping).toBe(false);
    expect(result.reason).toContain('Confidence');
    expect(result.reason).toContain('below threshold');
  });

  it('should respect runAll from LLM', () => {
    const selection: TestSelectionResult = {
      testsToRun: [],
      runAll: true,
      confidence: 30,
      reasoning: 'Core module changed',
      timeSavedEstimate: 0,
    };

    const result = applySafetyRules(
      selection,
      allTests,
      ['src/index.ts'],
      config
    );

    expect(result.allowSkipping).toBe(false);
    expect(result.finalTests).toEqual(allTests);
  });

  it('should add critical tests', () => {
    const selection: TestSelectionResult = {
      testsToRun: ['test1.test.ts'],
      runAll: false,
      confidence: 95,
      reasoning: 'Only test1 affected',
      timeSavedEstimate: 100,
    };

    const result = applySafetyRules(
      selection,
      allTests,
      ['src/utils.ts'],
      config
    );

    expect(result.allowSkipping).toBe(true);
    expect(result.finalTests).toContain('critical.test.ts');
    expect(result.addedTests).toContain('critical.test.ts');
  });

  it('should enforce max skip ratio', () => {
    const selection: TestSelectionResult = {
      testsToRun: ['test1.test.ts'], // Only 1 of 4 tests = 75% skip ratio
      runAll: false,
      confidence: 95,
      reasoning: 'Minimal changes',
      timeSavedEstimate: 100,
    };

    const strictConfig: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      maxSkipRatio: 0.5, // Max 50% can be skipped
    };

    const result = applySafetyRules(
      selection,
      allTests,
      ['src/utils.ts'],
      strictConfig
    );

    // Should add tests to meet 50% minimum
    expect(result.finalTests.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some(w => w.includes('max skip ratio'))).toBe(true);
  });

  it('should apply shadow mode', () => {
    const selection: TestSelectionResult = {
      testsToRun: ['test1.test.ts'],
      runAll: false,
      confidence: 95,
      reasoning: 'Only test1 affected',
      timeSavedEstimate: 100,
    };

    const shadowConfig: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      shadowMode: true,
    };

    const result = applySafetyRules(
      selection,
      allTests,
      ['src/utils.ts'],
      shadowConfig
    );

    expect(result.allowSkipping).toBe(false);
    expect(result.reason).toContain('Shadow mode');
    expect(result.finalTests).toEqual(allTests);
    expect(result.warnings.some(w => w.includes('Shadow mode'))).toBe(true);
  });

  it('should remove skipped tests', () => {
    const selection: TestSelectionResult = {
      testsToRun: ['test1.test.ts', 'test2.test.ts'],
      runAll: false,
      confidence: 95,
      reasoning: 'Tests selected',
      timeSavedEstimate: 100,
    };

    const skipConfig: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      skipTests: ['test2.test.ts'],
    };

    const result = applySafetyRules(
      selection,
      allTests,
      ['src/utils.ts'],
      skipConfig
    );

    expect(result.finalTests).not.toContain('test2.test.ts');
    expect(result.warnings.some(w => w.includes('skipped test'))).toBe(true);
  });
});

describe('quickSafetyCheck', () => {
  it('should detect always-run patterns', () => {
    const result = quickSafetyCheck(['package.json'], DEFAULT_CONFIG);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Always-run pattern');
  });

  it('should allow normal source changes', () => {
    const result = quickSafetyCheck(['src/index.ts'], DEFAULT_CONFIG);
    expect(result.safe).toBe(true);
  });

  it('should flag too many changed files', () => {
    const manyFiles = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`);
    const result = quickSafetyCheck(manyFiles, DEFAULT_CONFIG);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Too many changed files');
  });
});

describe('generateSafetyReport', () => {
  it('should generate markdown report', () => {
    const result = {
      allowSkipping: true,
      reason: 'Tests selected successfully',
      originalTests: ['test1.test.ts'],
      finalTests: ['test1.test.ts', 'critical.test.ts'],
      addedTests: ['critical.test.ts'],
      warnings: ['Added 1 critical test'],
    };

    const report = generateSafetyReport(result);

    expect(report).toContain('## SmartCI Safety Report');
    expect(report).toContain('Skipping enabled');
    expect(report).toContain('Tests selected successfully');
    expect(report).toContain('Original selection: 1 tests');
    expect(report).toContain('Final selection: 2 tests');
    expect(report).toContain('critical.test.ts');
    expect(report).toContain('Warnings');
  });

  it('should report when all tests run', () => {
    const result = {
      allowSkipping: false,
      reason: 'Confidence below threshold',
      originalTests: [],
      finalTests: ['test1.test.ts', 'test2.test.ts'],
      addedTests: ['test1.test.ts', 'test2.test.ts'],
      warnings: [],
    };

    const report = generateSafetyReport(result);

    expect(report).toContain('Running all tests');
    expect(report).toContain('Confidence below threshold');
  });
});
