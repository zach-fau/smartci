import { describe, it, expect } from 'vitest';
import {
  buildDependencyGraph,
  findDependents,
  findDependencies,
  findRelatedTests,
  getAffectedFiles,
  serializeGraph,
  deserializeGraph,
  detectLanguage,
  normalizePath,
} from './graph.js';

describe('detectLanguage', () => {
  it('should detect TypeScript files', () => {
    expect(detectLanguage('src/index.ts')).toBe('typescript');
    expect(detectLanguage('src/component.tsx')).toBe('typescript');
  });

  it('should detect JavaScript files', () => {
    expect(detectLanguage('src/index.js')).toBe('typescript');
    expect(detectLanguage('src/component.jsx')).toBe('typescript');
  });

  it('should detect Python files', () => {
    expect(detectLanguage('src/main.py')).toBe('python');
  });

  it('should return unknown for other files', () => {
    expect(detectLanguage('src/styles.css')).toBe('unknown');
    expect(detectLanguage('package.json')).toBe('unknown');
    expect(detectLanguage('README.md')).toBe('unknown');
  });
});

describe('normalizePath', () => {
  it('should remove leading ./', () => {
    expect(normalizePath('./src/index.ts')).toBe('src/index.ts');
  });

  it('should normalize backslashes', () => {
    expect(normalizePath('src\\utils\\index.ts')).toBe('src/utils/index.ts');
  });

  it('should handle already normalized paths', () => {
    expect(normalizePath('src/index.ts')).toBe('src/index.ts');
  });
});

describe('buildDependencyGraph', () => {
  it('should build a graph from file contents', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { helper } from './utils';`],
      ['src/utils.ts', `export function helper() {}`],
    ]);

    const graph = buildDependencyGraph(files);

    expect(graph.nodes.size).toBe(2);
    expect(graph.metadata.fileCount).toBe(2);
  });

  it('should track imports correctly', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { helper } from './utils';`],
      ['src/utils.ts', `export function helper() {}`],
    ]);

    const graph = buildDependencyGraph(files);

    const indexNode = graph.nodes.get('src/index.ts');
    expect(indexNode?.imports).toContain('src/utils.ts');
  });

  it('should track importedBy correctly', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { helper } from './utils';`],
      ['src/utils.ts', `export function helper() {}`],
    ]);

    const graph = buildDependencyGraph(files);

    const utilsNode = graph.nodes.get('src/utils.ts');
    expect(utilsNode?.importedBy).toContain('src/index.ts');
  });

  it('should track external dependencies', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import React from 'react';`],
    ]);

    const graph = buildDependencyGraph(files);

    const node = graph.nodes.get('src/index.ts');
    expect(node?.externalDeps).toContain('react');
  });

  it('should handle complex dependency chains', () => {
    const files = new Map<string, string>([
      ['src/app.ts', `
        import { api } from './api';
        import { utils } from './utils';
      `],
      ['src/api.ts', `
        import { utils } from './utils';
        export const api = {};
      `],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);

    const utilsNode = graph.nodes.get('src/utils.ts');
    expect(utilsNode?.importedBy).toContain('src/app.ts');
    expect(utilsNode?.importedBy).toContain('src/api.ts');
  });

  it('should handle Python files', () => {
    const files = new Map<string, string>([
      ['src/main.py', `from .utils import helper`],
      ['src/utils.py', `def helper(): pass`],
    ]);

    const graph = buildDependencyGraph(files);

    expect(graph.nodes.size).toBe(2);
    const mainNode = graph.nodes.get('src/main.py');
    expect(mainNode?.language).toBe('python');
  });
});

