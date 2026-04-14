const sizes = {
  sm: 'size-4 border-2',
  md: 'size-10 border-2',
};

const themes = {
  light: 'border-white/70 border-t-transparent',
  brand: 'border-ds-primary/30 border-t-ds-primary',
  slate: 'border-slate-300 border-t-slate-700 dark:border-slate-600 dark:border-t-slate-200',
};

export function Spinner({
  size = 'sm',
  theme = 'brand',
  className = '',
  ...props
}) {
  const s = sizes[size] ?? sizes.sm;
  const t = themes[theme] ?? themes.brand;
  return (
    <span
      className={`inline-block animate-spin rounded-full ${s} ${t} ${className}`.trim()}
      role="status"
      aria-label="Loading"
      {...props}
    />
  );
}
