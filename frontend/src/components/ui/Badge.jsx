const variants = {
  accentDot: 'mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-ds-primary dark:text-ds-primary-soft',
  soft: 'inline-flex items-center rounded-full bg-violet-100 px-3 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200',
  outline:
    'inline-flex items-center rounded-lg border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-ds-primary shadow-sm transition hover:bg-violet-50 dark:border-violet-900/50 dark:bg-slate-800/80 dark:text-ds-primary-soft dark:hover:bg-violet-950/40',
};

export function Badge({ variant = 'soft', className = '', children, ...props }) {
  const v = variants[variant] ?? variants.soft;
  return (
    <span className={`${v} ${className}`.trim()} {...props}>
      {variant === 'accentDot' ? (
        <>
          <span
            className="size-2 shrink-0 rounded-full bg-ds-primary shadow-[0_0_0_3px_rgb(139_92_246_/_0.22)] dark:bg-ds-primary-soft"
            aria-hidden
          />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
