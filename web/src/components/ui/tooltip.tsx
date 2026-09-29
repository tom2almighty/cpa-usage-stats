import * as React from 'react';
import { cn } from '@/lib/utils';

export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && content && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-md transition-opacity',
            className,
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
