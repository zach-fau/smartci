/**
 * SmartCI configuration and safety rules
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/**
 * SmartCI configuration file structure
 */
export interface SmartCIConfig {
  /** Patterns that always trigger full test suite */
  alwaysRunPatterns: string[];
  /** Confidence threshold (0-100). Below this, run all tests */
  confidenceThreshold: number;
  /** Shadow mode - run all tests but report what would be skipped */
  shadowMode: boolean;
  /** Test files marked as critical (always run) */
  criticalTests: string[];
  /** Tests to always skip (e.g., flaky tests) */
  skipTests: string[];
  /** Maximum number of tests to skip per run */
  maxSkipRatio: number;
  /** Framework-specific settings */
  testFramework: 'jest' | 'pytest' | 'go' | 'vitest' | 'auto';
  /** Enable/disable features */
  features: {
    /** Use LLM for test selection */
    llmSelection: boolean;
    /** Use dependency graph */
    dependencyAnalysis: boolean;
    /** Cache dependency graph */
    caching: boolean;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: SmartCIConfig = {
  alwaysRunPatterns: [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '*.config.js',
    '*.config.ts',
    '*.config.mjs',
    'tsconfig.json',
    'tsconfig.*.json',
    '.github/**',
    'Dockerfile',
    'docker-compose*.yml',
    'requirements.txt',
    'requirements*.txt',
    'setup.py',
    'pyproject.toml',
    'go.mod',
    'go.sum',
    'Gemfile',
    'Gemfile.lock',
  ],
  confidenceThreshold: 80,
  shadowMode: false,
  criticalTests: [],
  skipTests: [],
  maxSkipRatio: 0.9, // Max 90% of tests can be skipped
  testFramework: 'auto',
  features: {
    llmSelection: true,
    dependencyAnalysis: true,
    caching: true,
  },
};

/**
 * Load configuration from .smartci.yml or .smartci.yaml
 */
export function loadConfig(rootDir: string = process.cwd()): SmartCIConfig {
  const configPaths = [
    path.join(rootDir, '.smartci.yml'),
    path.join(rootDir, '.smartci.yaml'),
    path.join(rootDir, 'smartci.yml'),
    path.join(rootDir, 'smartci.yaml'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = yaml.parse(content) || {};
        return mergeConfig(DEFAULT_CONFIG, parsed);
      } catch (error) {
        console.warn(`Warning: Failed to parse ${configPath}:`, error);
      }
    }
  }

  // Return default config if no file found
  return { ...DEFAULT_CONFIG };
}

/**
 * Merge user config with defaults (deep merge)
 */
function mergeConfig(defaults: SmartCIConfig, user: Partial<SmartCIConfig>): SmartCIConfig {
  return {
    alwaysRunPatterns: user.alwaysRunPatterns ?? defaults.alwaysRunPatterns,
    confidenceThreshold: user.confidenceThreshold ?? defaults.confidenceThreshold,
    shadowMode: user.shadowMode ?? defaults.shadowMode,
    criticalTests: user.criticalTests ?? defaults.criticalTests,
    skipTests: user.skipTests ?? defaults.skipTests,
    maxSkipRatio: user.maxSkipRatio ?? defaults.maxSkipRatio,
    testFramework: user.testFramework ?? defaults.testFramework,
    features: {
      ...defaults.features,
      ...user.features,
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: SmartCIConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.confidenceThreshold < 0 || config.confidenceThreshold > 100) {
    errors.push('confidenceThreshold must be between 0 and 100');
  }

  if (config.maxSkipRatio < 0 || config.maxSkipRatio > 1) {
    errors.push('maxSkipRatio must be between 0 and 1');
  }

  const validFrameworks = ['jest', 'pytest', 'go', 'vitest', 'auto'];
  if (!validFrameworks.includes(config.testFramework)) {
    errors.push(`testFramework must be one of: ${validFrameworks.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a sample configuration file
 */
export function generateSampleConfig(): string {
  return `# SmartCI Configuration
# Place this file at .smartci.yml in your repository root

# Patterns that always trigger full test suite
# These are glob patterns matched against changed file paths
alwaysRunPatterns:
  - package.json
  - package-lock.json
  - yarn.lock
  - "*.config.*"
  - tsconfig.json
  - .github/**
  - Dockerfile

# Confidence threshold (0-100)
# Below this threshold, all tests will run
confidenceThreshold: 80

# Shadow mode - run all tests but report what would have been skipped
# Useful for validating SmartCI before enabling skip mode
shadowMode: false

# Tests marked as critical (always run regardless of changes)
criticalTests: []
  # - tests/critical/auth.test.ts
  # - tests/e2e/checkout.test.ts

# Tests to always skip (e.g., known flaky tests)
skipTests: []
  # - tests/flaky/network.test.ts

# Maximum ratio of tests that can be skipped (0-1)
# Set to 0.5 to ensure at least 50% of tests always run
maxSkipRatio: 0.9

# Test framework (auto-detected if not specified)
# Options: jest, pytest, go, vitest, auto
testFramework: auto

# Feature toggles
features:
  # Use LLM (Claude) for intelligent test selection
  llmSelection: true
  # Use static dependency analysis
  dependencyAnalysis: true
  # Cache dependency graph for faster analysis
  caching: true
`;
}

/**
 * Save configuration to file
 */
export function saveConfig(config: SmartCIConfig, rootDir: string = process.cwd()): void {
  const configPath = path.join(rootDir, '.smartci.yml');
  const content = yaml.stringify(config);
  fs.writeFileSync(configPath, content);
}
