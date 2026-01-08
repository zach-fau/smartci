/**
 * Dependency graph module
 * Builds and queries a dependency graph from import analysis
 */

import { parseTypeScriptImports, parsePythonImports, resolveImportPath } from './imports.js';

/**
 * A node in the dependency graph
 */
export interface GraphNode {
  /** The file path */
  path: string;
  /** Files this node imports (dependencies) */
  imports: string[];
  /** Files that import this node (dependents) */
  importedBy: string[];
  /** External packages imported */
  externalDeps: string[];
  /** Language of the file */
  language: 'typescript' | 'python' | 'unknown';
}

/**
 * The dependency graph
 */
export interface DependencyGraph {
  /** All nodes in the graph */
  nodes: Map<string, GraphNode>;
  /** Metadata about the graph */
  metadata: {
    /** When the graph was built */
    builtAt: string;
    /** Root directory */
    rootDir: string;
    /** Total file count */
    fileCount: number;
  };
}

/**
 * Serializable version of the dependency graph for caching
 */
export interface SerializableGraph {
  nodes: Record<string, GraphNode>;
  metadata: DependencyGraph['metadata'];
}

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): 'typescript' | 'python' | 'unknown' {
  if (filePath.match(/\.[jt]sx?$/)) {
    return 'typescript';
  }
  if (filePath.endsWith('.py')) {
    return 'python';
  }
  return 'unknown';
}

/**
 * Normalize a file path for consistent graph keys
 */
export function normalizePath(filePath: string): string {
  // Remove leading ./ if present
  let normalized = filePath.replace(/^\.\//, '');

  // Normalize path separators
  normalized = normalized.replace(/\\/g, '/');

  return normalized;
}

/**
 * Try to resolve import to actual file path
 */
export function resolveModulePath(
  importPath: string,
  fromFile: string,
  availableFiles: Set<string>
): string | null {
  if (!importPath.startsWith('.')) {
    // External module
    return null;
  }

  const resolved = resolveImportPath(importPath, fromFile);
  const normalized = normalizePath(resolved);

  // Try exact match
  if (availableFiles.has(normalized)) {
    return normalized;
  }

  // Try with common extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '.py'];
  for (const ext of extensions) {
    const withExt = normalized + ext;
    if (availableFiles.has(withExt)) {
      return withExt;
    }
  }

  // Try removing extension and re-adding
  const withoutExt = normalized.replace(/\.[jt]sx?$/, '');
  for (const ext of extensions) {
    const withExt = withoutExt + ext;
    if (availableFiles.has(withExt)) {
      return withExt;
    }
  }

  return null;
}

/**
 * Build a dependency graph from file contents
 */
export function buildDependencyGraph(
  files: Map<string, string>,
  rootDir: string = ''
): DependencyGraph {
  const nodes = new Map<string, GraphNode>();
  const availableFiles = new Set(files.keys());

  // First pass: create nodes and extract imports
  for (const [filePath, content] of files) {
    const language = detectLanguage(filePath);
    const normalizedPath = normalizePath(filePath);

    if (language === 'unknown') {
      // Skip non-supported files
      continue;
    }

    const parser = language === 'typescript' ? parseTypeScriptImports : parsePythonImports;
    const imports = parser(content);

    const relativeImports: string[] = [];
    const externalDeps: string[] = [];

    for (const imp of imports) {
      if (imp.isRelative) {
        const resolved = resolveModulePath(imp.module, normalizedPath, availableFiles);
        if (resolved) {
          relativeImports.push(resolved);
        }
      } else {
        // Extract the package name (first part of the path)
        const packageName = imp.module.split('/')[0];
        if (!externalDeps.includes(packageName)) {
          externalDeps.push(packageName);
        }
      }
    }

    nodes.set(normalizedPath, {
      path: normalizedPath,
      imports: relativeImports,
      importedBy: [],
      externalDeps,
      language,
    });
  }

  // Second pass: populate importedBy (reverse dependencies)
  for (const [filePath, node] of nodes) {
    for (const importPath of node.imports) {
      const importedNode = nodes.get(importPath);
      if (importedNode && !importedNode.importedBy.includes(filePath)) {
        importedNode.importedBy.push(filePath);
      }
    }
  }

  return {
    nodes,
    metadata: {
      builtAt: new Date().toISOString(),
      rootDir,
      fileCount: nodes.size,
    },
  };
}

/**
 * Find all files that depend on a given file (directly or transitively)
 */
export function findDependents(
  graph: DependencyGraph,
  filePath: string,
  maxDepth: number = 10
): string[] {
  const normalizedPath = normalizePath(filePath);
  const dependents = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: normalizedPath, depth: 0 }];

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;

    if (visited.has(path) || depth > maxDepth) {
      continue;
    }
    visited.add(path);

    const node = graph.nodes.get(path);
    if (!node) {
      continue;
    }

    for (const dependent of node.importedBy) {
      if (!visited.has(dependent)) {
        dependents.add(dependent);
        queue.push({ path: dependent, depth: depth + 1 });
      }
    }
  }

  return Array.from(dependents);
}

