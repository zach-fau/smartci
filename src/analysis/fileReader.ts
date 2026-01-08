/**
 * File reader module for collecting project source files
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectLanguage } from './graph.js';

/**
 * Default patterns to exclude from scanning
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  '.smartci',
  '.next',
  '.nuxt',
];

/**
 * File extensions to include in scanning
 */
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py'];

/**
 * Options for reading project files
 */
export interface ReadFilesOptions {
  /** Root directory to scan */
  rootDir: string;
  /** Directories to exclude */
  excludePatterns?: string[];
  /** Maximum depth to scan */
  maxDepth?: number;
  /** Only include these file extensions */
  extensions?: string[];
}

/**
 * Recursively read all source files from a directory
 */
export function readProjectFiles(options: ReadFilesOptions): Map<string, string> {
  const {
    rootDir,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    maxDepth = 20,
    extensions = SUPPORTED_EXTENSIONS,
  } = options;

  const files = new Map<string, string>();

  function scanDirectory(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Directory not readable
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      // Skip excluded directories
      if (excludePatterns.some(pattern => entry.name === pattern || relativePath.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        scanDirectory(fullPath, depth + 1);
      } else if (entry.isFile()) {
        // Check extension
        const ext = path.extname(entry.name);
        if (!extensions.includes(ext)) {
          continue;
        }

        // Check if it's a supported language
        if (detectLanguage(entry.name) === 'unknown') {
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Use forward slashes for consistency
          const normalizedPath = relativePath.replace(/\\/g, '/');
          files.set(normalizedPath, content);
        } catch {
          // File not readable
        }
      }
    }
  }

  scanDirectory(rootDir, 0);
  return files;
}

/**
 * Read specific files by path
 */
export function readFiles(filePaths: string[], rootDir: string): Map<string, string> {
  const files = new Map<string, string>();

  for (const filePath of filePaths) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const normalizedPath = filePath.replace(/\\/g, '/');
      files.set(normalizedPath, content);
    } catch {
      // File not readable
    }
  }

  return files;
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string, rootDir: string): boolean {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
  return fs.existsSync(fullPath);
}

/**
 * Get all TypeScript/JavaScript files in a directory
 */
export function getSourceFiles(rootDir: string, excludeTests: boolean = false): string[] {
  const files = readProjectFiles({ rootDir });
  let paths = Array.from(files.keys());

  if (excludeTests) {
    paths = paths.filter(p => !p.includes('.test.') && !p.includes('.spec.') && !p.includes('__tests__'));
  }

  return paths;
}

/**
 * Get all test files in a directory
 */
export function getTestFiles(rootDir: string): string[] {
  const files = readProjectFiles({ rootDir });
  return Array.from(files.keys()).filter(
    p => p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__') || p.includes('test_')
  );
}
