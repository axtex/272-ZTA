import {
  authStage,
  authSubtitle,
  authTitle,
} from '../design-system/patterns.js';
import { Badge } from './ui/Badge.jsx';
import { Card } from './ui/Card.jsx';

export function AuthBadge({ children }) {
  return <Badge variant="accentDot">{children}</Badge>;
}

export function AuthShell({ badge, title, subtitle, children }) {
  return (
    <div className={authStage}>
      <Card className="w-full max-w-[420px] text-left" variant="frosted">
        <header className="mb-7 text-left">
          {badge}
          <h1 className={authTitle}>{title}</h1>
          {subtitle ? <p className={authSubtitle}>{subtitle}</p> : null}
        </header>
        {children}
      </Card>
    </div>
  );
}
