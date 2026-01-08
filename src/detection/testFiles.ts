/**
 * Test file detection module
 * Detects test files from various test frameworks
 */

/**
 * Supported test frameworks and their file patterns
 */
export type TestFramework = 'jest' | 'pytest' | 'go' | 'vitest' | 'mocha' | 'rspec';

/**
 * Test file detection result
 */
export interface TestFile {
  /** Path to the test file */
  path: string;
  /** Detected test framework */
  framework: TestFramework | 'unknown';
  /** The source file this test might be testing (if detectable) */
  sourceFile?: string;
}

/**
 * Framework-specific test file patterns
 */
const FRAMEWORK_PATTERNS: Record<TestFramework, RegExp[]> = {
  jest: [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\/.*\.[jt]sx?$/,
  ],
  vitest: [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\/.*\.[jt]sx?$/,
  ],
  mocha: [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /test\/.*\.[jt]sx?$/,
  ],
  pytest: [
    /test_.*\.py$/,
    /.*_test\.py$/,
    /tests\/.*\.py$/,
  ],
  go: [
    /_test\.go$/,
  ],
  rspec: [
    /_spec\.rb$/,
    /spec\/.*_spec\.rb$/,
  ],
};

/**
 * Detect if a file is a test file and which framework it belongs to
 */
export function detectTestFile(filePath: string, preferredFramework?: TestFramework): TestFile | null {
  // If preferred framework is specified, check it first
  if (preferredFramework) {
    const patterns = FRAMEWORK_PATTERNS[preferredFramework];
    for (const pattern of patterns) {
      if (pattern.test(filePath)) {
        return {
          path: filePath,
          framework: preferredFramework,
          sourceFile: inferSourceFile(filePath, preferredFramework),
        };
      }
    }
  }

  // Check all frameworks
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(filePath)) {
        return {
          path: filePath,
          framework: framework as TestFramework,
          sourceFile: inferSourceFile(filePath, framework as TestFramework),
        };
      }
    }
  }

  return null;
}

/**
 * Filter changed files to find only test files
 */
export function findTestFiles(changedFiles: string[], preferredFramework?: TestFramework): TestFile[] {
  const testFiles: TestFile[] = [];

  for (const file of changedFiles) {
    const testFile = detectTestFile(file, preferredFramework);
    if (testFile) {
      testFiles.push(testFile);
    }
  }

  return testFiles;
}

/**
 * Filter changed files to find only source files (non-test files)
 */
export function findSourceFiles(changedFiles: string[], preferredFramework?: TestFramework): string[] {
  return changedFiles.filter(file => detectTestFile(file, preferredFramework) === null);
}

/**
 * Infer the source file that a test file is testing
 */
function inferSourceFile(testPath: string, framework: TestFramework): string | undefined {
  switch (framework) {
    case 'jest':
    case 'vitest':
    case 'mocha': {
      // Remove .test. or .spec. suffix
      // e.g., src/utils.test.ts -> src/utils.ts
      const match = testPath.match(/^(.+)\.(test|spec)\.[jt]sx?$/);
      if (match) {
        // Try to determine extension from test file
        const ext = testPath.endsWith('x') ? testPath.slice(-3) : testPath.slice(-2);
        return `${match[1]}.${ext.replace('test.', '').replace('spec.', '')}`;
      }
      // Handle __tests__ directory
      // e.g., src/__tests__/utils.ts -> src/utils.ts
      const testsMatch = testPath.match(/^(.+)\/__tests__\/(.+)\.[jt]sx?$/);
      if (testsMatch) {
        const ext = testPath.endsWith('x') ? testPath.slice(-3) : testPath.slice(-2);
        return `${testsMatch[1]}/${testsMatch[2]}.${ext}`;
      }
      return undefined;
    }
    case 'pytest': {
      // e.g., test_utils.py -> utils.py or tests/test_utils.py -> utils.py
      const prefixMatch = testPath.match(/test_(.+)\.py$/);
      if (prefixMatch) {
        return `${prefixMatch[1]}.py`;
      }
      const suffixMatch = testPath.match(/(.+)_test\.py$/);
      if (suffixMatch) {
        return `${suffixMatch[1]}.py`;
      }
      return undefined;
    }
    case 'go': {
      // e.g., utils_test.go -> utils.go
      const match = testPath.match(/^(.+)_test\.go$/);
      if (match) {
        return `${match[1]}.go`;
      }
      return undefined;
    }
    case 'rspec': {
      // e.g., spec/utils_spec.rb -> lib/utils.rb or app/utils.rb
      const match = testPath.match(/_spec\.rb$/);
      if (match) {
        return testPath.replace(/_spec\.rb$/, '.rb').replace(/^spec\//, '');
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Get all supported test file patterns for a framework
 */
export function getTestPatterns(framework: TestFramework): RegExp[] {
  return FRAMEWORK_PATTERNS[framework] || [];
}

/**
 * Check if a file matches any test pattern
 */
export function isTestFile(filePath: string): boolean {
  return detectTestFile(filePath) !== null;
}
