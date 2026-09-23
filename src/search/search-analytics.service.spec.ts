import { SearchAnalyticsService } from './search-analytics.service';
import type { PrismaService } from '../database/prisma.service';

function makePrismaMock() {
  const findUniqueUserPrefs = jest.fn().mockResolvedValue({ searchAnalyticsOptOut: false });
  const popularSearchUpsert = jest.fn().mockResolvedValue({});
  const searchAnalyticsCreate = jest.fn().mockResolvedValue({});
  const searchHistoryUpsert = jest.fn().mockResolvedValue({});

  const prisma = {
    userPreferences: { findUnique: findUniqueUserPrefs },
    popularSearch: { upsert: popularSearchUpsert },
    searchAnalytics: { create: searchAnalyticsCreate, updateMany: jest.fn() },
    searchHistory: { upsert: searchHistoryUpsert },
  } as unknown as PrismaService;

  return {
    prisma,
    findUniqueUserPrefs,
    popularSearchUpsert,
    searchAnalyticsCreate,
    searchHistoryUpsert,
  };
}

describe('SearchAnalyticsService', () => {
  const userId = 'user-1';

  describe('#1184 search analytics opt-out', () => {
    it('writes SearchAnalytics/SearchHistory rows when the user has not opted out', async () => {
      const { prisma, searchAnalyticsCreate, searchHistoryUpsert, popularSearchUpsert } =
        makePrismaMock();

      const service = new SearchAnalyticsService(prisma);
      await service.recordSearch(userId, { query: '3 bedroom house' });

      expect(searchAnalyticsCreate).toHaveBeenCalledTimes(1);
      expect(searchHistoryUpsert).toHaveBeenCalledTimes(1);
      expect(popularSearchUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { query: '3 bedroom house' },
        }),
      );
    });

    it('writes NO SearchAnalytics row for opted-out users but still updates PopularSearch', async () => {
      const { prisma, findUniqueUserPrefs, searchAnalyticsCreate, searchHistoryUpsert } =
        makePrismaMock();
      findUniqueUserPrefs.mockResolvedValue({ searchAnalyticsOptOut: true });

      const service = new SearchAnalyticsService(prisma);
      await service.recordSearch(userId, { query: '3 bedroom house' });

      expect(searchAnalyticsCreate).not.toHaveBeenCalled();
      expect(searchHistoryUpsert).not.toHaveBeenCalled();
    });

    it('skips analytics rows for opted-out users even with a filters payload', async () => {
      const { prisma, findUniqueUserPrefs, searchAnalyticsCreate } = makePrismaMock();
      findUniqueUserPrefs.mockResolvedValue({ searchAnalyticsOptOut: true });

      const service = new SearchAnalyticsService(prisma);
      await service.recordSearch(userId, { query: 'apartment', filters: { city: 'NYC' } });

      expect(searchAnalyticsCreate).not.toHaveBeenCalled();
    });
  });
});
