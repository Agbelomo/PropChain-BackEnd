// @ts-nocheck

import { Module } from '@nestjs/common';
import { AuditPruningService } from './audit-pruning.service';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AuditPruningService],
})
export class AuditModule {}
