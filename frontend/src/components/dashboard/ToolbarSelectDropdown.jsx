import { useState } from 'react';

import {
  actionMenuItem,
  toolbarDropdownTriggerClass,
  useToolbarDropdownDismiss,
} from './toolbarDropdownPrimitives.jsx';

const toolbarDropdownPanelClass =
  'absolute z-50 w-max min-w-[9.5rem] max-w-[14rem] overflow-hidden rounded-md border border-ds-border/90 bg-ds-surface py-0.5 text-left shadow-lg ring-1 ring-black/5 divide-y divide-ds-border/60 dark:divide-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10 top-[calc(100%+0.35rem)]';

/**
 * Custom listbox trigger + panel (matches admin dashboard toolbar selects).
 */
export function ToolbarSelectDropdown({
  value,
  onChange,
  options,
  ariaLabel,
  listAriaLabel = 'Options',
  align = 'left',
  triggerMinWidthClass = 'min-w-[9.5rem]',
  className = '',
  /** When set, shown on the trigger if `value` is empty and not listed in `options` (not a menu row). */
  placeholderLabel,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useToolbarDropdownDismiss(open, setOpen);
  const selected = options.find((o) => o.value === value);
  const emptyish = value === '' || value == null;
  const selectedLabel =
    selected?.label ??
    (placeholderLabel != null && emptyish ? placeholderLabel : options[0]?.label ?? '—');
  const showPlaceholderStyle = emptyish && placeholderLabel != null && !selected;
  const panelSide = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div ref={rootRef} className={['relative inline-flex shrink-0', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={`${toolbarDropdownTriggerClass} h-10 ${triggerMinWidthClass} justify-between`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={[
            'min-w-0 flex-1 truncate text-left',
            showPlaceholderStyle ? 'text-ds-text-muted dark:text-slate-500' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {selectedLabel}
        </span>
        <span
          className={`shrink-0 ${open ? 'rotate-180' : ''} text-ds-text-muted transition-transform dark:text-slate-500`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open ? (
        <div role="listbox" aria-label={listAriaLabel} className={`${toolbarDropdownPanelClass} ${panelSide}`}>
          {options.map((opt) => (
            <button
              key={opt.value === '' ? '__empty' : opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              className={[
                actionMenuItem,
                value === opt.value
                  ? 'bg-violet-50 font-semibold text-ds-primary dark:bg-violet-950/40 dark:text-ds-primary-soft'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
