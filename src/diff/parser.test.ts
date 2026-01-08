import { describe, it, expect } from 'vitest';
import { parseDiffString, type FileDiff } from './parser.js';

describe('parseDiffString', () => {
  it('should parse a simple modified file diff', () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import foo from 'foo';
+import bar from 'bar';

 export function main() {`;

    const result = parseDiffString(rawDiff);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/index.ts');
    expect(result[0].changeType).toBe('modified');
    expect(result[0].hunks).toHaveLength(1);
    expect(result[0].hunks[0].additions).toContain("import bar from 'bar';");
  });

  it('should parse a new file diff', () => {
    const rawDiff = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,5 @@
+export function newFunction() {
+  return 'hello';
+}`;

    const result = parseDiffString(rawDiff);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/new-file.ts');
    expect(result[0].changeType).toBe('added');
  });

  it('should parse a deleted file diff', () => {
    const rawDiff = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function oldFunction() {
-  return 'goodbye';
-}`;

    const result = parseDiffString(rawDiff);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/old-file.ts');
    expect(result[0].changeType).toBe('deleted');
  });

  it('should parse a renamed file diff', () => {
    const rawDiff = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 95%
rename from src/old-name.ts
rename to src/new-name.ts
index abc1234..def5678 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
-export const OLD_NAME = 'old';
+export const NEW_NAME = 'new';`;

    const result = parseDiffString(rawDiff);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/new-name.ts');
    expect(result[0].oldPath).toBe('src/old-name.ts');
    expect(result[0].changeType).toBe('renamed');
  });

  it('should parse multiple files in one diff', () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import foo from 'foo';
+import bar from 'bar';
diff --git a/src/utils.ts b/src/utils.ts
index 111..222 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -5,2 +5,3 @@
 export function helper() {
+  console.log('debug');
 }`;

    const result = parseDiffString(rawDiff);

    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('src/index.ts');
    expect(result[1].path).toBe('src/utils.ts');
  });

  it('should track additions and deletions separately', () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,5 @@
 import foo from 'foo';
-import old from 'old';
+import new from 'new';

 export function main() {
-  return old();
+  return new();
 }`;

    const result = parseDiffString(rawDiff);

    expect(result[0].hunks[0].additions).toHaveLength(2);
    expect(result[0].hunks[0].deletions).toHaveLength(2);
    expect(result[0].hunks[0].additions).toContain("import new from 'new';");
    expect(result[0].hunks[0].deletions).toContain("import old from 'old';");
  });

  it('should handle empty diff', () => {
    const result = parseDiffString('');
    expect(result).toHaveLength(0);
  });

  it('should parse hunk headers correctly', () => {
    const rawDiff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -10,6 +10,8 @@
 function test() {
+  // added line 1
+  // added line 2
 }`;

    const result = parseDiffString(rawDiff);

    expect(result[0].hunks[0].oldStart).toBe(10);
    expect(result[0].hunks[0].oldLines).toBe(6);
    expect(result[0].hunks[0].newStart).toBe(10);
    expect(result[0].hunks[0].newLines).toBe(8);
  });
});
