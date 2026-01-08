import * as exec from '@actions/exec';

/**
 * Get the list of changed files in the current git context
 * Compares against the base branch (typically main or master)
 */
export async function getChangedFiles(): Promise<string[]> {
  let output = '';
  let errorOutput = '';

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        errorOutput += data.toString();
      },
    },
  };

  // Try to get diff against origin/main first, then origin/master
  try {
    await exec.exec('git', ['diff', '--name-only', 'origin/main...HEAD'], options);
  } catch {
    // Reset output and try origin/master
    output = '';
    try {
      await exec.exec('git', ['diff', '--name-only', 'origin/master...HEAD'], options);
    } catch {
      // If both fail, get diff against HEAD~1
      output = '';
      await exec.exec('git', ['diff', '--name-only', 'HEAD~1'], options);
    }
  }

  // Parse the output into an array of file paths
  const files = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return files;
}

/**
 * Get the raw git diff output for specific files
 */
export async function getRawDiff(files: string[]): Promise<string> {
  let output = '';

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  };

  const args = ['diff', '--unified=3', 'HEAD~1', '--', ...files];
  await exec.exec('git', args, options);

  return output;
}
