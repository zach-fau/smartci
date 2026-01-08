/**
 * Safety rules evaluation module
 */

import type { SmartCIConfig } from './config.js';
import type { TestSelectionResult } from '../llm/client.js';

/**
 * Result of safety check
 */
export interface SafetyCheckResult {
  /** Whether to proceed with test skipping */
  allowSkipping: boolean;
  /** Reason for the decision */
  reason: string;
  /** Original tests to run */
  originalTests: string[];
  /** Tests after safety rules applied */
  finalTests: string[];
  /** Tests that were added due to safety rules */
  addedTests: string[];
  /** Warning messages */
  warnings: string[];
}

/**
 * Check if any changed files match always-run patterns
 */
export function matchesAlwaysRunPattern(
  changedFiles: string[],
  patterns: string[]
): { matches: boolean; matchedPattern?: string; matchedFile?: string } {
  for (const file of changedFiles) {
    for (const pattern of patterns) {
      if (globMatch(file, pattern)) {
        return { matches: true, matchedPattern: pattern, matchedFile: file };
      }
    }
  }
  return { matches: false };
}

/**
 * Simple glob pattern matching
 */
function globMatch(file: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexPattern = pattern
    .replace(/\*\*\//g, '\u0000GLOBSTAR_SLASH\u0000')
    .replace(/\*\*/g, '\u0000GLOBSTAR\u0000')
    .replace(/\*/g, '\u0000STAR\u0000')
    .replace(/\?/g, '\u0000QUESTION\u0000');

  // Escape special regex characters
  regexPattern = regexPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Restore glob patterns as regex equivalents
  regexPattern = regexPattern
    .replace(/\u0000GLOBSTAR_SLASH\u0000/g, '(?:.*/)?')
    .replace(/\u0000GLOBSTAR\u0000/g, '.*')
    .replace(/\u0000STAR\u0000/g, '[^/]*')
    .replace(/\u0000QUESTION\u0000/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(file);
}

/**
 * Apply safety rules to test selection
 */
export function applySafetyRules(
  selection: TestSelectionResult,
  allTests: string[],
  changedFiles: string[],
  config: SmartCIConfig
): SafetyCheckResult {
  const warnings: string[] = [];
  const addedTests: string[] = [];
  let finalTests = [...selection.testsToRun];

  // Rule 1: Check always-run patterns
  const alwaysRunCheck = matchesAlwaysRunPattern(changedFiles, config.alwaysRunPatterns);
  if (alwaysRunCheck.matches) {
    return {
      allowSkipping: false,
      reason: `Always-run pattern matched: ${alwaysRunCheck.matchedPattern} (file: ${alwaysRunCheck.matchedFile})`,
      originalTests: selection.testsToRun,
      finalTests: allTests,
      addedTests: allTests.filter(t => !selection.testsToRun.includes(t)),
      warnings: [],
    };
  }

  // Rule 2: Check confidence threshold
  if (selection.confidence < config.confidenceThreshold) {
    return {
      allowSkipping: false,
      reason: `Confidence ${selection.confidence}% below threshold ${config.confidenceThreshold}%`,
      originalTests: selection.testsToRun,
      finalTests: allTests,
      addedTests: allTests.filter(t => !selection.testsToRun.includes(t)),
      warnings: [],
    };
  }

  // Rule 3: Check if runAll is set
  if (selection.runAll) {
    return {
      allowSkipping: false,
      reason: selection.reasoning || 'LLM recommended running all tests',
      originalTests: selection.testsToRun,
      finalTests: allTests,
      addedTests: allTests.filter(t => !selection.testsToRun.includes(t)),
      warnings: [],
    };
  }

  // Rule 4: Add critical tests
  for (const criticalTest of config.criticalTests) {
    if (!finalTests.includes(criticalTest)) {
      if (allTests.includes(criticalTest)) {
        finalTests.push(criticalTest);
        addedTests.push(criticalTest);
      } else {
        warnings.push(`Critical test not found: ${criticalTest}`);
      }
    }
  }

  // Rule 5: Remove skip tests (if explicitly configured)
  if (config.skipTests.length > 0) {
    const beforeCount = finalTests.length;
    finalTests = finalTests.filter(t => !config.skipTests.includes(t));
    if (beforeCount !== finalTests.length) {
      warnings.push(`Removed ${beforeCount - finalTests.length} skipped test(s)`);
    }
  }

  // Rule 6: Check max skip ratio
  const skipRatio = 1 - (finalTests.length / allTests.length);
  if (skipRatio > config.maxSkipRatio) {
    const minTests = Math.ceil(allTests.length * (1 - config.maxSkipRatio));
    const neededTests = minTests - finalTests.length;

    if (neededTests > 0) {
      // Add random tests to meet minimum
      const availableTests = allTests.filter(t => !finalTests.includes(t));
      const additionalTests = availableTests.slice(0, neededTests);
      finalTests.push(...additionalTests);
      addedTests.push(...additionalTests);
      warnings.push(
        `Added ${neededTests} test(s) to meet max skip ratio of ${config.maxSkipRatio * 100}%`
      );
    }
  }

  // Shadow mode: run all tests but report what would be skipped
  if (config.shadowMode) {
    const wouldSkip = allTests.filter(t => !finalTests.includes(t));
    return {
      allowSkipping: false,
      reason: `Shadow mode enabled - would have skipped ${wouldSkip.length} test(s)`,
      originalTests: selection.testsToRun,
      finalTests: allTests,
      addedTests: wouldSkip,
      warnings: [
        `Shadow mode: Would have run ${finalTests.length}/${allTests.length} tests`,
        `Shadow mode: Would have skipped: ${wouldSkip.join(', ')}`,
      ],
    };
  }

  return {
    allowSkipping: true,
    reason: `Confidence ${selection.confidence}% meets threshold, ${finalTests.length}/${allTests.length} tests selected`,
    originalTests: selection.testsToRun,
    finalTests,
    addedTests,
    warnings,
  };
}

/**
 * Quick safety check without full rule evaluation
 */
export function quickSafetyCheck(
  changedFiles: string[],
  config: SmartCIConfig
): { safe: boolean; reason?: string } {
  // Check always-run patterns
  const alwaysRunCheck = matchesAlwaysRunPattern(changedFiles, config.alwaysRunPatterns);
  if (alwaysRunCheck.matches) {
    return {
      safe: false,
      reason: `Always-run pattern: ${alwaysRunCheck.matchedPattern}`,
    };
  }

  // Check for too many changed files (likely a major refactor)
  if (changedFiles.length > 50) {
    return {
      safe: false,
      reason: `Too many changed files (${changedFiles.length}), running all tests`,
    };
  }

  return { safe: true };
}

/**
 * Generate a safety report
 */
export function generateSafetyReport(result: SafetyCheckResult): string {
  let report = '## SmartCI Safety Report\n\n';

  report += `**Decision**: ${result.allowSkipping ? 'Skipping enabled' : 'Running all tests'}\n`;
  report += `**Reason**: ${result.reason}\n\n`;

  report += `### Test Summary\n`;
  report += `- Original selection: ${result.originalTests.length} tests\n`;
  report += `- Final selection: ${result.finalTests.length} tests\n`;

  if (result.addedTests.length > 0) {
    report += `- Added by safety rules: ${result.addedTests.length} tests\n`;
    report += `  - ${result.addedTests.join('\n  - ')}\n`;
  }

  if (result.warnings.length > 0) {
    report += `\n### Warnings\n`;
    for (const warning of result.warnings) {
      report += `- ${warning}\n`;
    }
  }

  return report;
}
