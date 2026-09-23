import { LoginRateLimitService } from './login-rate-limit.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

interface MockPrisma {
  loginAttempt: {
    findFirst: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
}

function makeConfigService(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values: Record<string, string | undefined> = {
    LOGIN_MAX_ATTEMPTS: undefined,
    LOGIN_LOCKOUT_MINUTES: undefined,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('LoginRateLimitService', () => {
  let service: LoginRateLimitService;
  let mockPrisma: MockPrisma;

  const email = 'test@example.com';
  const ip = '1.2.3.4';

  beforeEach(() => {
    mockPrisma = {
      loginAttempt: {
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new LoginRateLimitService(
      mockPrisma as unknown as PrismaService,
      makeConfigService(),
    );
  });

  describe('isAccountLocked', () => {
    it('returns true when a locked attempt exists', async () => {
      mockPrisma.loginAttempt.findFirst.mockResolvedValue({ id: '1' });
      expect(await service.isAccountLocked(email)).toBe(true);
    });

    it('returns false when no locked attempt exists', async () => {
      mockPrisma.loginAttempt.findFirst.mockResolvedValue(null);
      expect(await service.isAccountLocked(email)).toBe(false);
    });
  });

  describe('recordFailedAttempt', () => {
    it('returns false and records attempt when below threshold', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(2); // 2 previous + 1 = 3, below 5
      const shouldLock = await service.recordFailedAttempt(email, ip);
      expect(shouldLock).toBe(false);
      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email, ipAddress: ip, success: false, lockedOut: false }),
        }),
      );
    });

    it('returns true and locks account when threshold reached', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(4); // 4 previous + 1 = 5, equals threshold
      const shouldLock = await service.recordFailedAttempt(email, ip);
      expect(shouldLock).toBe(true);
      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lockedOut: true, unlockAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('env-driven lockout config (#1190)', () => {
    it('locks after LOGIN_MAX_ATTEMPTS when configured', async () => {
      service = new LoginRateLimitService(
        mockPrisma as unknown as PrismaService,
        makeConfigService({ LOGIN_MAX_ATTEMPTS: '3' }),
      );
      mockPrisma.loginAttempt.count.mockResolvedValue(2); // 2 + 1 = 3
      expect(await service.recordFailedAttempt(email, ip)).toBe(true);
    });

    it('does not lock below the configured LOGIN_MAX_ATTEMPTS', async () => {
      service = new LoginRateLimitService(
        mockPrisma as unknown as PrismaService,
        makeConfigService({ LOGIN_MAX_ATTEMPTS: '3' }),
      );
      mockPrisma.loginAttempt.count.mockResolvedValue(1); // 1 + 1 = 2 < 3
      expect(await service.recordFailedAttempt(email, ip)).toBe(false);
    });

    it('applies the configured LOGIN_LOCKOUT_MINUTES lockout window', async () => {
      service = new LoginRateLimitService(
        mockPrisma as unknown as PrismaService,
        makeConfigService({ LOGIN_LOCKOUT_MINUTES: '5' }),
      );
      mockPrisma.loginAttempt.count.mockResolvedValue(4);
      await service.recordFailedAttempt(email, ip);
      const unlockAt = mockPrisma.loginAttempt.create.mock.calls[0][0].data.unlockAt;
      const deltaMinutes = Math.round((unlockAt.getTime() - Date.now()) / (60 * 1000));
      expect(deltaMinutes).toBe(5);
    });

    it('falls back to defaults for invalid values', async () => {
      service = new LoginRateLimitService(
        mockPrisma as unknown as PrismaService,
        makeConfigService({ LOGIN_MAX_ATTEMPTS: 'abc', LOGIN_LOCKOUT_MINUTES: '-1' }),
      );
      mockPrisma.loginAttempt.count.mockResolvedValue(4); // default threshold 5
      expect(await service.recordFailedAttempt(email, ip)).toBe(true);
    });
  });

  describe('recordSuccessfulAttempt', () => {
    it('records a successful login attempt', async () => {
      await service.recordSuccessfulAttempt(email, ip);
      expect(mockPrisma.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email, success: true, lockedOut: false }),
        }),
      );
    });
  });

  describe('unlockAccount', () => {
    it('clears locked attempts for the account', async () => {
      await service.unlockAccount(email);
      expect(mockPrisma.loginAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: email.toLowerCase(), lockedOut: true }),
          data: expect.objectContaining({ lockedOut: false, unlockAt: null }),
        }),
      );
    });
  });

  describe('getLockoutInfo', () => {
    it('returns null when no attempts exist', async () => {
      mockPrisma.loginAttempt.count.mockResolvedValue(0);
      mockPrisma.loginAttempt.findFirst.mockResolvedValue(null);
      expect(await service.getLockoutInfo(email)).toBeNull();
    });

    it('returns lockout info when account is locked', async () => {
      const unlockAt = new Date(Date.now() + 30 * 60 * 1000);
      mockPrisma.loginAttempt.count.mockResolvedValue(5);
      mockPrisma.loginAttempt.findFirst
        .mockResolvedValueOnce({ id: '1' }) // isAccountLocked
        .mockResolvedValueOnce({ unlockAt }); // getLockoutInfo detail
      const info = await service.getLockoutInfo(email);
      expect(info).not.toBeNull();
      expect(info?.isLocked).toBe(true);
      expect(info?.failedAttempts).toBe(5);
      expect(info?.remainingLockoutMinutes).toBeGreaterThan(0);
    });
  });
});
