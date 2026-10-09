import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('docker-entrypoint.sh and Dockerfile configuration', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const entrypointPath = path.join(repoRoot, 'docker-entrypoint.sh');
  const dockerfilePath = path.join(repoRoot, 'Dockerfile');

  it('docker-entrypoint.sh exists and has pure LF line endings', () => {
    expect(fs.existsSync(entrypointPath)).toBe(true);

    const buffer = fs.readFileSync(entrypointPath);
    // Ensure no CR (\r) characters exist
    expect(buffer.includes(0x0d)).toBe(false);
  });

  it('docker-entrypoint.sh has the correct script headers and commands', () => {
    const content = fs.readFileSync(entrypointPath, 'utf8');

    expect(content).toMatch(/^#!/);
    expect(content).toContain('set -e');
    expect(content).toContain('PROMPTFOO_PYTHON_REQUIREMENTS:-/app/custom/requirements.txt');
    expect(content).toContain('pip install -r "$REQUIREMENTS_FILE" --break-system-packages');
    expect(content).toContain('exec node dist/src/server/index.js');
    expect(content).toContain('exec "$@"');
  });

  it('Dockerfile configures docker-entrypoint.sh, /app/custom, and python environment', () => {
    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');

    expect(dockerfile).toContain('COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh');
    expect(dockerfile).toContain('chmod +x /usr/local/bin/docker-entrypoint.sh');
    expect(dockerfile).toContain('ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]');
    expect(dockerfile).toContain('CMD ["node", "dist/src/server/index.js"]');
    expect(dockerfile).toContain('/app/custom');
    expect(dockerfile).toContain('ENV PATH="/home/promptfoo/.local/bin:${PATH}"');
    expect(dockerfile).toContain('ENV PYTHONPATH="/app/custom:${PYTHONPATH}"');
  });

  // Find a shell executable (sh or bash) if available
  const findShell = (): string | null => {
    const candidates = ['sh', 'bash', 'C:\\Program Files\\Git\\bin\\sh.exe'];
    for (const cand of candidates) {
      try {
        const res = spawnSync(cand, ['-c', 'echo ok'], { encoding: 'utf8' });
        if (res.status === 0 && res.stdout.trim() === 'ok') {
          return cand;
        }
      } catch {
        // Continue searching
      }
    }
    return null;
  };

  const shellPath = findShell();

  it.runIf(Boolean(shellPath))(
    'executes commands correctly when no requirements file exists',
    () => {
      const res = spawnSync(shellPath!, [entrypointPath, 'echo', 'entrypoint_test_passed'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PROMPTFOO_PYTHON_REQUIREMENTS: path.join(os.tmpdir(), 'non-existent-requirements.txt'),
        },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('entrypoint_test_passed');
      expect(res.stdout).not.toContain('Installing Python dependencies');
    },
  );

  it.runIf(Boolean(shellPath))('triggers pip install when requirements file is present', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-entrypoint-test-'));
    try {
      const dummyReqs = path.join(tempDir, 'requirements.txt');
      fs.writeFileSync(dummyReqs, 'dummy-package==1.0.0\n');

      // Create a mock pip script in a bin directory to intercept pip call
      const mockBinDir = path.join(tempDir, 'bin');
      fs.mkdirSync(mockBinDir);
      const mockPip = path.join(mockBinDir, 'pip');
      fs.writeFileSync(
        mockPip,
        `#!/bin/sh\necho "MOCK_PIP_CALLED with: $@" > "${path.join(tempDir, 'pip_args.txt').replace(/\\/g, '/')}"\n`,
      );

      const currentPath = process.env.PATH || '';
      const envPath = `${mockBinDir}${path.delimiter}${currentPath}`;

      const res = spawnSync(shellPath!, [entrypointPath, 'echo', 'complete'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: envPath,
          PROMPTFOO_PYTHON_REQUIREMENTS: dummyReqs,
        },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('Installing Python dependencies');
      expect(res.stdout).toContain('complete');

      const recordedArgs = fs.readFileSync(path.join(tempDir, 'pip_args.txt'), 'utf8');
      expect(recordedArgs).toContain('-r');
      expect(recordedArgs).toContain('--break-system-packages');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
