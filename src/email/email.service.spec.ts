import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { I18nService } from '../i18n/i18n.service';
import { Queue } from 'bullmq';

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

    const service = new EmailService(
      { get: jest.fn().mockReturnValue('http://localhost:3000/api') } as unknown as ConfigService,
      prisma as unknown as PrismaService,
      { createEmailEngagement: jest.fn() } as unknown as TrackingService,
      { translate: jest.fn((key) => key) } as unknown as I18nService,
      { add: jest.fn() } as unknown as Queue,
    );

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


describe('EmailService localization (issue #1231)', () => {
  function buildService(i18nTranslate: jest.Mock) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const queue = { add: jest.fn().mockResolvedValue({ id: 'q1' }) };
    const service = new EmailService(
      { get: jest.fn().mockReturnValue('http://localhost:3000/api') } as any,
      prisma as any,
      { createEmailEngagement: jest.fn() } as any,
      {
        translate: i18nTranslate,
        tFor: i18nTranslate,
        resolveLanguage: jest.fn().mockReturnValue('es'),
      } as any,
      queue as any,
    );
    return { service, queue };
  }

  it('injects context.t with Spanish strings when language=es', async () => {
    const i18nTranslate = jest.fn((key: string) => {
      if (key === 'email.password_reset_title') return 'Solicitud de restablecimiento de contraseña';
      if (key === 'email.password_reset_subject') return 'Restablecimiento de contraseña - PropChain';
      return key;
    });
    const { service, queue } = buildService(i18nTranslate);
    await service.sendEmail({
      to: 'user@example.com',
      subject: 'Password Reset - PropChain',
      template: 'password-reset',
      context: { resetUrl: 'https://example.com/reset' },
      language: 'es',
    });
    expect(queue.add).toHaveBeenCalled();
    const payload = queue.add.mock.calls[0][1];
    expect(payload.context.t).toBeDefined();
    expect(payload.context.language).toBe('es');
    expect(payload.context.t.password_reset_title).toBe('Solicitud de restablecimiento de contraseña');
  });
});

