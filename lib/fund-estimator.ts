import { FundAllocation, UserReport, FundAvailabilityStatus, ReportType } from './types';
import { getDayOfMonth, getDaysInMonth, getMonthName } from './utils';

/**
 * Simple rule-based fund availability estimator
 * Used as a fallback when ML prediction isn't available
 */
export function estimateFundAvailability(
  allocation: FundAllocation | null,
  userReports: UserReport[],
  currentDate: Date = new Date()
): FundAvailabilityStatus {
  const dayOfMonth = getDayOfMonth();
  const daysInMonth = getDaysInMonth();
  const monthName = getMonthName(currentDate.getMonth() + 1);

  // No allocation data
  if (!allocation || !allocation.allocated_amount) {
    return {
      status: 'uncertain',
      confidence: 20,
      allocatedAmount: 0,
      estimatedConsumed: 0,
      estimatedAvailable: 0,
      dayOfMonth,
      message: 'Nu avem date despre alocarea fondurilor. Vă rugăm să contactați clinica.',
    };
  }

  const allocatedAmount = allocation.allocated_amount;

  // If we have actual consumed amount from data
  if (allocation.consumed_amount !== null && allocation.consumed_amount !== undefined) {
    const estimatedAvailable = allocatedAmount - allocation.consumed_amount;
    const consumptionPercent = allocation.consumed_amount / allocatedAmount;

    if (consumptionPercent >= 0.95) {
      return {
        status: 'likely_exhausted',
        confidence: 90,
        allocatedAmount,
        estimatedConsumed: allocation.consumed_amount,
        estimatedAvailable: Math.max(0, estimatedAvailable),
        dayOfMonth,
        message: `Fondurile pentru ${monthName} sunt aproape epuizate (${Math.round(consumptionPercent * 100)}% consumate).`,
      };
    }

    if (consumptionPercent >= 0.8) {
      return {
        status: 'uncertain',
        confidence: 70,
        allocatedAmount,
        estimatedConsumed: allocation.consumed_amount,
        estimatedAvailable: Math.max(0, estimatedAvailable),
        dayOfMonth,
        message: `Fonduri limitate - ${Math.round((1 - consumptionPercent) * 100)}% disponibile. Verificați telefonic.`,
      };
    }

    return {
      status: 'likely_available',
      confidence: 85,
      allocatedAmount,
      estimatedConsumed: allocation.consumed_amount,
      estimatedAvailable: Math.max(0, estimatedAvailable),
      dayOfMonth,
      message: `Fonduri disponibile - aproximativ ${Math.round((1 - consumptionPercent) * 100)}% din bugetul lunar.`,
    };
  }

  // Estimate based on linear consumption and day of month
  const estimatedConsumptionRate = allocatedAmount / daysInMonth;
  const estimatedConsumed = estimatedConsumptionRate * dayOfMonth;
  const estimatedAvailable = allocatedAmount - estimatedConsumed;

  // Check recent user reports (last 48 hours)
  const recentReports = userReports.filter(
    (r) => Date.now() - new Date(r.reported_at).getTime() < 48 * 60 * 60 * 1000
  );

  // Sort by most recent
  const sortedReports = recentReports.sort(
    (a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()
  );

  const lastReport = sortedReports[0];

  // Determine status based on reports and day of month
  let status: FundAvailabilityStatus['status'];
  let confidence: number;
  let message: string;

  if (lastReport?.report_type === 'funds_exhausted') {
    const reportAge = Date.now() - new Date(lastReport.reported_at).getTime();
    const hoursAgo = Math.round(reportAge / (1000 * 60 * 60));

    status = 'likely_exhausted';
    confidence = hoursAgo < 6 ? 90 : hoursAgo < 24 ? 75 : 60;
    message = `Utilizator a raportat fonduri epuizate acum ${hoursAgo} ${hoursAgo === 1 ? 'oră' : 'ore'}. Verificați telefonic.`;
  } else if (lastReport?.report_type === 'funds_available') {
    const reportAge = Date.now() - new Date(lastReport.reported_at).getTime();
    const hoursAgo = Math.round(reportAge / (1000 * 60 * 60));

    status = 'likely_available';
    confidence = hoursAgo < 6 ? 85 : hoursAgo < 24 ? 70 : 55;
    message = `Utilizator a confirmat fonduri disponibile acum ${hoursAgo} ${hoursAgo === 1 ? 'oră' : 'ore'}.`;
  } else if (dayOfMonth <= 7) {
    // First week of month
    status = 'likely_available';
    confidence = 75;
    message = `Început de lună - probabilitate mare de fonduri disponibile.`;
  } else if (dayOfMonth <= 15) {
    // First half of month
    status = 'likely_available';
    confidence = 60;
    message = `Prima jumătate a lunii - fonduri probabil disponibile.`;
  } else if (dayOfMonth <= 22) {
    // Third week
    status = 'uncertain';
    confidence = 45;
    message = `A treia săptămână a lunii - recomandăm verificare telefonică.`;
  } else {
    // Last week
    status = estimatedAvailable > allocatedAmount * 0.2 ? 'uncertain' : 'likely_exhausted';
    confidence = 40;
    message = `Sfârșit de lună - fondurile se pot epuiza. Sunați pentru confirmare.`;
  }

  return {
    status,
    confidence,
    allocatedAmount,
    estimatedConsumed,
    estimatedAvailable: Math.max(0, estimatedAvailable),
    dayOfMonth,
    lastUserReport: lastReport
      ? {
          type: lastReport.report_type as ReportType,
          reportedAt: lastReport.reported_at,
          isRecent: Date.now() - new Date(lastReport.reported_at).getTime() < 24 * 60 * 60 * 1000,
        }
      : undefined,
    message,
  };
}

/**
 * Get status color class based on availability status
 */
export function getStatusColor(status: FundAvailabilityStatus['status']): string {
  switch (status) {
    case 'likely_available':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'uncertain':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'likely_exhausted':
      return 'text-red-600 bg-red-50 border-red-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

/**
 * Get status icon based on availability status
 */
export function getStatusIcon(status: FundAvailabilityStatus['status']): string {
  switch (status) {
    case 'likely_available':
      return '✓';
    case 'uncertain':
      return '?';
    case 'likely_exhausted':
      return '✗';
    default:
      return '•';
  }
}

/**
 * Get status label in Romanian
 */
export function getStatusLabel(status: FundAvailabilityStatus['status']): string {
  switch (status) {
    case 'likely_available':
      return 'Probabil disponibile';
    case 'uncertain':
      return 'Incert';
    case 'likely_exhausted':
      return 'Probabil epuizate';
    default:
      return 'Necunoscut';
  }
}
