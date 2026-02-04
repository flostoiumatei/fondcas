'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Header({
  title,
  showBack = false,
  backHref = '/',
  className,
  children,
}: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full',
        'bg-white/80 backdrop-blur-xl',
        'border-b border-border/50',
        'safe-top',
        className
      )}
    >
      <div className="flex items-center h-14 px-4 max-w-3xl mx-auto">
        {showBack && (
          <Link
            href={backHref}
            className="mr-3 p-2 -ml-2 rounded-xl hover:bg-primary/10 transition-all duration-300 group"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        )}

        {title && (
          <h1 className="text-lg font-semibold text-foreground truncate flex-1">
            {title}
          </h1>
        )}

        {children}
      </div>
    </header>
  );
}
