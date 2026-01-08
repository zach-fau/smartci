import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  validateConfig,
  generateSampleConfig,
  type SmartCIConfig,
} from './config.js';

describe('DEFAULT_CONFIG', () => {
  it('should have sensible default always-run patterns', () => {
    expect(DEFAULT_CONFIG.alwaysRunPatterns).toContain('package.json');
    expect(DEFAULT_CONFIG.alwaysRunPatterns).toContain('package-lock.json');
    expect(DEFAULT_CONFIG.alwaysRunPatterns).toContain('.github/**');
    expect(DEFAULT_CONFIG.alwaysRunPatterns).toContain('Dockerfile');
  });

  it('should have a reasonable confidence threshold', () => {
    expect(DEFAULT_CONFIG.confidenceThreshold).toBe(80);
  });

  it('should have shadow mode disabled by default', () => {
    expect(DEFAULT_CONFIG.shadowMode).toBe(false);
  });

  it('should have all features enabled by default', () => {
    expect(DEFAULT_CONFIG.features.llmSelection).toBe(true);
    expect(DEFAULT_CONFIG.features.dependencyAnalysis).toBe(true);
    expect(DEFAULT_CONFIG.features.caching).toBe(true);
  });

  it('should have a reasonable max skip ratio', () => {
    expect(DEFAULT_CONFIG.maxSkipRatio).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maxSkipRatio).toBeLessThanOrEqual(1);
  });
});

describe('validateConfig', () => {
  it('should validate a correct config', () => {
    const result = validateConfig(DEFAULT_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid confidence threshold', () => {
    const config: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      confidenceThreshold: -10,
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('confidenceThreshold must be between 0 and 100');
  });

  it('should reject confidence threshold over 100', () => {
    const config: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      confidenceThreshold: 150,
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid max skip ratio', () => {
    const config: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      maxSkipRatio: 1.5,
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('maxSkipRatio must be between 0 and 1');
  });

  it('should reject negative max skip ratio', () => {
    const config: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      maxSkipRatio: -0.5,
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid test framework', () => {
    const config: SmartCIConfig = {
      ...DEFAULT_CONFIG,
      testFramework: 'invalid' as any,
    };
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('testFramework'))).toBe(true);
  });

  it('should accept all valid test frameworks', () => {
    const frameworks = ['jest', 'pytest', 'go', 'vitest', 'auto'] as const;
    for (const framework of frameworks) {
      const config: SmartCIConfig = {
        ...DEFAULT_CONFIG,
        testFramework: framework,
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    }
  });
});

describe('generateSampleConfig', () => {
  it('should generate valid YAML', () => {
    const sample = generateSampleConfig();
    expect(sample).toContain('alwaysRunPatterns');
    expect(sample).toContain('confidenceThreshold');
    expect(sample).toContain('shadowMode');
    expect(sample).toContain('features');
  });

  it('should include comments', () => {
    const sample = generateSampleConfig();
    expect(sample).toContain('#');
  });

  it('should include example patterns', () => {
    const sample = generateSampleConfig();
    expect(sample).toContain('package.json');
    expect(sample).toContain('.github/**');
  });
});
