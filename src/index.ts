import * as core from '@actions/core';
import { parseGitDiff } from './diff/parser.js';
import { getChangedFiles } from './diff/git.js';

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

    core.debug(`Always run patterns: ${alwaysRunPatterns.join(', ')}`);
    core.debug(`Confidence threshold: ${confidenceThreshold}`);
    core.debug(`Shadow mode: ${shadowMode}`);

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

    // TODO: Step 4 - Build/load dependency graph
    // TODO: Step 5 - Send to LLM for test selection
    // TODO: Step 6 - Apply confidence threshold

    // For now, output changed files as a starting point
    core.setOutput('run-all', 'false');
    core.setOutput('tests-to-run', changedFiles.join(' '));
    core.setOutput('tests-skipped', '0');
    core.setOutput('time-saved-estimate', '0');

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
 * Simple glob-like pattern matching
 */
function matchesPattern(file: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(file);
}

export { run, checkAlwaysRunPatterns, matchesPattern };

run();
