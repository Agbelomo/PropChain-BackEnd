export interface FraudConfig {
  lockoutAttempts: number;
  highSeverityFailures: number;
  mediumSeverityFailures: number;
  highSeverityScore: number;
  mediumSeverityScore: number;
  maxGeoDistanceKm: number;
  minDeviceSimilarity: number;
}

export function getFraudConfig(): FraudConfig {
  return {
    lockoutAttempts: parseInt(process.env.FRAUD_LOCKOUT_ATTEMPTS ?? '5', 10),
    highSeverityFailures: parseInt(process.env.FRAUD_HIGH_FAILURES ?? '10', 10),
    mediumSeverityFailures: parseInt(process.env.FRAUD_MEDIUM_FAILURES ?? '5', 10),
    highSeverityScore: parseInt(process.env.FRAUD_HIGH_SCORE ?? '82', 10),
    mediumSeverityScore: parseInt(process.env.FRAUD_MEDIUM_SCORE ?? '58', 10),
    maxGeoDistanceKm: parseFloat(process.env.FRAUD_GEO_MAX_KM ?? '500'),
    minDeviceSimilarity: parseFloat(process.env.FRAUD_DEVICE_SIMILARITY ?? '0.8'),
  };
}

export const FRAUD_THRESHOLDS = getFraudConfig();
