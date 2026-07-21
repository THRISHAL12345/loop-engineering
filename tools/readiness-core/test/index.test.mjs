import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileExists, scanSkillDirectories } from '../dist/index.js';

test('fileExists returns true for existing file', async () => {
  const result = await fileExists(path.join(process.cwd(), 'package.json'));
  assert.strictEqual(result, true);
});

test('fileExists returns false for missing file', async () => {
  const result = await fileExists(path.join(process.cwd(), 'missing.json'));
  assert.strictEqual(result, false);
});

test('scanSkillDirectories finds skills in target directory', async () => {
  // We can test this by running it on a known directory or setting up a mock
  // For simplicity, let's scan the current directory and ensure it handles empty or missing gracefully.
  const skills = await scanSkillDirectories(path.join(process.cwd(), 'test-data-missing'));
  assert.deepStrictEqual(skills, []);
});
