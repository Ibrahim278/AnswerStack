import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex justify-center py-10">
      <div className="flex max-w-[560px] flex-col items-center gap-4 rounded-lg border border-border bg-card p-8">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="max-w-[400px] text-center text-sm text-muted-foreground">
          {description}
        </p>
        {action && (
          <Button onClick={action.onClick}>{action.label}</Button>
        )}
      </div>
    </div>
  );
}
