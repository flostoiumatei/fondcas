'use client';

import { cn } from '@/lib/utils';
import { FundAvailabilityStatus } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { CheckCircle2, AlertCircle, XCircle, HelpCircle } from 'lucide-react';

interface FundIndicatorProps {
  status: FundAvailabilityStatus;
  compact?: boolean;
  className?: string;
}

export function FundIndicator({ status, compact = false, className }: FundIndicatorProps) {
  const getStatusConfig = () => {
    switch (status.status) {
      case 'likely_available':
        return {
          icon: CheckCircle2,
          label: 'Probabil disponibile',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          textColor: 'text-green-700',
          iconColor: 'text-green-600',
          pulseClass: 'status-pulse-green',
        };
      case 'uncertain':
        return {
          icon: AlertCircle,
          label: 'Verifică telefonic',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          textColor: 'text-yellow-700',
          iconColor: 'text-yellow-600',
          pulseClass: 'status-pulse-yellow',
        };
      case 'likely_exhausted':
        return {
          icon: XCircle,
          label: 'Probabil epuizate',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          textColor: 'text-red-700',
          iconColor: 'text-red-600',
          pulseClass: 'status-pulse-red',
        };
      default:
        return {
          icon: HelpCircle,
          label: 'Necunoscut',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          textColor: 'text-gray-700',
          iconColor: 'text-gray-600',
          pulseClass: '',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
          config.bgColor,
          config.borderColor,
          config.textColor,
          'border',
          className
        )}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            status.status === 'likely_available' && 'bg-green-500',
            status.status === 'uncertain' && 'bg-yellow-500',
            status.status === 'likely_exhausted' && 'bg-red-500'
          )}
        />
        {config.label}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-1 rounded-full', config.pulseClass)}>
          <Icon className={cn('h-5 w-5', config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={cn('font-semibold text-sm', config.textColor)}>
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {status.confidence}% încredere
            </span>
          </div>

          {/* Progress bar */}
          {status.allocatedAmount > 0 && (
            <div className="mb-2">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    status.status === 'likely_available' && 'bg-green-500',
                    status.status === 'uncertain' && 'bg-yellow-500',
                    status.status === 'likely_exhausted' && 'bg-red-500'
                  )}
                  style={{
                    width: `${Math.min(100, (status.estimatedConsumed / status.allocatedAmount) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>
                  Consumat: ~{formatCurrency(status.estimatedConsumed)}
                </span>
                <span>
                  Total: {formatCurrency(status.allocatedAmount)}
                </span>
              </div>
            </div>
          )}

          <p className={cn('text-sm', config.textColor)}>
            {status.message}
          </p>

          {status.lastUserReport && (
            <p className="text-xs text-muted-foreground mt-1">
              Ultimul raport: {status.lastUserReport.type === 'funds_available' ? 'Fonduri disponibile' : 'Fonduri epuizate'}
              {status.lastUserReport.isRecent && ' (recent)'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
