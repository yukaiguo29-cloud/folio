export interface CloseRequest {
  preventDefault(): void;
}

export interface CloseOptions {
  isReady: () => boolean;
  save: () => Promise<unknown>;
  destroy: () => Promise<void>;
  onError: (stage: 'save' | 'close', error: unknown) => void;
}

/** Save once, then destroy directly: close() would emit the intercepted request again. */
export function createCloseHandler(options: CloseOptions) {
  let pending: Promise<void> | undefined;
  return (event: CloseRequest): Promise<void> => {
    event.preventDefault();
    if (pending) return pending;
    pending = (async () => {
      try {
        if (options.isReady()) await options.save();
      } catch (error) {
        options.onError('save', error);
        return;
      }
      try {
        await options.destroy();
      } catch (error) {
        options.onError('close', error);
      }
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
