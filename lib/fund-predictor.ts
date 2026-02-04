import { supabase, TABLES } from './supabase';
import { PredictionOutput, UserReport, ProviderConsumptionPattern } from './types';
import { getDayOfMonth, getDaysInMonth } from './utils';

/**
 * ML-based fund availability predictor using historical consumption patterns
 */
export class FundAvailabilityPredictor {
  // Seasonal patterns based on historical data analysis
  private seasonalPatterns: Record<string, Record<number, number>> = {
    paraclinic: {
      1: 0.85, 2: 0.95, 3: 1.0, 4: 1.0, 5: 1.0, 6: 0.9,
      7: 0.85, 8: 0.8, 9: 1.1, 10: 1.1, 11: 1.05, 12: 1.15,
    },
    recovery: {
      1: 0.9, 2: 1.0, 3: 1.0, 4: 1.0, 5: 0.95, 6: 0.85,
      7: 0.8, 8: 0.75, 9: 1.1, 10: 1.1, 11: 1.0, 12: 1.1,
    },
    clinic: {
      1: 0.88, 2: 0.95, 3: 1.02, 4: 1.0, 5: 0.98, 6: 0.92,
      7: 0.85, 8: 0.82, 9: 1.08, 10: 1.05, 11: 1.02, 12: 1.12,
    },
    default: {
      1: 0.9, 2: 0.95, 3: 1.0, 4: 1.0, 5: 1.0, 6: 0.95,
      7: 0.9, 8: 0.85, 9: 1.05, 10: 1.05, 11: 1.0, 12: 1.1,
    },
  };

  /**
   * Get provider's historical consumption pattern
   */
  private async getProviderPattern(providerCui: string): Promise<ProviderConsumptionPattern | null> {
    try {
      const { data, error } = await supabase
        .from(TABLES.PROVIDER_CONSUMPTION_PATTERNS)
        .select('*')
        .eq('provider_cui', providerCui)
        .single();

      if (error || !data) return null;
      return data as ProviderConsumptionPattern;
    } catch {
      return null;
    }
  }

  /**
   * Get global average pattern for service type
   */
  private getGlobalPattern(serviceType: string): { depletion_curve: Record<number, number> } {
    // Linear depletion curve as default
    const depletionCurve: Record<number, number> = {};
    for (let d = 1; d <= 31; d++) {
      depletionCurve[d] = d / 30; // Linear consumption
    }
    return { depletion_curve: depletionCurve };
  }

  /**
   * Get seasonal multiplier for a given month and service type
   */
  private getSeasonalMultiplier(month: number, serviceType: string): number {
    const patterns = this.seasonalPatterns[serviceType] || this.seasonalPatterns.default;
    return patterns[month] || 1.0;
  }

  /**
   * Calculate adjustment based on recent user reports
   */
  private calculateReportsAdjustment(reports: UserReport[]): number {
    if (reports.length === 0) return 0;

    const now = Date.now();
    let adjustment = 0;
    let totalWeight = 0;

    for (const report of reports) {
      const hoursAgo = (now - new Date(report.reported_at).getTime()) / (1000 * 60 * 60);
      const weight = Math.exp(-hoursAgo / 24); // Exponential decay over 24h

      if (report.report_type === 'funds_available') {
        adjustment += 0.2 * weight;
      } else if (report.report_type === 'funds_exhausted') {
        adjustment -= 0.4 * weight; // Negative reports weighted more
      }

      totalWeight += weight;
    }

    return totalWeight > 0 ? adjustment / totalWeight : 0;
  }

  /**
   * Calculate confidence based on data quality
   */
  private calculateConfidence(
    pattern: ProviderConsumptionPattern | null,
    reports: UserReport[]
  ): number {
    let confidence = 30; // Base confidence

    // Add confidence for historical data
    if (pattern) {
      const dataPoints = pattern.data_points_count || 0;
      if (dataPoints >= 24) confidence += 30; // 2+ years of data
      else if (dataPoints >= 12) confidence += 20; // 1+ year
      else if (dataPoints >= 6) confidence += 10; // 6+ months
    }

    // Add confidence for recent reports
    const recentReports = reports.filter(
      (r) => Date.now() - new Date(r.reported_at).getTime() < 24 * 60 * 60 * 1000
    );
    if (recentReports.length > 0) confidence += 15;

    return Math.min(95, confidence);
  }

  /**
   * Determine risk level
   */
  private calculateRiskLevel(
    probability: number,
    dayOfMonth: number,
    pattern: ProviderConsumptionPattern | null
  ): 'low' | 'medium' | 'high' {
    if (probability < 0.3) return 'high';
    if (probability < 0.5 && dayOfMonth > 20) return 'high';

    if (pattern?.early_depletion_frequency && pattern.early_depletion_frequency > 0.5) {
      if (dayOfMonth > 15) return 'high';
      if (dayOfMonth > 10) return 'medium';
    }

    if (probability < 0.6) return 'medium';
    return 'low';
  }

