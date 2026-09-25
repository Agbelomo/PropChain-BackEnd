import { EmailService, HARD_BOUNCE_SUPPRESSION_THRESHOLD } from './email.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { I18nService } from '../i18n/i18n.service';
import { Queue } from 'bullmq';

function createService(
  prisma: Partial<PrismaService>,
  configGet: (key: string, def?: string) => string | undefined = () => 'http://localhost:3000',
  queueAdd: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  return new EmailService(
    { get: jest.fn().mockImplementation(configGet) } as unknown as ConfigService,
    prisma as unknown as PrismaService,
    { createEmailEngagement: jest.fn() } as unknown as TrackingService,
    { translate: jest.fn((key) => key) } as unknown as I18nService,
    { add: queueAdd } as unknown as Queue,
  );
}

describe('EmailService.handleBounce', () => {
  it('disables email notifications on hard bounce', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      emailBounce: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      userPreferences: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };

    const service = createService(prisma as any);
    await service.handleBounce('test@example.com', 'HARD', 'Mailbox disabled', {
      id: 'evt-1',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    expect(prisma.emailBounce.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        email: 'test@example.com',
        bounceType: 'HARD',
        reason: 'Mailbox disabled',
        rawEvent: { id: 'evt-1' },
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailStatus: 'BOUNCED' },
    });
    expect(prisma.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { emailNotifications: false },
      create: {
        userId: 'user-1',
        emailNotifications: false,
      },
    });
  });
});

describe('EmailService bounce suppression (issue #1233)', () => {
  it('shouldSuppressAddress is true when hard-bounce count meets threshold', async () => {
    const prisma = {
      emailBounce: {
        count: jest.fn().mockResolvedValue(HARD_BOUNCE_SUPPRESSION_THRESHOLD),
      },
    };
    const service = createService(prisma as any);
    await expect(service.shouldSuppressAddress('bounced@example.com')).resolves.toBe(true);
    expect(prisma.emailBounce.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: 'bounced@example.com',
          bounceType: 'HARD',
        }),
      }),
    );
  });

  it('sendEmail skips queue when address is hard-bounced', async () => {
    const queueAdd = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      emailBounce: {
        count: jest
          .fn()
          // first call: hard bounces >= threshold
          .mockResolvedValueOnce(HARD_BOUNCE_SUPPRESSION_THRESHOLD)
          .mockResolvedValue(0),
      },
      user: { findUnique: jest.fn() },
    };
    const service = createService(prisma as any, () => 'https://app.example.com', queueAdd);

    await service.sendEmail({
      to: 'bounced@example.com',
      subject: 'Hello',
      text: 'body',
    });

    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('sendEmail queues when no recent hard bounces', async () => {
    const queueAdd = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      emailBounce: {
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = createService(prisma as any, () => 'https://app.example.com', queueAdd);

    await service.sendEmail({
      to: 'ok@example.com',
      subject: 'Hello',
      text: 'body',
    });

    expect(queueAdd).toHaveBeenCalled();
  });
});

describe('EmailService unsubscribe URL (issue #1232)', () => {
  it('buildListUnsubscribeHeader uses ConfigService FRONTEND_URL at call time', () => {
    const prisma = { emailBounce: { count: jest.fn() } };
    const service = createService(prisma as any, (key: string) =>
      key === 'FRONTEND_URL' ? 'https://tenant-a.example.com' : undefined,
    );
    const header = service.buildListUnsubscribeHeader('user-1', 'u@example.com');
    expect(header).toContain('https://tenant-a.example.com/unsubscribe?token=');
  });

  it('reflects a different FRONTEND_URL when config changes', () => {
    const prisma = { emailBounce: { count: jest.fn() } };
    let frontend = 'https://first.example.com';
    const service = createService(prisma as any, (key: string) =>
      key === 'FRONTEND_URL' ? frontend : undefined,
    );
    expect(service.buildListUnsubscribeHeader('u', 'a@b.com')).toContain(
      'https://first.example.com/unsubscribe',
    );
    frontend = 'https://second.example.com';
    expect(service.buildListUnsubscribeHeader('u', 'a@b.com')).toContain(
      'https://second.example.com/unsubscribe',
    );
  });
});
