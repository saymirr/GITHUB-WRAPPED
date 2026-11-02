// Opens a file in the default viewer. Best effort: failures are ignored.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export function openFile(path, platform = process.platform) {
  const file = resolve(path);
  const [command, args] = platform === 'win32' ? ['cmd', ['/c', 'start', '', file]]
    : platform === 'darwin' ? ['open', [file]]
      : ['xdg-open', [file]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // no viewer available; the path was already printed
  }
}
