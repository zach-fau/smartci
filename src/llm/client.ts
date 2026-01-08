/**
 * Claude API client for test selection
 */

import Anthropic from '@anthropic-ai/sdk';
import type { FileDiff } from '../diff/parser.js';
import type { DependencyGraph } from '../analysis/graph.js';
import type { TestFile } from '../detection/testFiles.js';

/**
 * Test selection result from Claude
 */
export interface TestSelectionResult {
  /** List of test files to run */
  testsToRun: string[];
  /** Whether to run all tests (high uncertainty) */
  runAll: boolean;
  /** Confidence score (0-100) */
  confidence: number;
  /** Explanation of the reasoning */
  reasoning: string;
  /** Estimated time saved in seconds */
  timeSavedEstimate: number;
}

/**
 * Context for test selection prompt
 */
export interface TestSelectionContext {
  /** Changed files with diff details */
  changedFiles: FileDiff[];
  /** All available test files in the project */
  allTestFiles: string[];
  /** Test files that directly changed */
  changedTestFiles: TestFile[];
  /** Source files that changed (non-test) */
  changedSourceFiles: string[];
  /** Dependency graph for affected files */
  dependencyGraph?: DependencyGraph;
  /** Test file to source file mappings */
  testMappings: Map<string, string[]>;
}

/**
 * Claude client configuration
 */
export interface ClaudeClientConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-3-5-sonnet-20241022) */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
}

/**
 * Create the test selection prompt
 */
export function buildTestSelectionPrompt(context: TestSelectionContext): string {
  const {
    changedFiles,
    allTestFiles,
    changedTestFiles,
    changedSourceFiles,
    dependencyGraph,
    testMappings,
  } = context;

  let prompt = `You are an expert CI/CD engineer analyzing code changes to determine which tests need to run.

## Changed Files

`;

  // List changed source files with diff summary
  if (changedSourceFiles.length > 0) {
    prompt += `### Source Files Modified:\n`;
    for (const file of changedSourceFiles) {
      const diff = changedFiles.find(d => d.path === file);
      if (diff) {
        const additions = diff.hunks.reduce((sum, h) => sum + h.additions.length, 0);
        const deletions = diff.hunks.reduce((sum, h) => sum + h.deletions.length, 0);
        prompt += `- ${file} (+${additions}, -${deletions} lines)\n`;
      } else {
        prompt += `- ${file}\n`;
      }
    }
    prompt += '\n';
  }

  // List changed test files
  if (changedTestFiles.length > 0) {
    prompt += `### Test Files Modified:\n`;
    for (const testFile of changedTestFiles) {
      prompt += `- ${testFile.path}`;
      if (testFile.sourceFile) {
        prompt += ` (tests: ${testFile.sourceFile})`;
      }
      prompt += '\n';
    }
    prompt += '\n';
  }

  // Dependency information
  if (dependencyGraph && dependencyGraph.nodes.size > 0) {
    prompt += `### Dependency Information:\n`;

    for (const sourceFile of changedSourceFiles) {
      const node = dependencyGraph.nodes.get(sourceFile);
      if (node && node.importedBy.length > 0) {
        prompt += `- ${sourceFile} is imported by: ${node.importedBy.slice(0, 5).join(', ')}`;
        if (node.importedBy.length > 5) {
          prompt += ` (and ${node.importedBy.length - 5} more)`;
        }
        prompt += '\n';
      }
    }
    prompt += '\n';
  }

  // Test mappings
  if (testMappings.size > 0) {
    prompt += `### Test to Source Mappings:\n`;
    for (const [testFile, sourceFiles] of testMappings) {
      prompt += `- ${testFile} tests: ${sourceFiles.join(', ')}\n`;
    }
    prompt += '\n';
  }

  // All available tests
  prompt += `### All Available Tests (${allTestFiles.length} files):\n`;
  for (const testFile of allTestFiles.slice(0, 50)) {
    prompt += `- ${testFile}\n`;
  }
  if (allTestFiles.length > 50) {
    prompt += `... and ${allTestFiles.length - 50} more test files\n`;
  }

  prompt += `
## Instructions

Based on the code changes above, determine which test files need to run.

Rules:
1. Changed test files should ALWAYS run
2. Tests that import modified source files should run
3. Tests for files that depend on modified files may need to run
4. If unsure about impact, include the test (be conservative)
5. If changes affect core shared modules, recommend running all tests

Return your analysis in the following JSON format:
\`\`\`json
{
  "testsToRun": ["path/to/test1.test.ts", "path/to/test2.test.ts"],
  "runAll": false,
  "confidence": 85,
  "reasoning": "Brief explanation of why these tests were selected",
  "timeSavedEstimate": 120
}
\`\`\`

If you're uncertain about the impact (confidence < 60) or changes affect foundational code, set "runAll": true.
`;

  return prompt;
}

/**
 * Parse Claude's response to extract test selection
 */
export function parseTestSelectionResponse(response: string): TestSelectionResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        testsToRun: parsed.testsToRun || [],
        runAll: parsed.runAll ?? false,
        confidence: parsed.confidence ?? 50,
        reasoning: parsed.reasoning || 'No reasoning provided',
        timeSavedEstimate: parsed.timeSavedEstimate ?? 0,
      };
    } catch {
      // JSON parsing failed
    }
  }

  // Try to parse without code block
  try {
    const parsed = JSON.parse(response);
    return {
      testsToRun: parsed.testsToRun || [],
      runAll: parsed.runAll ?? false,
      confidence: parsed.confidence ?? 50,
      reasoning: parsed.reasoning || 'No reasoning provided',
      timeSavedEstimate: parsed.timeSavedEstimate ?? 0,
    };
  } catch {
    // Fallback: run all tests if we can't parse
    return {
      testsToRun: [],
      runAll: true,
      confidence: 0,
      reasoning: 'Failed to parse LLM response - running all tests for safety',
      timeSavedEstimate: 0,
    };
  }
}

/**
 * Call Claude API for test selection
 */
export async function selectTestsWithClaude(
  context: TestSelectionContext,
  config: ClaudeClientConfig
): Promise<TestSelectionResult> {
  const anthropic = new Anthropic({
    apiKey: config.apiKey,
  });

  const prompt = buildTestSelectionPrompt(context);

  try {
    const response = await anthropic.messages.create({
      model: config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: config.maxTokens || 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return {
        testsToRun: [],
        runAll: true,
        confidence: 0,
        reasoning: 'No text response from Claude',
        timeSavedEstimate: 0,
      };
    }

    return parseTestSelectionResponse(textContent.text);
  } catch (error) {
    // On API error, run all tests for safety
    return {
      testsToRun: [],
      runAll: true,
      confidence: 0,
      reasoning: `API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timeSavedEstimate: 0,
    };
  }
}

/**
 * Simple hash function for caching
 */
export function hashContext(context: TestSelectionContext): string {
  const data = JSON.stringify({
    changedFiles: context.changedFiles.map(f => f.path),
    changedTestFiles: context.changedTestFiles.map(t => t.path),
    changedSourceFiles: context.changedSourceFiles,
  });

  // Simple hash (not cryptographic, just for caching key)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}
