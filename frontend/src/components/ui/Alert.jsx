const variants = {
  error: 'border-ds-danger-border bg-ds-danger-bg text-ds-danger-text dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100',
  success:
    'border-ds-success-border bg-ds-success-bg text-ds-success-text dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100',
  info: 'border-ds-border bg-ds-surface-muted text-ds-text-secondary dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200',
};

export function Alert({
  variant = 'error',
  className = '',
  children,
  ...props
}) {
  const v = variants[variant] ?? variants.error;
  return (
    <div
      className={`rounded-ds-card border px-3.5 py-3 text-sm ${v} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
