import { describe, it, expect } from 'vitest';
import {
  parseTypeScriptImports,
  parsePythonImports,
  parseTypeScriptExports,
  resolveImportPath,
  getRelativeImports,
  getExternalImports,
} from './imports.js';

describe('parseTypeScriptImports', () => {
  it('should parse default imports', () => {
    const content = `import React from 'react';`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('react');
    expect(imports[0].defaultImport).toBe('React');
    expect(imports[0].isRelative).toBe(false);
  });

  it('should parse named imports', () => {
    const content = `import { useState, useEffect } from 'react';`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('react');
    expect(imports[0].namedImports).toContain('useState');
    expect(imports[0].namedImports).toContain('useEffect');
  });

  it('should parse mixed default and named imports', () => {
    const content = `import React, { useState } from 'react';`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].defaultImport).toBe('React');
    expect(imports[0].namedImports).toContain('useState');
  });

  it('should parse namespace imports', () => {
    const content = `import * as utils from './utils';`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('./utils');
    expect(imports[0].defaultImport).toBe('utils');
    expect(imports[0].isRelative).toBe(true);
  });

  it('should parse type-only imports', () => {
    const content = `import type { User } from './types';`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].isTypeOnly).toBe(true);
    expect(imports[0].namedImports).toContain('User');
  });

  it('should parse aliased imports', () => {
    const content = `import { foo as bar } from './module';`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toContain('bar');
  });

  it('should parse relative imports', () => {
    const content = `
      import { helper } from './utils';
      import config from '../config';
      import data from '/absolute/path';
    `;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(3);
    expect(imports[0].isRelative).toBe(true);
    expect(imports[1].isRelative).toBe(true);
    expect(imports[2].isRelative).toBe(true);
  });

  it('should parse require() calls', () => {
    const content = `const express = require('express');`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('express');
    expect(imports[0].defaultImport).toBe('express');
  });

  it('should parse destructured require()', () => {
    const content = `const { Router, Request } = require('express');`;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toContain('Router');
    expect(imports[0].namedImports).toContain('Request');
  });

  it('should handle multiple imports in a file', () => {
    const content = `
      import React from 'react';
      import { render } from '@testing-library/react';
      import { MyComponent } from './components';
      import type { Props } from './types';
    `;
    const imports = parseTypeScriptImports(content);

    expect(imports).toHaveLength(4);
    expect(imports.map(i => i.module)).toContain('react');
    expect(imports.map(i => i.module)).toContain('@testing-library/react');
    expect(imports.map(i => i.module)).toContain('./components');
    expect(imports.map(i => i.module)).toContain('./types');
  });
});

describe('parsePythonImports', () => {
  it('should parse from X import Y', () => {
    const content = `from os import path`;
    const imports = parsePythonImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('os');
    expect(imports[0].namedImports).toContain('path');
  });

  it('should parse from X import Y, Z', () => {
    const content = `from typing import List, Dict, Optional`;
    const imports = parsePythonImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toHaveLength(3);
    expect(imports[0].namedImports).toContain('List');
    expect(imports[0].namedImports).toContain('Dict');
    expect(imports[0].namedImports).toContain('Optional');
  });

  it('should parse multiline from imports', () => {
    const content = `from typing import (
      List,
      Dict,
      Optional
    )`;
    const imports = parsePythonImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toHaveLength(3);
  });

  it('should parse import X', () => {
    const content = `import os`;
    const imports = parsePythonImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('os');
    expect(imports[0].defaultImport).toBe('os');
  });

  it('should parse import X as Y', () => {
    const content = `import numpy as np`;
    const imports = parsePythonImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('numpy');
    expect(imports[0].defaultImport).toBe('np');
  });

  it('should parse relative imports', () => {
    const content = `from .utils import helper`;
    const imports = parsePythonImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].module).toBe('.utils');
    expect(imports[0].isRelative).toBe(true);
  });

  it('should parse aliased named imports', () => {
    const content = `from module import original as alias`;
    const imports = parsePythonImports(content);

    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toContain('alias');
  });
});

describe('parseTypeScriptExports', () => {
  it('should parse named exports', () => {
    const content = `export { foo, bar };`;
    const exports = parseTypeScriptExports(content);

    expect(exports.length).toBeGreaterThan(0);
    expect(exports[0].namedExports).toContain('foo');
    expect(exports[0].namedExports).toContain('bar');
  });

  it('should parse re-exports', () => {
    const content = `export { helper } from './utils';`;
    const exports = parseTypeScriptExports(content);

    expect(exports.length).toBeGreaterThan(0);
    expect(exports[0].reExportFrom).toBe('./utils');
  });

  it('should parse default exports', () => {
    const content = `export default MyComponent;`;
    const exports = parseTypeScriptExports(content);

    expect(exports.length).toBeGreaterThan(0);
    expect(exports.some(e => e.defaultExport !== undefined)).toBe(true);
  });

  it('should parse inline exports', () => {
    const content = `
      export const FOO = 'foo';
      export function bar() {}
      export class Baz {}
    `;
    const exports = parseTypeScriptExports(content);

    expect(exports.length).toBeGreaterThanOrEqual(3);
    const allNames = exports.flatMap(e => e.namedExports);
    expect(allNames).toContain('FOO');
    expect(allNames).toContain('bar');
    expect(allNames).toContain('Baz');
  });
});

describe('resolveImportPath', () => {
  it('should resolve same directory imports', () => {
    const result = resolveImportPath('./utils', 'src/components/Button.ts');
    expect(result).toBe('src/components/utils');
  });

  it('should resolve parent directory imports', () => {
    const result = resolveImportPath('../utils', 'src/components/Button.ts');
    expect(result).toBe('src/utils');
  });

  it('should resolve multiple parent directories', () => {
    const result = resolveImportPath('../../lib/helper', 'src/components/ui/Button.ts');
    expect(result).toBe('src/lib/helper');
  });

  it('should not modify non-relative imports', () => {
    const result = resolveImportPath('react', 'src/components/Button.ts');
    expect(result).toBe('react');
  });

  it('should handle scoped packages', () => {
    const result = resolveImportPath('@testing-library/react', 'src/test.ts');
    expect(result).toBe('@testing-library/react');
  });
});

describe('getRelativeImports', () => {
  it('should extract only relative imports for TypeScript', () => {
    const content = `
      import React from 'react';
      import { helper } from './utils';
      import config from '../config';
    `;
    const relatives = getRelativeImports(content, 'typescript');

    expect(relatives).toHaveLength(2);
    expect(relatives).toContain('./utils');
    expect(relatives).toContain('../config');
    expect(relatives).not.toContain('react');
  });

  it('should extract only relative imports for Python', () => {
    const content = `
      import os
      from .utils import helper
      from ..config import settings
    `;
    const relatives = getRelativeImports(content, 'python');

    expect(relatives).toHaveLength(2);
    expect(relatives).toContain('.utils');
    expect(relatives).toContain('..config');
  });
});

describe('getExternalImports', () => {
  it('should extract external package names', () => {
    const content = `
      import React from 'react';
      import { render } from '@testing-library/react';
      import { helper } from './utils';
    `;
    const external = getExternalImports(content, 'typescript');

    expect(external).toHaveLength(2);
    expect(external).toContain('react');
    // Scoped packages include the full scope/package name
    expect(external).toContain('@testing-library/react');
  });

  it('should deduplicate packages', () => {
    const content = `
      import React, { useState } from 'react';
      import { useEffect } from 'react';
    `;
    const external = getExternalImports(content, 'typescript');

    expect(external).toHaveLength(1);
    expect(external[0]).toBe('react');
  });
});
