import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  TransactionAnalyticsDto,
  TransactionAnalyticsGranularity,
  TransactionAnalyticsQueryDto,
} from './dto/transaction.dto';

@Injectable()
export class TransactionAnalyticsService {
  private readonly logger = new Logger(TransactionAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(query?: TransactionAnalyticsQueryDto): Promise<TransactionAnalyticsDto> {
    const granularity = query?.granularity ?? TransactionAnalyticsGranularity.MONTH;
    const now = new Date();
    const startDate = query?.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), 0, 1);
    const endDate = query?.endDate ? new Date(query.endDate) : now;

    const transactions = await this.prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        deleted: false,
      },
      select: {
        amount: true,
        status: true,
        createdAt: true,
      },
    });

    let totalVolume = 0;
    let completedCount = 0;
    let totalRevenue = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      totalVolume += amount;
      if (tx.status === 'COMPLETED') {
        completedCount++;
        totalRevenue += amount;
      }
    }

    const totalCount = transactions.length;
    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    const averageTransactionValue = totalCount > 0 ? totalVolume / totalCount : 0;

    const volumeTrends = this.buildVolumeTrends(transactions, granularity);

    return {
      granularity,
      summary: {
        totalVolume: Math.round(totalVolume * 100) / 100,
        totalTransactions: totalCount,
        completedTransactions: completedCount,
        completionRate: Math.round(completionRate * 100) / 100,
        averageTransactionValue: Math.round(averageTransactionValue * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      },
      volumeTrends,
    };
  }

  private buildVolumeTrends(
    transactions: Array<{ amount: unknown; status: string; createdAt: Date }>,
    granularity: TransactionAnalyticsGranularity,
  ) {
    const buckets = new Map<
      string,
      {
        transactionCount: number;
        totalVolume: number;
        completedCount: number;
        revenue: number;
      }
    >();

    for (const transaction of transactions) {
      const period = this.formatAnalyticsPeriod(transaction.createdAt, granularity);
      const amount = Number(transaction.amount);
      const bucket = buckets.get(period) ?? {
        transactionCount: 0,
        totalVolume: 0,
        completedCount: 0,
        revenue: 0,
      };

      bucket.transactionCount += 1;
      bucket.totalVolume += amount;

      if (transaction.status === 'COMPLETED') {
        bucket.completedCount += 1;
        bucket.revenue += amount;
      }

      buckets.set(period, bucket);
    }

    return [...buckets.entries()].map(([period, bucket]) => ({
      period,
      transactionCount: bucket.transactionCount,
      totalVolume: Math.round(bucket.totalVolume * 100) / 100,
      completedCount: bucket.completedCount,
      revenue: Math.round(bucket.revenue * 100) / 100,
    }));
  }

  private formatAnalyticsPeriod(date: Date, granularity: TransactionAnalyticsGranularity): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    if (granularity === TransactionAnalyticsGranularity.DAY) {
      return `${year}-${month}-${day}`;
    }

    if (granularity === TransactionAnalyticsGranularity.WEEK) {
      const week = this.getIsoWeek(date);
      return `${week.year}-W${String(week.week).padStart(2, '0')}`;
    }

    return `${year}-${month}`;
  }

  private getIsoWeek(date: Date): { year: number; week: number } {
    const normalized = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = normalized.getUTCDay() || 7;
    normalized.setUTCDate(normalized.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((normalized.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

    return { year: normalized.getUTCFullYear(), week };
  }
}
