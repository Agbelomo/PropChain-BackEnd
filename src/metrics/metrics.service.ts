import { Injectable } from '@nestjs/common';
import {
  userRegistrationsTotal,
  userLoginsTotal,
  transactionsTotal,
  propertiesTotal,
  documentsTotal,
  transactionValueHistogram,
} from './metrics.controller';

/**
 * MetricsService
 *
 * Provides dependency-injectable access to Prometheus business metrics counters and histograms.
 * Issue #1248 – Business metrics are declared but never wired into service code paths.
 */
@Injectable()
export class MetricsService {
  readonly userRegistrationsTotal = userRegistrationsTotal;
  readonly userLoginsTotal = userLoginsTotal;
  readonly transactionsTotal = transactionsTotal;
  readonly propertiesTotal = propertiesTotal;
  readonly documentsTotal = documentsTotal;
  readonly transactionValueHistogram = transactionValueHistogram;

  /**
   * Record a new user registration.
   * Cardinality: 2 values ('email' | 'google')
   */
  recordUserRegistration(method: 'email' | 'google' = 'email'): void {
    this.userRegistrationsTotal.inc({ method });
  }

  /**
   * Record a successful user login or authentication.
   * Cardinality: 3 values ('email' | 'google' | 'api-key')
   */
  recordUserLogin(method: 'email' | 'google' | 'api-key' = 'email'): void {
    this.userLoginsTotal.inc({ method });
  }

  /**
   * Record a created transaction and observe its monetary value.
   * Cardinality: 9 combinations (3 types x 3 statuses)
   */
  recordTransaction(type: string, status: string = 'PENDING', amount?: number): void {
    const normalizedType = type ? type.toUpperCase() : 'SALE';
    const normalizedStatus = status ? status.toUpperCase() : 'PENDING';
    this.transactionsTotal.inc({ type: normalizedType, status: normalizedStatus });

    if (typeof amount === 'number' && !isNaN(amount) && amount > 0) {
      this.transactionValueHistogram.observe(amount);
    }
  }

  /**
   * Record a created property listing.
   * Cardinality: 1 (no labels)
   */
  recordPropertyCreated(): void {
    this.propertiesTotal.inc();
  }

  /**
   * Record an uploaded document.
   * Cardinality: bounded by DocumentType enum (7 values)
   */
  recordDocumentUploaded(documentType: string): void {
    const normalizedType = documentType ? documentType.toUpperCase() : 'OTHER';
    this.documentsTotal.inc({ document_type: normalizedType });
  }
}
