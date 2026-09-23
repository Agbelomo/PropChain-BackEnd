// @ts-nocheck

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AuditPruningService {
  private readonly logger = new Logger(AuditPruningService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.DAILY)
  async handleCron() {
    this.logger.log('Starting audit log pruning...');
    await this.prune();
    this.logger.log('Audit log pruning finished.');
  }

  async prune() {
    const retentionDays = 365;
    const archivePath = path.join(__dirname, '..', '..', 'archives');

    await fs.mkdir(archivePath, { recursive: true });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const transactionHistoryToPrune = await this.prisma.transactionHistory.findMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    if (transactionHistoryToPrune.length > 0) {
      const archiveFile = path.join(archivePath, `transaction-history-${Date.now()}.json`);
      await fs.writeFile(archiveFile, JSON.stringify(transactionHistoryToPrune, null, 2));
      this.logger.log(
        `Archived ${transactionHistoryToPrune.length} transaction history records to ${archiveFile}`,
      );

      await this.prisma.transactionHistory.deleteMany({
        where: { id: { in: transactionHistoryToPrune.map((log) => log.id) } },
      });
      this.logger.log(`Pruned ${transactionHistoryToPrune.length} transaction history records.`);
    } else {
      this.logger.log('No transaction history records to prune.');
    }

    const loginHistoryToPrune = await this.prisma.loginHistory.findMany({
      where: { timestamp: { lt: cutoffDate } },
    });

    if (loginHistoryToPrune.length > 0) {
      const archiveFile = path.join(archivePath, `login-history-${Date.now()}.json`);
      await fs.writeFile(archiveFile, JSON.stringify(loginHistoryToPrune, null, 2));
      this.logger.log(
        `Archived ${loginHistoryToPrune.length} login history records to ${archiveFile}`,
      );

      await this.prisma.loginHistory.deleteMany({
        where: { id: { in: loginHistoryToPrune.map((log) => log.id) } },
      });
      this.logger.log(`Pruned ${loginHistoryToPrune.length} login history records.`);
    } else {
      this.logger.log('No login history records to prune.');
    }
  }
}
