/**
 * Import/export analysis module
 * Extracts imports and exports from source files using regex patterns
 */

/**
 * Represents an import statement
 */
export interface ImportInfo {
  /** The module being imported (path or package name) */
  module: string;
  /** Named imports (e.g., { foo, bar }) */
  namedImports: string[];
  /** Default import name (if any) */
  defaultImport?: string;
  /** Whether this is a type-only import (TypeScript) */
  isTypeOnly: boolean;
  /** Whether this is a relative import (starts with ./ or ../) */
  isRelative: boolean;
  /** The original import statement */
  raw: string;
}

/**
 * Represents an export statement
 */
export interface ExportInfo {
  /** Named exports (e.g., export { foo, bar }) */
  namedExports: string[];
  /** Default export name (if identifiable) */
  defaultExport?: string;
  /** Re-exports from another module */
  reExportFrom?: string;
  /** The original export statement */
  raw: string;
}

/**
 * Parse TypeScript/JavaScript imports from file content
 */
export function parseTypeScriptImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // Match ES6 imports: import X from 'Y', import { X } from 'Y', import * as X from 'Y'
  // Also handles type-only imports: import type { X } from 'Y'
  const importRegex = /import\s+(type\s+)?(?:(\*\s+as\s+\w+)|({[^}]+})|(\w+)(?:\s*,\s*({[^}]+}))?)?\s*(?:from\s+)?['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const [raw, typeOnly, starImport, namedImports1, defaultImport, namedImports2, modulePath] = match;

    const namedImports: string[] = [];
    const namedPart = namedImports1 || namedImports2;

    if (namedPart) {
      // Extract names from { foo, bar as baz, ... }
      const names = namedPart
        .slice(1, -1) // Remove { }
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0)
        .map(n => {
          // Handle 'foo as bar' -> 'bar'
          const parts = n.split(/\s+as\s+/);
          return parts[parts.length - 1].trim();
        });
      namedImports.push(...names);
    }

    imports.push({
      module: modulePath,
      namedImports,
      defaultImport: defaultImport || (starImport ? starImport.replace(/\*\s+as\s+/, '') : undefined),
      isTypeOnly: !!typeOnly,
      isRelative: modulePath.startsWith('.') || modulePath.startsWith('/'),
      raw,
    });
  }

  // Match require() calls: const X = require('Y')
  const requireRegex = /(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  while ((match = requireRegex.exec(content)) !== null) {
    const [raw, namedPart, defaultName, modulePath] = match;

    const namedImports: string[] = [];
    if (namedPart) {
      const names = namedPart
        .split(',')
        .map(n => n.trim())
        .filter(n => n.length > 0);
      namedImports.push(...names);
    }

    imports.push({
      module: modulePath,
      namedImports,
      defaultImport: defaultName,
      isTypeOnly: false,
      isRelative: modulePath.startsWith('.') || modulePath.startsWith('/'),
      raw,
    });
  }

  return imports;
}

/**
 * Parse Python imports from file content
 */
export function parsePythonImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // Match: from X import Y, Z or from X import (Y, Z)
  const fromImportRegex = /from\s+([\w.]+)\s+import\s+(?:\(([^)]+)\)|([^\n]+))/g;

  let match;
  while ((match = fromImportRegex.exec(content)) !== null) {
    const [raw, modulePath, parenNames, inlineNames] = match;
    const namesPart = parenNames || inlineNames;

    const namedImports = namesPart
      .split(',')
      .map(n => n.trim())
      .filter(n => n.length > 0 && n !== '*')
      .map(n => {
        // Handle 'foo as bar' -> 'bar'
        const parts = n.split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      });

    imports.push({
      module: modulePath,
      namedImports,
      isTypeOnly: false,
      isRelative: modulePath.startsWith('.'),
      raw,
    });
  }

  // Match: import X, Y or import X as Y
  const directImportRegex = /^import\s+([\w., ]+)$/gm;

  while ((match = directImportRegex.exec(content)) !== null) {
    const [raw, moduleList] = match;

    const modules = moduleList
      .split(',')
      .map(m => m.trim())
      .filter(m => m.length > 0);

    for (const mod of modules) {
      // Handle 'foo as bar'
      const parts = mod.split(/\s+as\s+/);
      const modulePath = parts[0].trim();

      imports.push({
        module: modulePath,
        namedImports: [],
        defaultImport: parts.length > 1 ? parts[1].trim() : modulePath,
        isTypeOnly: false,
        isRelative: modulePath.startsWith('.'),
        raw,
      });
    }
  }

  return imports;
}

