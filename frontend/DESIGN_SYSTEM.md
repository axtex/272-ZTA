# Frontend design system (Hospital ZTA)

## Stack

- **Tailwind CSS v4** with `@tailwindcss/vite`
- **Tokens** live in `src/design-system/theme.css` (`@theme { … }`) — use utilities like `bg-ds-primary`, `text-ds-text-muted`, `rounded-ds-input`, `shadow-ds-card`.
- **Composed layout strings** live in `src/design-system/patterns.js` — import named exports for full-page backgrounds, auth copy, app shell, etc.
- **Reusable components** live in `src/components/ui/` — prefer these over one-off markup.

## Tokens (`theme.css`)

| Token prefix | Use for |
|--------------|---------|
| `ds-primary`, `ds-fuchsia` | Brand actions, gradients, focus rings |
| `ds-canvas-*` | Page wash / gradients (with `dark:` overrides where needed) |
| `ds-surface`, `ds-surface-glass`, `ds-border` | Cards, inputs, dividers |
| `ds-text`, `ds-text-secondary`, `ds-text-muted` | Body hierarchy |
| `ds-danger-*`, `ds-success-*` | Alerts and validation |
| `radius-ds-*`, `shadow-ds-*` | Corners and elevation |

Add new semantic colors here **only** — avoid arbitrary hex in JSX.

## Patterns (`patterns.js`)

| Export | When to use |
|--------|-------------|
| `authStage` | Full-screen centered flow (login, register, MFA) outer wrapper |
| `authTitle`, `authSubtitle`, `authLabel`, `authInput`, `authInputMono` | Typography + fields inside `AuthShell` |
| `authFooter`, `authLink`, `authLinkMuted`, `authGhostLink` | Footers and tertiary links |
| `authFieldError` | Inline field errors (with `role="alert"`) |
| `appPageBg`, `appHeaderBar`, `appPanelCard`, `appOutlineLink` | Logged-in shell (dashboard, future admin) |

Do **not** duplicate long class strings on new pages — add a **named export** in `patterns.js` if you need a new variant.

## UI components (`src/components/ui/`)

Import from `components/ui/index.js`:

| Component | Role |
|-----------|------|
| `Button` | `variant`: `primary` \| `secondary` \| `ghost`; `loading`, `type`, `disabled` |
| `Card` | `variant`: `frosted` \| `solid`; frosted = auth / glass panels |
| `Badge` | `variant`: `accentDot` (auth header pill) \| `soft` (chips) \| `outline` |
| `Alert` | `variant`: `error` \| `success` \| `info` |
| `TextLink` | Router `Link` with `variant`: `accent` \| `muted` |
| `Spinner` | `size`: `sm` \| `md`; `theme`: `light` \| `brand` \| `slate` |

### Auth flows

Compose **`AuthShell`** + **`AuthBadge`** (uses `Badge` internally) + **`Card`** (inside `AuthShell`). Example: `LoginPage.jsx`, `Register.jsx`, `MfaVerifyPage.jsx`, `MfaSetupPage.jsx`.

### Logged-in app

Follow **`DashboardPage.jsx`**: `appPageBg` + `appHeaderBar` + `appPanelCard` for content grids.

## Global CSS (`src/index.css`)

- Keep **`@import './design-system/theme.css'`** immediately after `@import 'tailwindcss'`.
- **`#root`**: full width, `text-align: start`, `min-height: 100svh`. Do not reintroduce centered column layouts that fight auth cards.
- Avoid global **`h1` / `h2` size rules** that override page-level Tailwind headings.

## Checklist for new screens

1. Use existing **`patterns`** and **`ui/*`** first.
2. Extend **`theme.css`** if you need a new semantic color or shadow.
3. **No new page-level `.css` files** unless there is a strong reason (e.g. keyframes, third-party overrides).
4. Run **`npm run lint`** and **`npm run build`** before pushing.
