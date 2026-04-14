const base =
  'inline-flex items-center justify-center gap-2 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary disabled:cursor-not-allowed disabled:opacity-55';

const variants = {
  primary: `${base} rounded-ds-input border-0 bg-gradient-to-br from-ds-primary to-ds-fuchsia px-4 py-3.5 text-base text-white shadow-ds-glow hover:shadow-ds-card-hover active:translate-y-px dark:from-ds-primary-soft dark:to-ds-fuchsia`,
  secondary: `${base} rounded-ds-input border border-ds-border bg-ds-surface px-4 py-2.5 text-sm text-ds-text-secondary shadow-sm hover:border-ds-border-strong hover:bg-ds-surface-muted dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/80`,
  ghost: `${base} rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-sm text-ds-text-muted hover:bg-ds-surface-muted dark:text-slate-400 dark:hover:bg-slate-800`,
};

const spinners = {
  light:
    'inline-block size-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent',
  dark: 'inline-block size-4 animate-spin rounded-full border-2 border-ds-primary/30 border-t-ds-primary',
};

export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  loading = false,
  disabled = false,
  spinner = 'light',
  children,
  ...props
}) {
  const v = variants[variant] ?? variants.primary;
  const spin = spinners[spinner] ?? spinners.light;
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`${v} ${className}`.trim()}
      {...props}
    >
      {loading ? <span className={spin} aria-hidden /> : null}
      {children}
    </button>
  );
}
