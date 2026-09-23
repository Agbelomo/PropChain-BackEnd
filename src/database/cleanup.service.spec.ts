import { CleanupService } from './cleanup.service';
import { PrismaService } from './prisma.service';

describe('CleanupService', () => {
  let service: CleanupService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prisma = {
      blacklistedToken: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      passwordResetToken: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      session: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      loginHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      searchAnalytics: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
      searchHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      } as any,
    };
    service = new CleanupService(prisma as unknown as PrismaService);
  });

  it('performCleanup returns summary with totalDeleted of 0 when no records exist', async () => {
    const summary = await service.performCleanup();
    expect(summary.totalDeleted).toBe(0);
    expect(summary.results).toHaveLength(6);
    expect(summary.results.map((r) => r.entity)).toEqual(
      expect.arrayContaining(['SearchAnalytics', 'SearchHistory']),
    );
  });

  it('getLastSummary returns null before any cleanup run', () => {
    const result = service.getLastSummary();
    expect(result).toBeNull();
  });

  it('deletes old SearchAnalytics and SearchHistory rows and returns their counts', async () => {
    process.env.CLEANUP_SEARCH_RETENTION_DAYS = '30';
    const searchAnalytics = prisma.searchAnalytics!;
    const searchHistory = prisma.searchHistory!;
    (searchAnalytics.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'a1' }]);
    (searchAnalytics.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (searchHistory.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'h1' }, { id: 'h2' }]);
    (searchHistory.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 });

    const summary = await service.performCleanup();

    const searchRow = summary.results.find((r) => r.entity === 'SearchAnalytics');
    const historyRow = summary.results.find((r) => r.entity === 'SearchHistory');
    expect(searchRow?.deleted).toBe(1);
    expect(historyRow?.deleted).toBe(2);
  });
});
