import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWorktree, cleanupWorktrees, isGitRepo } from '@cobusgreyling/loop-worktree';
const runExec = promisify(execFile);
/** Run a git command in cwd, returning stdout. Throws on error. */
async function git(args, cwd) {
    const { stdout } = await runExec('git', args, { cwd, maxBuffer: 50 * 1024 * 1024 });
    return stdout.trim();
}
/**
 * Wraps an agent command in a temporary git worktree sandbox.
 * Returns the patch file path if changes were made.
 */
export async function runInSandbox(root, command, args) {
    if (!(await isGitRepo(root))) {
        throw new Error('loop-sandbox must be run inside a git repository.');
    }
    const runId = `sandbox-${crypto.randomBytes(4).toString('hex')}`;
    // 1. Setup paths
    const sandboxDir = path.join(root, '.loop-sandbox');
    const patchesDir = path.join(sandboxDir, 'patches');
    await mkdir(patchesDir, { recursive: true });
    console.log(`\n📦 Creating loop-sandbox: ${runId}`);
    // 2. Create the worktree
    const entry = await createWorktree({
        root,
        runId,
        pattern: 'sandbox', // dummy pattern
    });
    const worktreeAbsPath = path.resolve(root, entry.path);
    console.log(`🚀 Executing inside sandbox: ${command} ${args.join(' ')}`);
    // 3. Execute the user's command
    let exitCode = null;
    try {
        const child = spawn(command, args, {
            cwd: worktreeAbsPath,
            stdio: 'inherit',
            shell: true // support complex shell commands if needed
        });
        exitCode = await new Promise((resolve) => {
            child.on('close', (code) => resolve(code));
            child.on('error', () => resolve(1));
        });
    }
    catch (err) {
        console.error(`❌ Execution failed inside sandbox:`, err);
        exitCode = 1;
    }
    console.log(`\n🔍 Scanning sandbox for changes...`);
    // 4. Extract diff as a patch
    let hasChanges = false;
    let patchFilePath = null;
    try {
        // Add all untracked/modified files so they appear in diff --cached
        await git(['add', '-A'], worktreeAbsPath);
        // Check if there are any staged changes
        const diffStat = await git(['diff', '--cached', '--stat'], worktreeAbsPath);
        if (diffStat) {
            hasChanges = true;
            patchFilePath = path.join(patchesDir, `${runId}.patch`);
            const diffOutput = await git(['diff', '--cached', '--binary'], worktreeAbsPath);
            await writeFile(patchFilePath, diffOutput, 'utf8');
            console.log(`✅ Sandbox changes captured to patch: ${patchFilePath}`);
        }
        else {
            console.log(`ℹ️ No changes were made in the sandbox.`);
        }
    }
    catch (err) {
        console.error(`❌ Failed to extract patch from sandbox:`, err);
    }
    // 5. Cleanup the worktree
    console.log(`🧹 Cleaning up sandbox worktree...`);
    try {
        // Force remove it because it has uncommitted changes (which we already saved to a patch)
        await cleanupWorktrees({
            root,
            statuses: ['active'],
            force: true
        });
    }
    catch (err) {
        console.error(`❌ Failed to cleanup sandbox worktree:`, err);
    }
    return {
        runId,
        patchFile: patchFilePath,
        exitCode,
        hasChanges
    };
}
/** Lists all available patches in the .loop-sandbox/patches/ directory. */
export async function listPatches(root) {
    const patchesDir = path.join(root, '.loop-sandbox', 'patches');
    try {
        const files = await readdir(patchesDir, { withFileTypes: true });
        const patches = [];
        for (const f of files) {
            if (f.isFile() && f.name.endsWith('.patch')) {
                const patchPath = path.join(patchesDir, f.name);
                const stat = await import('node:fs/promises').then(fs => fs.stat(patchPath));
                patches.push({
                    patchName: f.name,
                    patchPath,
                    size: stat.size
                });
            }
        }
        return patches;
    }
    catch {
        return [];
    }
}
