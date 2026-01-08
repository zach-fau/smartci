/**
 * Represents a parsed diff for a single file
 */
export interface FileDiff {
  /** Path to the file */
  path: string;
  /** Type of change: added, modified, deleted, renamed */
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Original path (for renamed files) */
  oldPath?: string;
  /** Hunks containing the actual changes */
  hunks: DiffHunk[];
}

/**
 * Represents a single hunk in a diff
 */
export interface DiffHunk {
  /** Starting line in the old file */
  oldStart: number;
  /** Number of lines in old file */
  oldLines: number;
  /** Starting line in the new file */
  newStart: number;
  /** Number of lines in new file */
  newLines: number;
  /** The actual diff content */
  content: string[];
  /** Added lines */
  additions: string[];
  /** Removed lines */
  deletions: string[];
}

/**
 * Parse git diff output into structured format
 */
export async function parseGitDiff(changedFiles: string[]): Promise<FileDiff[]> {
  const diffs: FileDiff[] = [];

  for (const file of changedFiles) {
    // Determine change type based on file status
    // For now, assume all are modified - will enhance with git status
    diffs.push({
      path: file,
      changeType: 'modified',
      hunks: [],
    });
  }

  return diffs;
}

/**
 * Parse a raw diff string into structured format
 */
export function parseDiffString(rawDiff: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  const filePattern = /^diff --git a\/(.*) b\/(.*)$/gm;
  const hunkPattern = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/;

  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;

  const lines = rawDiff.split('\n');

  for (const line of lines) {
    // Check for new file diff
    const fileMatch = line.match(/^diff --git a\/(.*) b\/(.*)$/);
    if (fileMatch) {
      if (currentFile) {
        diffs.push(currentFile);
      }
      currentFile = {
        path: fileMatch[2],
        changeType: 'modified',
        hunks: [],
      };
      if (fileMatch[1] !== fileMatch[2]) {
        currentFile.changeType = 'renamed';
        currentFile.oldPath = fileMatch[1];
      }
      currentHunk = null;
      continue;
    }

    // Check for new/deleted file indicators
    if (currentFile) {
      if (line.startsWith('new file mode')) {
        currentFile.changeType = 'added';
        continue;
      }
      if (line.startsWith('deleted file mode')) {
        currentFile.changeType = 'deleted';
        continue;
      }
    }

    // Check for hunk header
    const hunkMatch = line.match(hunkPattern);
    if (hunkMatch && currentFile) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newLines: parseInt(hunkMatch[4] || '1', 10),
        content: [],
        additions: [],
        deletions: [],
      };
      continue;
    }

    // Process diff content lines
    if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.additions.push(line.substring(1));
        currentHunk.content.push(line);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.deletions.push(line.substring(1));
        currentHunk.content.push(line);
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.content.push(line);
      }
    }
  }

  // Don't forget the last file and hunk
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    diffs.push(currentFile);
  }

  return diffs;
}