/**
 * Find all files that a given file depends on (directly or transitively)
 */
export function findDependencies(
  graph: DependencyGraph,
  filePath: string,
  maxDepth: number = 10
): string[] {
  const normalizedPath = normalizePath(filePath);
  const dependencies = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ path: string; depth: number }> = [{ path: normalizedPath, depth: 0 }];

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!;

    if (visited.has(path) || depth > maxDepth) {
      continue;
    }
    visited.add(path);

    const node = graph.nodes.get(path);
    if (!node) {
      continue;
    }

    for (const dep of node.imports) {
      if (!visited.has(dep)) {
        dependencies.add(dep);
        queue.push({ path: dep, depth: depth + 1 });
      }
    }
  }

  return Array.from(dependencies);
}

/**
 * Find test files that might test a given source file
 */
export function findRelatedTests(
  graph: DependencyGraph,
  sourceFile: string,
  testFiles: string[]
): string[] {
  const normalizedSource = normalizePath(sourceFile);
  const relatedTests: string[] = [];

  // Normalize test file paths
  const normalizedTests = new Set(testFiles.map(normalizePath));

  // Find tests that import this file directly
  const node = graph.nodes.get(normalizedSource);
  if (node) {
    for (const dependent of node.importedBy) {
      if (normalizedTests.has(dependent)) {
        relatedTests.push(dependent);
      }
    }
  }

  // Find tests that import files which depend on this file
  const allDependents = findDependents(graph, normalizedSource);
  for (const dependent of allDependents) {
    if (normalizedTests.has(dependent)) {
      relatedTests.push(dependent);
    }
  }

  // Also check for test files with matching names
  const baseName = normalizedSource
    .replace(/\.[jt]sx?$/, '')
    .replace(/\.py$/, '');

  for (const testPath of normalizedTests) {
    // Check if test file name matches source file name
    if (
      testPath.includes(baseName + '.test') ||
      testPath.includes(baseName + '.spec') ||
      testPath.includes('test_' + baseName.split('/').pop())
    ) {
      if (!relatedTests.includes(testPath)) {
        relatedTests.push(testPath);
      }
    }
  }

  return relatedTests;
}

/**
 * Serialize graph for caching to JSON
 */
export function serializeGraph(graph: DependencyGraph): SerializableGraph {
  const nodes: Record<string, GraphNode> = {};

  for (const [key, value] of graph.nodes) {
    nodes[key] = value;
  }

  return {
    nodes,
    metadata: graph.metadata,
  };
}

/**
 * Deserialize graph from JSON cache
 */
export function deserializeGraph(data: SerializableGraph): DependencyGraph {
  const nodes = new Map<string, GraphNode>();

  for (const [key, value] of Object.entries(data.nodes)) {
    nodes.set(key, value);
  }

  return {
    nodes,
    metadata: data.metadata,
  };
}

/**
 * Get affected files from a list of changed files
 */
export function getAffectedFiles(
  graph: DependencyGraph,
  changedFiles: string[]
): {
  directlyAffected: string[];
  transitivelyAffected: string[];
  allAffected: string[];
} {
  const directlyAffected = new Set<string>();
  const transitivelyAffected = new Set<string>();

  for (const changedFile of changedFiles) {
    const normalized = normalizePath(changedFile);

    // The file itself is directly affected
    directlyAffected.add(normalized);

    // Find all dependents (files that import the changed file)
    const dependents = findDependents(graph, normalized);
    for (const dep of dependents) {
      if (!directlyAffected.has(dep)) {
        transitivelyAffected.add(dep);
      }
    }
  }

  return {
    directlyAffected: Array.from(directlyAffected),
    transitivelyAffected: Array.from(transitivelyAffected),
    allAffected: [...Array.from(directlyAffected), ...Array.from(transitivelyAffected)],
  };
}
