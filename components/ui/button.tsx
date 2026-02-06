import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        // Primary gradient - main CTA buttons
        default:
          'bg-gradient-to-r from-primary to-cyan-500 text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110',
        // Accent gradient - secondary important actions
        accent:
          'bg-gradient-to-r from-accent to-purple-500 text-white shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/30 hover:brightness-110',
        // Outline with primary color - filter buttons, secondary actions
        outline:
          'border-2 border-primary/30 bg-white/80 backdrop-blur-sm text-primary hover:bg-primary/10 hover:border-primary/50',
        // Soft primary - load more, subtle actions
        soft:
          'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40',
        // Ghost - minimal footprint
        ghost:
          'text-primary hover:bg-primary/10',
        // Secondary - less prominent actions
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // Destructive actions
        destructive:
          'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/25 hover:shadow-xl',
        // Success state
        success:
          'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl',
        // Warning state
        warning:
          'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 hover:shadow-xl',
        // Link style
        link:
          'text-primary underline-offset-4 hover:underline p-0 h-auto',
        // Filter pill - for horizontal filter bars
        filter:
          'bg-white/90 backdrop-blur-sm border border-primary/20 text-foreground hover:border-primary/40 hover:bg-primary/5 font-medium',
        // Filter active state
        filterActive:
          'bg-primary/15 backdrop-blur-sm border border-primary/40 text-primary font-medium',
      },
      size: {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        xl: 'h-14 px-10 text-lg',
        icon: 'h-11 w-11',
        iconSm: 'h-9 w-9',
        iconLg: 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
