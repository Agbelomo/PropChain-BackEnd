import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../database/prisma.service';
import { CreateWebhookDto } from './webhook.dto';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      webhook: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
      },
      webhookDeliveryLog: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      activityLog: {
        create: jest.fn().mockResolvedValue({ id: 'act-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhooksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a webhook and returns it with the plaintext secret', async () => {
      const dto: CreateWebhookDto = {
        url: 'https://example.com/hook',
        eventTypes: ['transaction.created'],
        description: 'test webhook',
      } as unknown as CreateWebhookDto;

      prisma.webhook.create.mockResolvedValue({
        id: 'wh-1',
        userId: 'user-1',
        url: dto.url,
        secret: 'stored-secret',
        events: dto.eventTypes,
        description: dto.description,
      });

      const result = await service.create('user-1', dto);

      expect(prisma.webhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          url: dto.url,
          events: dto.eventTypes,
          description: dto.description,
          secret: expect.any(String),
        }),
      });
      expect(result).toHaveProperty('secret');
    });
  });

  describe('findAll', () => {
    it('should return webhooks for a user', async () => {
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', userId: 'user-1', url: 'https://example.com' },
      ]);

      const result = await service.findAll('user-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.findOne('bad-id', 'user-1')).rejects.toThrow();
    });
  });

  describe('rotateSecret', () => {
    it('rotates secret, updates db, records audit log, and returns new secret', async () => {
      const existing = { id: 'wh-1', userId: 'user-1', secret: 'old-secret' };
      prisma.webhook.findFirst.mockResolvedValue(existing);
      prisma.webhook.update.mockImplementation(async ({ data }: any) => ({
        ...existing,
        ...data,
      }));

      const result = await service.rotateSecret('wh-1', 'user-1');

      expect(result.secret).toBeDefined();
      expect(result.secret).not.toBe('old-secret');
      expect(prisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { secret: result.secret },
      });
      expect(prisma.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'WEBHOOK_SECRET_ROTATED',
          entityType: 'WEBHOOK',
          entityId: 'wh-1',
        }),
      });
    });

    it('throws NotFoundException when rotating non-existent webhook', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.rotateSecret('bad-id', 'user-1')).rejects.toThrow();
    });
  });

  describe('Retry Backoff Schedule (#1256)', () => {
    it('maps attempts to correct 0-based delays', () => {
      expect(service.getRetryDelay(1)).toBe(1000);
      expect(service.getRetryDelay(2)).toBe(5000);
      expect(service.getRetryDelay(3)).toBe(15000);
      expect(service.getRetryDelay(4)).toBe(60000);
      expect(service.getRetryDelay(5)).toBe(300000);
      expect(service.getRetryDelay(99)).toBe(300000);
    });
  });

  describe('pruneOldDeliveryLogs', () => {
    it('deletes delivery logs older than specified retention days', async () => {
      const res = await service.pruneOldDeliveryLogs(30);
      expect(prisma.webhookDeliveryLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
        },
      });
      expect(res.count).toBe(5);
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.remove('bad-id', 'user-1')).rejects.toThrow();
    });
  });
});
