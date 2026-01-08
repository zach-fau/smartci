/**
 * Dependency graph caching module
 * Handles loading/saving the dependency graph to disk
 */

import * as fs from 'fs';
import * as path from 'path';
import { serializeGraph, deserializeGraph, type DependencyGraph, type SerializableGraph } from './graph.js';

const CACHE_DIR = '.smartci';
const CACHE_FILE = 'graph.json';

/**
 * Get the cache file path
 */
export function getCachePath(rootDir: string = process.cwd()): string {
  return path.join(rootDir, CACHE_DIR, CACHE_FILE);
}

/**
 * Check if cache exists
 */
export function cacheExists(rootDir: string = process.cwd()): boolean {
  return fs.existsSync(getCachePath(rootDir));
}

/**
 * Load cached dependency graph
 */
export function loadGraphCache(rootDir: string = process.cwd()): DependencyGraph | null {
  const cachePath = getCachePath(rootDir);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(content) as SerializableGraph;
    return deserializeGraph(data);
  } catch {
    // Cache is corrupted or unreadable
    return null;
  }
}

/**
 * Save dependency graph to cache
 */
export function saveGraphCache(graph: DependencyGraph, rootDir: string = process.cwd()): void {
  const cacheDir = path.join(rootDir, CACHE_DIR);
  const cachePath = getCachePath(rootDir);

  // Ensure cache directory exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const serialized = serializeGraph(graph);
  fs.writeFileSync(cachePath, JSON.stringify(serialized, null, 2));
}

/**
 * Check if cache is stale based on package.json modification time
 */
export function isCacheStale(rootDir: string = process.cwd()): boolean {
  const cachePath = getCachePath(rootDir);
  const packageJsonPath = path.join(rootDir, 'package.json');

  if (!fs.existsSync(cachePath)) {
    return true;
  }

  // If no package.json, use a simple time-based check (1 hour)
  if (!fs.existsSync(packageJsonPath)) {
    const cacheStats = fs.statSync(cachePath);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return cacheStats.mtimeMs < oneHourAgo;
  }

  // Cache is stale if package.json is newer
  const cacheStats = fs.statSync(cachePath);
  const packageStats = fs.statSync(packageJsonPath);

  return packageStats.mtimeMs > cacheStats.mtimeMs;
}

/**
 * Clear the graph cache
 */
export function clearCache(rootDir: string = process.cwd()): void {
  const cachePath = getCachePath(rootDir);

  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }
}

/**
 * Get cache metadata
 */
export function getCacheMetadata(rootDir: string = process.cwd()): {
  exists: boolean;
  stale: boolean;
  age?: number;
  fileCount?: number;
} {
  const cachePath = getCachePath(rootDir);

  if (!fs.existsSync(cachePath)) {
    return { exists: false, stale: true };
  }

  const stats = fs.statSync(cachePath);
  const age = Date.now() - stats.mtimeMs;

  try {
    const content = fs.readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(content) as SerializableGraph;

    return {
      exists: true,
      stale: isCacheStale(rootDir),
      age,
      fileCount: Object.keys(data.nodes).length,
    };
  } catch {
    return { exists: true, stale: true, age };
  }
}
