import { describe, it, expect } from 'vitest';
import { checkAlwaysRunPatterns, matchesPattern } from './index.js';

describe('matchesPattern', () => {
  it('should match exact filenames', () => {
    expect(matchesPattern('package.json', 'package.json')).toBe(true);
    expect(matchesPattern('package.json', 'package-lock.json')).toBe(false);
  });

  it('should match single wildcard patterns', () => {
    expect(matchesPattern('package-lock.json', '*.json')).toBe(true);
    expect(matchesPattern('tsconfig.json', '*.json')).toBe(true);
    expect(matchesPattern('src/index.ts', '*.json')).toBe(false);
  });

  it('should match extension patterns', () => {
    expect(matchesPattern('file.lock', '*.lock')).toBe(true);
    expect(matchesPattern('package-lock.json', '*.lock')).toBe(false);
  });

  it('should match config file patterns', () => {
    expect(matchesPattern('tsconfig.json', '*.config.*')).toBe(false);
    expect(matchesPattern('vitest.config.ts', '*.config.*')).toBe(true);
    expect(matchesPattern('jest.config.js', '*.config.*')).toBe(true);
  });

  it('should match globstar patterns', () => {
    expect(matchesPattern('.github/workflows/ci.yml', '.github/**')).toBe(true);
    expect(matchesPattern('.github/CODEOWNERS', '.github/**')).toBe(true);
    expect(matchesPattern('src/github/test.ts', '.github/**')).toBe(false);
  });

  it('should match nested globstar patterns', () => {
    expect(matchesPattern('src/deep/nested/file.ts', 'src/**/*.ts')).toBe(true);
    expect(matchesPattern('src/index.ts', 'src/**/*.ts')).toBe(true);
    expect(matchesPattern('tests/index.ts', 'src/**/*.ts')).toBe(false);
  });
});

describe('checkAlwaysRunPatterns', () => {
  const defaultPatterns = ['package.json', '*.lock', '*.config.*', '.github/**'];

  it('should return matching pattern when file matches', () => {
    expect(checkAlwaysRunPatterns(['package.json'], defaultPatterns)).toBe('package.json');
    expect(checkAlwaysRunPatterns(['pnpm-lock.yaml'], defaultPatterns)).toBe('*.lock');
  });

  it('should return null when no files match', () => {
    expect(checkAlwaysRunPatterns(['src/index.ts', 'src/utils.ts'], defaultPatterns)).toBe(null);
  });

  it('should check all files against all patterns', () => {
    const files = ['src/index.ts', '.github/workflows/test.yml'];
    expect(checkAlwaysRunPatterns(files, defaultPatterns)).toBe('.github/**');
  });

  it('should return first matching pattern', () => {
    const files = ['package.json', '.github/workflows/ci.yml'];
    // Should return package.json since it's checked first
    expect(checkAlwaysRunPatterns(files, defaultPatterns)).toBe('package.json');
  });

  it('should handle empty file list', () => {
    expect(checkAlwaysRunPatterns([], defaultPatterns)).toBe(null);
  });

  it('should handle empty pattern list', () => {
    expect(checkAlwaysRunPatterns(['package.json'], [])).toBe(null);
  });
});
