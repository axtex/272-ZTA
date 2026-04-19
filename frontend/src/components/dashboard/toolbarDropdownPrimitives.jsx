import { useEffect, useRef } from 'react';

export const actionMenuItem =
  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-ds-text transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800';

export const toolbarDropdownTriggerClass =
  'inline-flex items-center gap-1 rounded-lg border border-ds-border bg-ds-surface px-2.5 py-1 text-xs font-semibold text-ds-text shadow-sm transition hover:border-ds-border-strong hover:bg-ds-surface-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-ds-primary/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

export function useToolbarDropdownDismiss(open, setOpen) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const el = rootRef.current;
      if (el && !el.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen]);

  return rootRef;
}
