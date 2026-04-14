const variants = {
  frosted:
    'rounded-ds-card border border-ds-border bg-ds-surface-glass shadow-ds-card backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90',
  solid:
    'rounded-ds-card border border-ds-border bg-ds-surface shadow-sm dark:border-slate-700 dark:bg-slate-900',
};

export function Card({
  variant = 'frosted',
  padding = 'p-7 sm:p-9',
  className = '',
  children,
  ...props
}) {
  const v = variants[variant] ?? variants.frosted;
  return (
    <div className={`${v} ${padding} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
