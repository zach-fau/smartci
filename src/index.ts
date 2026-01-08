import * as core from '@actions/core';
import { parseGitDiff } from './diff/parser.js';
import { getChangedFiles } from './diff/git.js';
import { findTestFiles, findSourceFiles, type TestFramework } from './detection/index.js';

/**
 * SmartCI - LLM-powered CI test selection
 *
 * This is the main entry point for the GitHub Action.
 * It analyzes git diffs and uses an LLM to determine which tests to run.
 */
async function run(): Promise<void> {
  try {
    core.info('SmartCI: Starting test selection analysis');

    // Get inputs
    const alwaysRunPatterns = core.getInput('always-run-patterns').split(',').map(p => p.trim());
    const confidenceThreshold = parseInt(core.getInput('confidence-threshold'), 10);
    const shadowMode = core.getInput('shadow-mode') === 'true';
    const testFramework = core.getInput('test-framework') as TestFramework;

    core.debug(`Always run patterns: ${alwaysRunPatterns.join(', ')}`);
    core.debug(`Confidence threshold: ${confidenceThreshold}`);
    core.debug(`Shadow mode: ${shadowMode}`);
    core.debug(`Test framework: ${testFramework}`);

    // Step 1: Get changed files from git diff
    const changedFiles = await getChangedFiles();

    if (changedFiles.length === 0) {
      core.info('No changed files detected. Running all tests.');
      core.setOutput('run-all', 'true');
      core.setOutput('tests-to-run', '');
      core.setOutput('tests-skipped', '0');
      return;
    }

    core.info(`Found ${changedFiles.length} changed files`);

    // Step 2: Check if any always-run patterns match
    const alwaysRunMatch = checkAlwaysRunPatterns(changedFiles, alwaysRunPatterns);
    if (alwaysRunMatch) {
      core.info(`Always-run pattern matched: ${alwaysRunMatch}. Running all tests.`);
      core.setOutput('run-all', 'true');
      core.setOutput('tests-to-run', '');
      core.setOutput('tests-skipped', '0');
      return;
    }

    // Step 3: Parse git diff for detailed change information
    const diffDetails = await parseGitDiff(changedFiles);
    core.info(`Parsed diff details for ${diffDetails.length} files`);

    // Step 4: Separate test files from source files
    const changedTestFiles = findTestFiles(changedFiles, testFramework);
    const changedSourceFiles = findSourceFiles(changedFiles, testFramework);

    core.info(`Changed test files: ${changedTestFiles.length}`);
    core.info(`Changed source files: ${changedSourceFiles.length}`);

    for (const testFile of changedTestFiles) {
      core.debug(`Test file: ${testFile.path} (${testFile.framework})`);
      if (testFile.sourceFile) {
        core.debug(`  -> Likely tests: ${testFile.sourceFile}`);
      }
    }

    // TODO: Step 5 - Build/load dependency graph
    // TODO: Step 6 - Send to LLM for test selection
    // TODO: Step 7 - Apply confidence threshold

    // For now, output changed test files as tests to run
    // Changed test files should always run, plus tests related to changed source files
    const testsToRun = changedTestFiles.map(t => t.path);

    core.setOutput('run-all', 'false');
    core.setOutput('tests-to-run', testsToRun.join(' '));
    core.setOutput('tests-skipped', '0');
    core.setOutput('time-saved-estimate', '0');
    core.setOutput('changed-source-files', changedSourceFiles.join(' '));
    core.setOutput('changed-test-files', changedTestFiles.map(t => t.path).join(' '));

    core.info('SmartCI: Analysis complete');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`SmartCI failed: ${error.message}`);
    } else {
      core.setFailed('SmartCI failed with an unknown error');
    }
  }
}

/**
 * Check if any changed files match the always-run patterns
 */
function checkAlwaysRunPatterns(changedFiles: string[], patterns: string[]): string | null {
  for (const file of changedFiles) {
    for (const pattern of patterns) {
      if (matchesPattern(file, pattern)) {
        return pattern;
      }
    }
  }
  return null;
}

/**
 * Glob-like pattern matching for file paths
 * Supports:
 * - * matches any characters except /
 * - ** matches any characters including / (globstar)
 * - ** followed by / matches zero or more path segments
 * - ? matches single character
 * - Literal dots and other characters are escaped
 */
function matchesPattern(file: string, pattern: string): boolean {
  // First, replace glob patterns with unique placeholders
  // Handle **/ (globstar followed by slash) - matches zero or more directories
  let regexPattern = pattern
    .replace(/\*\*\//g, '\u0000GLOBSTAR_SLASH\u0000')
    .replace(/\*\*/g, '\u0000GLOBSTAR\u0000')
    .replace(/\*/g, '\u0000STAR\u0000')
    .replace(/\?/g, '\u0000QUESTION\u0000');

  // Escape special regex characters
  regexPattern = regexPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Restore glob patterns as regex equivalents
  // **/ should match "anything/" or nothing (optional path segments)
  regexPattern = regexPattern
    .replace(/\u0000GLOBSTAR_SLASH\u0000/g, '(?:.*/)?')
    .replace(/\u0000GLOBSTAR\u0000/g, '.*')
    .replace(/\u0000STAR\u0000/g, '[^/]*')
    .replace(/\u0000QUESTION\u0000/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(file);
}

export { run, checkAlwaysRunPatterns, matchesPattern };

run();
