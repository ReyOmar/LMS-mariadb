'use client';

import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-slide-in ${className}`}
    >
      {icon && (
        <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
          <span className="text-muted-foreground/40">{icon}</span>
        </div>
      )}
      <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
