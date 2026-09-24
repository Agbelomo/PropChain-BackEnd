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
  });
});