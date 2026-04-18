/**
 * Composed layout + typography class strings for Hospital ZTA.
 * Prefer these (or components in `components/ui/`) over pasting long Tailwind blobs.
 * Colors/radii/shadows come from `theme.css` (`ds-*` utilities).
 */

/** Full-viewport centered “stage” (auth, onboarding). */
export const authStage =
  'flex min-h-svh flex-1 items-center justify-center bg-gradient-to-br from-ds-canvas-from/95 via-ds-canvas-via to-ds-canvas-to px-5 py-10 sm:px-6 sm:py-12 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950/25';

export const authTitle =
  'text-[clamp(1.45rem,3.2vw,1.7rem)] font-semibold leading-snug tracking-tight text-ds-text dark:text-white';

export const authSubtitle =
  'mt-2 text-[15px] leading-relaxed text-ds-text-muted dark:text-slate-400';

export const authLabel =
  'mb-2 block text-sm font-medium text-ds-text-secondary dark:text-slate-200';

export const authInput =
  'block w-full rounded-ds-input border border-ds-border bg-ds-surface px-3.5 py-3 text-base text-ds-text shadow-sm transition placeholder:text-ds-text-muted hover:border-ds-border-strong focus:border-ds-primary-soft focus:outline-none focus:ring-4 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500';

export const authInputMono =
  'block w-full rounded-ds-input border border-ds-border bg-ds-surface px-3.5 py-3 text-center font-mono text-lg tracking-[0.35em] text-ds-text shadow-sm transition placeholder:text-ds-text-muted hover:border-ds-border-strong focus:border-ds-primary-soft focus:outline-none focus:ring-4 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500';

export const authGhostLink =
  'text-sm font-medium text-ds-text-muted underline-offset-2 hover:text-ds-text hover:underline dark:text-slate-400 dark:hover:text-slate-200';

export const authFooter =
  'mt-6 border-t border-ds-border pt-6 text-center text-sm text-ds-text-muted dark:border-slate-700 dark:text-slate-400';

export const authLink =
  'font-medium text-ds-primary underline-offset-2 hover:text-ds-primary-hover hover:underline dark:text-ds-primary-soft dark:hover:text-violet-200';

export const authLinkMuted =
  'font-medium text-ds-text-muted underline-offset-2 hover:text-ds-text hover:underline dark:text-slate-400 dark:hover:text-white';

export const authAlertError =
  'rounded-ds-card border border-ds-danger-border bg-ds-danger-bg px-3.5 py-3 text-sm text-ds-danger-text dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100';

export const authAlertSuccess =
  'rounded-ds-card border border-ds-success-border bg-ds-success-bg px-3.5 py-3 text-sm text-ds-success-text dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100';

export const authFieldError =
  'mt-1.5 text-sm text-red-600 dark:text-red-400';

/** Logged-in app background (dashboard, future admin views). */
export const appPageBg =
  'min-h-screen bg-gradient-to-br from-ds-canvas-to via-ds-canvas-via to-ds-canvas-from/50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950/20';

/** Max content width + horizontal padding (dashboard header row, `main`, etc.). */
export const appShellInner = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

/** Sticky / top app header bar (full-bleed border/bg; pair inner row with `appShellInner`). */
export const appHeaderBar =
  'border-b border-ds-border/80 bg-ds-surface-glass py-5 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/85';

/** Content panel cards (grids, lists). */
export const appPanelCard =
  'rounded-ds-card border border-ds-border/90 bg-ds-surface/90 p-5 shadow-sm transition hover:border-ds-primary/40 hover:shadow-ds-card dark:border-slate-700/90 dark:bg-slate-900/90 dark:hover:border-ds-primary/30';

/** Small violet-outline control (e.g. “Set up 2FA” in header). */
export const appOutlineLink =
  'inline-flex items-center rounded-lg border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-ds-primary shadow-sm transition hover:bg-violet-50 dark:border-violet-900/50 dark:bg-slate-800/80 dark:text-ds-primary-soft dark:hover:bg-violet-950/40';

/** Section heading inside a dashboard panel. */
export const appSectionHeading =
  'text-base font-semibold tracking-tight text-ds-text dark:text-white';

/** Muted helper text inside panels. */
export const appMutedText =
  'text-sm leading-relaxed text-ds-text-muted dark:text-slate-400';

/** Data row — label + value pair inside a panel. */
export const appDataRow =
  'flex items-center justify-between py-2.5 border-b border-ds-border/60 last:border-0 dark:border-slate-700/60';

/** Label side of a data row. */
export const appDataLabel =
  'text-sm text-ds-text-muted dark:text-slate-400';

/** Value side of a data row. */
export const appDataValue =
  'text-sm font-medium text-ds-text dark:text-slate-200';

/** Status badge colors for audit log decisions. */
export const appDecisionAllow =
  'inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';

export const appDecisionDeny =
  'inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300';

export const appDecisionStepUp =
  'inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