  /**
   * Predict depletion date
   */
  private predictDepletionDate(
    allocatedAmount: number,
    dailyConsumptionRate: number,
    currentDate: Date
  ): Date | null {
    if (dailyConsumptionRate <= 0) return null;

    const daysInMonth = getDaysInMonth();
    const dayOfMonth = getDayOfMonth();
    const remainingBudgetRatio = 1 - (dayOfMonth / daysInMonth);
    const remainingDays = Math.floor(remainingBudgetRatio / dailyConsumptionRate);

    if (remainingDays > daysInMonth - dayOfMonth) return null; // Won't deplete this month

    const depletionDate = new Date(currentDate);
    depletionDate.setDate(depletionDate.getDate() + Math.max(1, remainingDays));

    return depletionDate;
  }

  /**
   * Generate human-readable explanation in Romanian
   */
  private generateExplanation(
    probability: number,
    riskLevel: 'low' | 'medium' | 'high',
    dayOfMonth: number,
    depletionDate: Date | null
  ): string {
    const probabilityPercent = Math.round(probability * 100);

    if (riskLevel === 'low') {
      return `Probabilitate ${probabilityPercent}% de fonduri disponibile. Risc scăzut.`;
    }

    if (riskLevel === 'medium') {
      if (depletionDate) {
        return `Probabilitate ${probabilityPercent}%. Fondurile ar putea fi epuizate în jurul datei de ${depletionDate.getDate()}. Recomandăm verificare telefonică.`;
      }
      return `Probabilitate ${probabilityPercent}%. Suntem în ziua ${dayOfMonth} a lunii - verificați telefonic.`;
    }

    // High risk
    return `Probabilitate scăzută (${probabilityPercent}%) de fonduri disponibile. Vă rugăm sunați clinica pentru confirmare înainte de deplasare.`;
  }

  /**
   * Main prediction method
   */
  async predict(input: {
    providerId: string;
    providerCui: string;
    serviceType: string;
    currentDate: Date;
    allocatedAmount: number;
    recentUserReports: UserReport[];
  }): Promise<PredictionOutput> {
    const { providerCui, serviceType, currentDate, allocatedAmount, recentUserReports } = input;

    // 1. Get provider's historical pattern
    const pattern = await this.getProviderPattern(providerCui);

    // 2. Get global patterns for fallback
    const globalPattern = this.getGlobalPattern(serviceType);

    // 3. Calculate base prediction from historical consumption rate
    const dayOfMonth = getDayOfMonth();
    const month = currentDate.getMonth() + 1;

    // Use provider-specific pattern if available, else global
    const depletionCurve = pattern?.depletion_curve || globalPattern.depletion_curve;
    const expectedConsumptionRate =
      (depletionCurve as Record<number, number>)[dayOfMonth] || dayOfMonth / 30;

    // 4. Apply seasonality adjustment
    const seasonalMultiplier = this.getSeasonalMultiplier(month, serviceType);
    const adjustedConsumptionRate = expectedConsumptionRate * seasonalMultiplier;

    // 5. Calculate predicted remaining
    const predictedConsumed = allocatedAmount * adjustedConsumptionRate;
    const predictedRemaining = allocatedAmount - predictedConsumed;

    // 6. Factor in recent user reports
    const reportsAdjustment = this.calculateReportsAdjustment(recentUserReports);

    // 7. Calculate final probability
    let availabilityProbability = predictedRemaining / allocatedAmount;
    availabilityProbability = Math.max(0, Math.min(1, availabilityProbability + reportsAdjustment));

    // 8. Calculate confidence
    const confidence = this.calculateConfidence(pattern, recentUserReports);

    // 9. Determine risk level
    const riskLevel = this.calculateRiskLevel(availabilityProbability, dayOfMonth, pattern);

    // 10. Predict depletion date
    const avgRate = pattern?.avg_consumption_rate || 0.033; // Default ~1/30 per day
    const depletionDate = this.predictDepletionDate(allocatedAmount, avgRate, currentDate);

    // 11. Generate explanation
    const explanation = this.generateExplanation(
      availabilityProbability,
      riskLevel,
      dayOfMonth,
      depletionDate
    );

    return {
      predictedAvailability: availabilityProbability,
      predictedRemainingAmount: Math.max(0, predictedRemaining),
      predictedDepletionDate: depletionDate?.toISOString() || null,
      confidence,
      riskLevel,
      factors: {
        historicalPattern: pattern ? 0.4 : 0.1,
        dayOfMonthEffect: 0.25,
        seasonalityEffect: 0.15,
        recentReportsEffect: recentUserReports.length > 0 ? 0.3 : 0,
        providerSizeEffect: 0.1,
      },
      explanation,
    };
  }
}

// Export singleton instance
export const fundPredictor = new FundAvailabilityPredictor();
