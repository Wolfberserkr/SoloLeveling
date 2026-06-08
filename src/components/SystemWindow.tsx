import React from 'react';

type Variant = 'cyan' | 'purple' | 'gold' | 'red';

export function SystemWindow({
  title,
  children,
  variant = 'cyan',
  className = '',
  scan = false,
  right,
}: {
  title?: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  scan?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div
      className={`sys-window sys-window-${variant} ${
        scan ? 'scan-overlay' : ''
      } p-3 md:p-5 animate-fade-in ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="sys-title sys-bracket text-xs md:text-sm">{title}</h2>
          {right}
        </div>
      )}
      {title && <div className="sys-divider mb-3" />}
      {children}
    </div>
  );
}
