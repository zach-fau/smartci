# SmartCI

LLM-powered CI test selection that analyzes git diffs to intelligently skip irrelevant tests, reducing CI time by 60-80%.

## The Problem

CI pipelines waste enormous time running every test on every commit:
- Engineering teams wait 10-30+ minutes for CI when only 10% of tests are affected
- This slows development velocity and wastes compute costs
- Existing solutions require training data (Launchable) or complete build rewrites (Bazel)

## The Solution

SmartCI uses Claude to understand semantic code relationships without any training data:

```yaml
# .github/workflows/test.yml
- uses: zach-fau/smartci@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    test-framework: jest
  id: smartci

- name: Run Tests
  run: npx jest ${{ steps.smartci.outputs.tests-to-run }}
```

## Features

- **Works immediately** - No training data or cold start period
- **Semantic understanding** - Knows that utility changes affect consumers
- **Conservative defaults** - When uncertain, runs more tests
- **Shadow mode** - Verify accuracy before skipping tests
- **Framework support** - Jest, pytest, Go tests (more coming)

## How It Works

1. Parses git diff to extract changed files and functions
2. Builds dependency graph using AST parsing (tree-sitter)
3. Maps test files to source files
4. Asks Claude which tests are affected by the changes
5. Applies safety rules (always-run patterns, confidence threshold)
6. Outputs filtered test list

## Configuration

```yaml
- uses: zach-fau/smartci@v1
  with:
    # Required
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

    # Optional
    test-framework: jest          # jest, pytest, go (default: jest)
    always-run-patterns: '*.lock,package.json,.github/**'
    confidence-threshold: '80'    # 0-100 (default: 80)
    shadow-mode: 'false'          # Run all but report what would skip
```

## Outputs

| Output | Description |
|--------|-------------|
| `tests-to-run` | Space-separated list of test files |
| `tests-skipped` | Number of tests skipped |
| `time-saved-estimate` | Estimated seconds saved |
| `run-all` | Whether running full suite |

## Safety Features

SmartCI is designed to be conservative:

1. **Always-run patterns** - Config changes, lock files trigger full suite
2. **Confidence threshold** - Below threshold runs all tests
3. **Shadow mode** - Prove accuracy before skipping
4. **Fallbacks** - Any error defaults to running all tests

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck
```

## Status

Currently in active development. See [Issues](https://github.com/zach-fau/smartci/issues) for roadmap.

## License

MIT
