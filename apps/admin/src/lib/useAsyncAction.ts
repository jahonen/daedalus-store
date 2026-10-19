import { useCallback, useState } from "react";
import { useSnackbar } from "./useSnackbar.js";

/**
 * Lifecycle: beta — tiny hook wrapping an async action with busy state +
 * automatic error surfacing via the global snackbar.
 *
 * Usage:
 *   const [execute, busy] = useAsyncAction();
 *   <Button disabled={busy} onClick={() => execute(async () => { ... })}>
 */
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const { showError } = useSnackbar();

  const execute = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      try {
        return await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError(msg);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [showError],
  );

  return [execute, busy] as const;
}
