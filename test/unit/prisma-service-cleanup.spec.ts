import { PrismaService } from '../../src/database/prisma.service';

describe('PrismaService timer/handler leak prevention (Issue #1250)', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
    jest.spyOn(service, '$connect').mockResolvedValue(undefined as any);
    jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(service)), '$disconnect')
      .mockResolvedValue(undefined as any);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('stores the interval handle and clears it in onModuleDestroy', async () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');

    await service.onModuleInit();
    expect((service as any).poolMetricsInterval).toBeDefined();

    await service.onModuleDestroy();
    expect(clearSpy).toHaveBeenCalled();
    expect((service as any).poolMetricsInterval).toBeUndefined();
  });

  it('clears the interval when $disconnect is called directly', async () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');

    await service.onModuleInit();
    expect((service as any).poolMetricsInterval).toBeDefined();

    await service.$disconnect();
    expect(clearSpy).toHaveBeenCalled();
    expect((service as any).poolMetricsInterval).toBeUndefined();
  });

  it('handles multiple onModuleDestroy calls gracefully without throwing', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    await expect(service.onModuleDestroy()).resolves.not.toThrow();
  });
});
