import test from 'node:test';
import assert from 'node:assert';
import { runInSandbox, listPatches } from '../dist/sandbox.js';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';

async function setupTestRepo() {
  const dir = path.join(tmpdir(), `sandbox-test-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  execSync('git init -b main', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  await writeFile(path.join(dir, 'README.md'), '# Test repo');
  execSync('git add README.md', { cwd: dir });
  execSync('git commit -m "init"', { cwd: dir });
  return dir;
}

test('sandbox run captures patch and cleans up', async () => {
  const root = await setupTestRepo();
  const scriptPath = path.join(root, 'test-script.js');
  await writeFile(scriptPath, 'require("fs").writeFileSync("new-file.txt", "hello sandbox");');
  try {
    const result = await runInSandbox(root, 'node', [scriptPath]);
    
    assert.ok(result.hasChanges);
    assert.ok(result.patchFile);
    assert.equal(result.exitCode, 0);

    // Verify the patch exists
    const patchStat = await stat(result.patchFile);
    assert.ok(patchStat.size > 0);

    // Verify the file was NOT written to the main working tree
    await assert.rejects(stat(path.join(root, 'new-file.txt')));

    // Verify review list
    const patches = await listPatches(root);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].patchPath, result.patchFile);

  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});
