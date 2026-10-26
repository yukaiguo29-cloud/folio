// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mockIPC, mockWindows, clearMocks } from '@tauri-apps/api/mocks';
import { emit, TauriEvent } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { waitFor } from '@testing-library/dom';
import { createCloseHandler } from '../src/core/desktop-close';

beforeEach(() => {
  mockWindows('main');
});
afterEach(() => {
  clearMocks();
});

it('uses the real Tauri close listener and the packaged ACL to save then destroy exactly once', async () => {
  const capability = JSON.parse(
    await readFile(join(process.cwd(), 'src-tauri/capabilities/main.json'), 'utf8'),
  );
  const commands: string[] = [];
  mockIPC(
    (command) => {
      commands.push(command);
      if (command === 'plugin:window|close')
        throw new Error('A close request must not recursively emit another request');
      const permission = 'core:window:allow-' + command.split('|')[1];
      if (!capability.permissions.includes(permission))
        throw new Error('Packaged ACL denied: ' + command);
    },
    { shouldMockEvents: true },
  );
  let finishSave!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  const errors = vi.fn();
  const nativeWindow = getCurrentWindow();
  const stop = await nativeWindow.onCloseRequested(
    createCloseHandler({
      isReady: () => true,
      save,
      destroy: () => nativeWindow.destroy(),
      onError: errors,
    }),
  );
  await emit(TauriEvent.WINDOW_CLOSE_REQUESTED);
  await emit(TauriEvent.WINDOW_CLOSE_REQUESTED);
  expect(save).toHaveBeenCalledTimes(1);
  expect(commands).toEqual([]);
  finishSave();
  await waitFor(() => expect(commands).toEqual(['plugin:window|destroy']));
  expect(errors).not.toHaveBeenCalled();
  stop();
});

it('can close an initialization failure without touching an unavailable database', async () => {
  const save = vi.fn(),
    destroy = vi.fn().mockResolvedValue(undefined),
    preventDefault = vi.fn();
  await createCloseHandler({ isReady: () => false, save, destroy, onError: vi.fn() })({
    preventDefault,
  });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalledOnce();
});

it('keeps the window after a failed save and allows the next close attempt to succeed', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
  const destroy = vi.fn().mockResolvedValue(undefined),
    onError = vi.fn();
  const handler = createCloseHandler({ isReady: () => true, save, destroy, onError });
  await handler({ preventDefault() {} });
  expect(onError).toHaveBeenCalledWith('save', expect.any(Error));
  expect(destroy).not.toHaveBeenCalled();
  await handler({ preventDefault() {} });
  expect(save).toHaveBeenCalledTimes(2);
  expect(destroy).toHaveBeenCalledOnce();
});

it('reports a destroy permission failure as a close failure and does not permanently block retries', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const destroy = vi
    .fn()
    .mockRejectedValueOnce(new Error('permission denied'))
    .mockResolvedValue(undefined);
  const onError = vi.fn();
  const handler = createCloseHandler({ isReady: () => true, save, destroy, onError });
  await handler({ preventDefault() {} });
  expect(onError).toHaveBeenCalledWith('close', expect.any(Error));
  await handler({ preventDefault() {} });
  expect(destroy).toHaveBeenCalledTimes(2);
});
