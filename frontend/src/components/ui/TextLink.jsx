import { Link } from 'react-router-dom';

const variants = {
  accent: 'font-medium text-ds-primary underline-offset-2 hover:text-ds-primary-hover hover:underline dark:text-ds-primary-soft dark:hover:text-violet-200',
  muted:
    'font-medium text-ds-text-muted underline-offset-2 hover:text-ds-text hover:underline dark:text-slate-400 dark:hover:text-white',
};

export function TextLink({
  variant = 'accent',
  className = '',
  children,
  ...props
}) {
  const v = variants[variant] ?? variants.accent;
  return (
    <Link className={`${v} ${className}`.trim()} {...props}>
      {children}
    </Link>
  );
}