/**
 * Parse TypeScript/JavaScript exports from file content
 */
export function parseTypeScriptExports(content: string): ExportInfo[] {
  const exports: ExportInfo[] = [];

  // Match: export { foo, bar } or export { foo, bar } from 'module'
  const namedExportRegex = /export\s+(?:type\s+)?{([^}]+)}(?:\s+from\s+['"]([^'"]+)['"])?/g;

  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    const [raw, names, fromModule] = match;

    const namedExports = names
      .split(',')
      .map(n => n.trim())
      .filter(n => n.length > 0)
      .map(n => {
        const parts = n.split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      });

    exports.push({
      namedExports,
      reExportFrom: fromModule,
      raw,
    });
  }

  // Match: export default X
  const defaultExportRegex = /export\s+default\s+(?:class|function|const|let|var)?\s*(\w+)?/g;

  while ((match = defaultExportRegex.exec(content)) !== null) {
    const [raw, name] = match;

    exports.push({
      namedExports: [],
      defaultExport: name || 'default',
      raw,
    });
  }

  // Match: export const/let/var/function/class X
  const inlineExportRegex = /export\s+(?:const|let|var|function|class|enum|interface|type)\s+(\w+)/g;

  while ((match = inlineExportRegex.exec(content)) !== null) {
    const [raw, name] = match;

    exports.push({
      namedExports: [name],
      raw,
    });
  }

  return exports;
}

/**
 * Resolve a relative import path to an absolute path
 */
export function resolveImportPath(
  importPath: string,
  fromFilePath: string,
  projectRoot: string = ''
): string {
  if (!importPath.startsWith('.')) {
    // Non-relative import (npm package)
    return importPath;
  }

  // Get directory of the importing file
  const fromDir = fromFilePath.substring(0, fromFilePath.lastIndexOf('/'));

  // Simple path resolution
  const parts = importPath.split('/');
  const baseParts = fromDir.split('/').filter(p => p.length > 0);

  for (const part of parts) {
    if (part === '.') {
      continue;
    } else if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  let resolved = baseParts.join('/');

  // Handle common extensions if not specified
  if (!resolved.match(/\.[jt]sx?$/)) {
    // Could be importing a directory (index file) or file without extension
    // We'll add common extensions for matching
    resolved = resolved.replace(/\/$/, '');
  }

  return resolved;
}

/**
 * Get all relative imports from a file
 */
export function getRelativeImports(content: string, language: 'typescript' | 'python'): string[] {
  const parser = language === 'typescript' ? parseTypeScriptImports : parsePythonImports;
  const imports = parser(content);

  return imports
    .filter(imp => imp.isRelative)
    .map(imp => imp.module);
}

/**
 * Get all external (npm/pip) imports from a file
 */
export function getExternalImports(content: string, language: 'typescript' | 'python'): string[] {
  const parser = language === 'typescript' ? parseTypeScriptImports : parsePythonImports;
  const imports = parser(content);

  return imports
    .filter(imp => !imp.isRelative)
    .map(imp => {
      // Extract package name from module path
      // For scoped packages (@scope/package/sub), return @scope/package
      // For regular packages (package/sub), return package
      if (imp.module.startsWith('@')) {
        const parts = imp.module.split('/');
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : imp.module;
      }
      return imp.module.split('/')[0];
    })
    .filter((mod, index, self) => self.indexOf(mod) === index); // Unique
}
