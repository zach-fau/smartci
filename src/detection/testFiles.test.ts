import { describe, it, expect } from 'vitest';
import {
  detectTestFile,
  findTestFiles,
  findSourceFiles,
  isTestFile,
  getTestPatterns,
  type TestFramework,
} from './testFiles.js';

describe('detectTestFile', () => {
  describe('Jest/Vitest patterns', () => {
    it('should detect .test.ts files', () => {
      const result = detectTestFile('src/utils.test.ts');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('jest');
      expect(result?.path).toBe('src/utils.test.ts');
    });

    it('should detect .spec.ts files', () => {
      const result = detectTestFile('src/utils.spec.ts');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('jest');
    });

    it('should detect .test.tsx files', () => {
      const result = detectTestFile('src/Component.test.tsx');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('jest');
    });

    it('should detect .test.js files', () => {
      const result = detectTestFile('src/utils.test.js');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('jest');
    });

    it('should detect __tests__ directory files', () => {
      const result = detectTestFile('src/__tests__/utils.ts');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('jest');
    });

    it('should detect nested __tests__ files', () => {
      const result = detectTestFile('src/components/__tests__/Button.tsx');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('jest');
    });
  });

  describe('Pytest patterns', () => {
    it('should detect test_*.py files', () => {
      const result = detectTestFile('test_utils.py');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('pytest');
    });

    it('should detect *_test.py files', () => {
      const result = detectTestFile('utils_test.py');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('pytest');
    });

    it('should detect tests directory files', () => {
      const result = detectTestFile('tests/test_api.py');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('pytest');
    });
  });

  describe('Go patterns', () => {
    it('should detect _test.go files', () => {
      const result = detectTestFile('utils_test.go');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('go');
    });

    it('should detect nested _test.go files', () => {
      const result = detectTestFile('pkg/handler/api_test.go');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('go');
    });
  });

  describe('RSpec patterns', () => {
    it('should detect _spec.rb files', () => {
      const result = detectTestFile('user_spec.rb');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('rspec');
    });

    it('should detect spec directory files', () => {
      const result = detectTestFile('spec/models/user_spec.rb');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('rspec');
    });
  });

  describe('Non-test files', () => {
    it('should return null for regular TypeScript files', () => {
      expect(detectTestFile('src/utils.ts')).toBeNull();
    });

    it('should return null for regular JavaScript files', () => {
      expect(detectTestFile('src/index.js')).toBeNull();
    });

    it('should return null for Python files without test prefix/suffix', () => {
      expect(detectTestFile('utils.py')).toBeNull();
    });

    it('should return null for Go files without _test suffix', () => {
      expect(detectTestFile('utils.go')).toBeNull();
    });

    it('should return null for Ruby files without _spec suffix', () => {
      expect(detectTestFile('user.rb')).toBeNull();
    });

    it('should return null for config files', () => {
      expect(detectTestFile('jest.config.js')).toBeNull();
      expect(detectTestFile('package.json')).toBeNull();
    });
  });

  describe('Preferred framework', () => {
    it('should use preferred framework when specified', () => {
      const result = detectTestFile('src/utils.test.ts', 'vitest');
      expect(result?.framework).toBe('vitest');
    });

    it('should still detect if file matches preferred framework', () => {
      const result = detectTestFile('src/utils.test.ts', 'pytest');
      // Should still detect as jest since pytest patterns don't match .test.ts
      expect(result?.framework).toBe('jest');
    });
  });
});

describe('Source file inference', () => {
  it('should infer source file from .test.ts file', () => {
    const result = detectTestFile('src/utils.test.ts');
    expect(result?.sourceFile).toBe('src/utils.ts');
  });

  it('should infer source file from .spec.tsx file', () => {
    const result = detectTestFile('src/Component.spec.tsx');
    expect(result?.sourceFile).toBe('src/Component.tsx');
  });

  it('should infer source file from Go test', () => {
    const result = detectTestFile('pkg/handler/api_test.go');
    expect(result?.sourceFile).toBe('pkg/handler/api.go');
  });

  it('should infer source file from pytest test_prefix', () => {
    const result = detectTestFile('test_utils.py');
    expect(result?.sourceFile).toBe('utils.py');
  });

  it('should infer source file from pytest _test suffix', () => {
    const result = detectTestFile('api_test.py');
    expect(result?.sourceFile).toBe('api.py');
  });
});

describe('findTestFiles', () => {
  const changedFiles = [
    'src/index.ts',
    'src/utils.test.ts',
    'src/api.ts',
    'src/api.spec.ts',
    'package.json',
    'tests/integration.test.ts',
  ];

  it('should find all test files from a list', () => {
    const testFiles = findTestFiles(changedFiles);
    expect(testFiles).toHaveLength(3);
    expect(testFiles.map(f => f.path)).toContain('src/utils.test.ts');
    expect(testFiles.map(f => f.path)).toContain('src/api.spec.ts');
    expect(testFiles.map(f => f.path)).toContain('tests/integration.test.ts');
  });

  it('should use preferred framework when specified', () => {
    const testFiles = findTestFiles(changedFiles, 'vitest');
    expect(testFiles).toHaveLength(3);
    expect(testFiles.every(f => f.framework === 'vitest')).toBe(true);
  });

  it('should return empty array when no test files', () => {
    const testFiles = findTestFiles(['src/index.ts', 'package.json']);
    expect(testFiles).toHaveLength(0);
  });
});

describe('findSourceFiles', () => {
  const changedFiles = [
    'src/index.ts',
    'src/utils.test.ts',
    'src/api.ts',
    'src/api.spec.ts',
    'package.json',
  ];

  it('should find all non-test files', () => {
    const sourceFiles = findSourceFiles(changedFiles);
    expect(sourceFiles).toHaveLength(3);
    expect(sourceFiles).toContain('src/index.ts');
    expect(sourceFiles).toContain('src/api.ts');
    expect(sourceFiles).toContain('package.json');
  });

  it('should not include test files', () => {
    const sourceFiles = findSourceFiles(changedFiles);
    expect(sourceFiles).not.toContain('src/utils.test.ts');
    expect(sourceFiles).not.toContain('src/api.spec.ts');
  });
});

describe('isTestFile', () => {
  it('should return true for test files', () => {
    expect(isTestFile('src/utils.test.ts')).toBe(true);
    expect(isTestFile('test_api.py')).toBe(true);
    expect(isTestFile('handler_test.go')).toBe(true);
  });

  it('should return false for non-test files', () => {
    expect(isTestFile('src/utils.ts')).toBe(false);
    expect(isTestFile('api.py')).toBe(false);
    expect(isTestFile('handler.go')).toBe(false);
  });
});

describe('getTestPatterns', () => {
  it('should return patterns for jest', () => {
    const patterns = getTestPatterns('jest');
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(p => p.test('utils.test.ts'))).toBe(true);
  });

  it('should return patterns for pytest', () => {
    const patterns = getTestPatterns('pytest');
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(p => p.test('test_utils.py'))).toBe(true);
  });

  it('should return patterns for go', () => {
    const patterns = getTestPatterns('go');
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some(p => p.test('utils_test.go'))).toBe(true);
  });
});
