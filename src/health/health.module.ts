import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../database/prisma.module';
import { CacheModuleConfig } from '../cache/cache.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PrismaModule, CacheModuleConfig, DocumentsModule],
  controllers: [HealthController],
})
export class HealthModule {}
