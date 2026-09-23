import { SearchAnalyticsService } from './search-analytics.service';
import type { PrismaService } from '../database/prisma.service';

type QueryLike = { query?: string; filters?: Record<string, unknown> };

function makePrismaMock() {
  return {
    userPreferences: { findUnique: jest.fn() },
    popularSearch: { upsert: jest.fn().mockResolvedValue({}) },
    searchAnalytics: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    searchHistory: { upsert: jest.fn().mockResolvedValue({}) },
  } as unknown as jest.Mocked<PrismaService>;
}

describe('SearchAnalyticsService', () => {
  const userId = 'user-1';

  describe('#1184 search analytics opt-out', () => {
    it('writes SearchAnalytics/SearchHistory rows when the user has not opted out', async () => {
      const prisma = makePrismaMock();
      prisma.userPreferences.findUnique.mockResolvedValue({ searchAnalyticsOptOut: false });

      const service = new SearchAnalyticsService(prisma);
      await service.recordSearch(userId, { query: '3 bedroom house' });

      expect(prisma.searchAnalytics.create).toHaveBeenCalledTimes(1);
      expect(prisma.searchHistory.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.popularSearch.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { query: '3 bedroom house' },
        }),
      );
    });

    it('writes NO SearchAnalytics row for opted-out users but still updates PopularSearch', async () => {
      const prisma = makePrismaMock();
      prisma.userPreferences.findUnique.mockResolvedValue({ searchAnalyticsOptOut: true });

      const service = new SearchAnalyticsService(prisma);
      await service.recordSearch(userId, { query: '3 bedroom house' });

      expect(prisma.searchAnalytics.create).not.toHaveBeenCalled();
      expect(prisma.searchHistory.upsert).not.toHaveBeenCalled();
      expect(prisma.popularSearch.upsert).toHaveBeenCalledTimes(1);
    });

    it('skips analytics rows for opted-out users even with a filters payload', async () => {
      const prisma = makePrismaMock();
      prisma.userPreferences.findUnique.mockResolvedValue({ searchAnalyticsOptOut: true });

      const service = new SearchAnalyticsService(prisma);
      await service.recordSearch(userId, { query: 'apartment', filters: { city: 'NYC' } });

      expect(prisma.searchAnalytics.create).not.toHaveBeenCalled();
    });
  });
});