describe('findDependents', () => {
  it('should find direct dependents', () => {
    const files = new Map<string, string>([
      ['src/app.ts', `import { utils } from './utils';`],
      ['src/api.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const dependents = findDependents(graph, 'src/utils.ts');

    expect(dependents).toContain('src/app.ts');
    expect(dependents).toContain('src/api.ts');
  });

  it('should find transitive dependents', () => {
    const files = new Map<string, string>([
      ['src/app.ts', `import { api } from './api';`],
      ['src/api.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const dependents = findDependents(graph, 'src/utils.ts');

    expect(dependents).toContain('src/api.ts');
    expect(dependents).toContain('src/app.ts');
  });

  it('should handle circular dependencies', () => {
    const files = new Map<string, string>([
      ['src/a.ts', `import { b } from './b'; export const a = {};`],
      ['src/b.ts', `import { a } from './a'; export const b = {};`],
    ]);

    const graph = buildDependencyGraph(files);

    // Should not infinite loop
    const dependents = findDependents(graph, 'src/a.ts');
    expect(dependents).toContain('src/b.ts');
  });

  it('should respect maxDepth', () => {
    const files = new Map<string, string>([
      ['src/l1.ts', `import { l2 } from './l2';`],
      ['src/l2.ts', `import { l3 } from './l3';`],
      ['src/l3.ts', `import { l4 } from './l4';`],
      ['src/l4.ts', `export const l4 = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const dependents = findDependents(graph, 'src/l4.ts', 1);

    expect(dependents).toContain('src/l3.ts');
    // l2 should be found at depth 2
  });
});

describe('findDependencies', () => {
  it('should find direct dependencies', () => {
    const files = new Map<string, string>([
      ['src/app.ts', `
        import { api } from './api';
        import { utils } from './utils';
      `],
      ['src/api.ts', `export const api = {};`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const deps = findDependencies(graph, 'src/app.ts');

    expect(deps).toContain('src/api.ts');
    expect(deps).toContain('src/utils.ts');
  });

  it('should find transitive dependencies', () => {
    const files = new Map<string, string>([
      ['src/app.ts', `import { api } from './api';`],
      ['src/api.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const deps = findDependencies(graph, 'src/app.ts');

    expect(deps).toContain('src/api.ts');
    expect(deps).toContain('src/utils.ts');
  });
});

describe('findRelatedTests', () => {
  it('should find tests that import the source file', () => {
    const files = new Map<string, string>([
      ['src/utils.ts', `export function helper() {}`],
      ['src/utils.test.ts', `import { helper } from './utils';`],
    ]);

    const graph = buildDependencyGraph(files);
    const tests = findRelatedTests(graph, 'src/utils.ts', ['src/utils.test.ts']);

    expect(tests).toContain('src/utils.test.ts');
  });

  it('should find tests for transitive dependents', () => {
    const files = new Map<string, string>([
      ['src/utils.ts', `export const utils = {};`],
      ['src/api.ts', `import { utils } from './utils';`],
      ['src/api.test.ts', `import { api } from './api';`],
    ]);

    const graph = buildDependencyGraph(files);
    const tests = findRelatedTests(graph, 'src/utils.ts', ['src/api.test.ts']);

    expect(tests).toContain('src/api.test.ts');
  });

  it('should find tests by naming convention', () => {
    const files = new Map<string, string>([
      ['src/utils.ts', `export const utils = {};`],
      ['src/utils.test.ts', `// test file`],
    ]);

    const graph = buildDependencyGraph(files);
    const tests = findRelatedTests(graph, 'src/utils.ts', ['src/utils.test.ts']);

    expect(tests).toContain('src/utils.test.ts');
  });
});

describe('getAffectedFiles', () => {
  it('should return changed files as directly affected', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const affected = getAffectedFiles(graph, ['src/utils.ts']);

    expect(affected.directlyAffected).toContain('src/utils.ts');
  });

  it('should return dependents as transitively affected', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const affected = getAffectedFiles(graph, ['src/utils.ts']);

    expect(affected.transitivelyAffected).toContain('src/index.ts');
  });

  it('should combine all affected files', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const affected = getAffectedFiles(graph, ['src/utils.ts']);

    expect(affected.allAffected).toContain('src/utils.ts');
    expect(affected.allAffected).toContain('src/index.ts');
  });
});

describe('serialization', () => {
  it('should serialize and deserialize a graph', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const original = buildDependencyGraph(files);
    const serialized = serializeGraph(original);
    const deserialized = deserializeGraph(serialized);

    expect(deserialized.nodes.size).toBe(original.nodes.size);
    expect(deserialized.metadata.fileCount).toBe(original.metadata.fileCount);

    const indexNode = deserialized.nodes.get('src/index.ts');
    expect(indexNode?.imports).toContain('src/utils.ts');
  });

  it('should produce valid JSON', () => {
    const files = new Map<string, string>([
      ['src/index.ts', `import { utils } from './utils';`],
      ['src/utils.ts', `export const utils = {};`],
    ]);

    const graph = buildDependencyGraph(files);
    const serialized = serializeGraph(graph);

    // Should not throw
    const jsonString = JSON.stringify(serialized);
    const parsed = JSON.parse(jsonString);

    expect(parsed.nodes).toBeDefined();
    expect(parsed.metadata).toBeDefined();
  });
});
