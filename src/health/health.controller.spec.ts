import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { SignedUrlService } from '../documents/signed-url/signed-url.service';

describe('HealthController', () => {
  let controller: HealthController;

  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  const cacheService = {
    isConnected: jest.fn().mockResolvedValue(true),
  };
  const signedUrlService = {
    isConfigured: jest.fn().mockReturnValue(true),
    activeProviderName: jest.fn().mockReturnValue('s3'),
  };

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.SIGNED_URL_PROVIDER;
    delete process.env.BLOCKCHAIN_RPC_URL;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cacheService },
        { provide: SignedUrlService, useValue: signedUrlService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
    signedUrlService.isConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should report ok for healthz', () => {
    expect(controller.liveness().status).toBe('ok');
  });

  describe('readiness', () => {
    it('should include database and redis checks', async () => {
      const result = await controller.readiness();
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.redis.status).toBe('ok');
      expect(result.status).toBe('ok');
    });

    it('should include storage in readiness when a signed URL provider is set', async () => {
      process.env.SIGNED_URL_PROVIDER = 's3';
      signedUrlService.isConfigured.mockReturnValue(true);

      const result = await controller.readiness();
      expect(result.checks.storage.status).toBe('ok');
      expect(result.status).toBe('ok');
    });

    it('should degrade readiness when storage is configured but not functional', async () => {
      process.env.SIGNED_URL_PROVIDER = 's3';
      signedUrlService.isConfigured.mockReturnValue(false);

      const result = await controller.readiness();
      expect(result.checks.storage.status).toBe('error');
      expect(result.status).toBe('degraded');
    });

    it('should omit storage from readiness when no provider is selected', async () => {
      delete process.env.SIGNED_URL_PROVIDER;
      const result = await controller.readiness();
      expect(result.checks.storage).toBeUndefined();
      expect(result.status).toBe('ok');
    });

    it('should redact raw database driver error and connection strings', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(
        new Error('connect ECONNREFUSED postgresql://propchain_admin:p@ssw0rd123@db.prod.internal:5432/propchain'),
      );
      const result = await controller.readiness();
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.error).toBe('db_unreachable');
      expect(JSON.stringify(result)).not.toContain('p@ssw0rd123');
      expect(JSON.stringify(result)).not.toContain('db.prod.internal');
      expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
      expect(result.status).toBe('degraded');
    });

    it('should redact raw redis connection error', async () => {
      cacheService.isConnected.mockRejectedValueOnce(
        new Error('Redis connection to redis://:secretpass@redis.internal:6379 failed'),
      );
      const result = await controller.readiness();
      expect(result.checks.redis.status).toBe('error');
      expect(result.checks.redis.error).toBe('redis_unreachable');
      expect(JSON.stringify(result)).not.toContain('secretpass');
      expect(JSON.stringify(result)).not.toContain('redis.internal');
      expect(result.status).toBe('degraded');
    });
  });

  describe('startupz', () => {
    const ALL_REQUIRED_TABLES = [
      'users',
      'properties',
      'transactions',
      'documents',
      'sessions',
      'api_keys',
      'export_jobs',
    ].map((table_name) => ({ table_name }));

    it('should report ok and schemaReady true when all required tables exist', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }]) // SELECT 1
        .mockResolvedValueOnce(ALL_REQUIRED_TABLES); // information_schema.tables

      const result = await controller.startup();
      expect(result.status).toBe('ok');
      expect(result.schemaReady).toBe(true);
      expect(result.migrationsApplied).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return schema_unready error when required tables are missing', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ '?column?': 1 }]) // SELECT 1
        .mockResolvedValueOnce([
          { table_name: 'users' },
          { table_name: 'properties' },
          // missing transactions, documents, sessions, api_keys, export_jobs
        ]);

      const result = await controller.startup();
      expect(result.status).toBe('error');
      expect(result.schemaReady).toBe(false);
      expect(result.migrationsApplied).toBe(false);
      expect(result.error).toBe('schema_unready');
    });

    it('should return db_unreachable and redact database driver internals on connection failure', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(
        new Error('FATAL: password authentication failed for user "postgres" at postgresql://postgres:secret@db:5432'),
      );

      const result = await controller.startup();
      expect(result.status).toBe('error');
      expect(result.schemaReady).toBe(false);
      expect(result.migrationsApplied).toBe(false);
      expect(result.error).toBe('db_unreachable');
      expect(JSON.stringify(result)).not.toContain('secret');
      expect(JSON.stringify(result)).not.toContain('FATAL');
    });
  });
});