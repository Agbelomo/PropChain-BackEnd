import { Test, TestingModule } from '@nestjs/testing';
import { SignedUrlService } from './signed-url.service';
import { SignedUrlRequest, SignedUrlResponse } from './signed-url-provider.interface';

describe('SignedUrlService', () => {
  let service: SignedUrlService;

  // Create a mock provider that mimics the SignedUrlProvider interface
  const mockProvider = {
    getSignedUrl: jest.fn(),
    isConfigured: jest.fn().mockReturnValue(true),
  };

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.SIGNED_URL_PROVIDER;
    delete process.env.NODE_ENV;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignedUrlService,
        // We MUST provide the exact token the service is injecting
        {
          provide: 'SIGNED_URL_PROVIDER_TOKEN',
          useValue: mockProvider,
        },
      ],
    }).compile();

    service = module.get<SignedUrlService>(SignedUrlService);
    jest.clearAllMocks();
    mockProvider.isConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSignedUrl', () => {
    it('should delegate to the injected provider', async () => {
      const payload = { operation: 'download', objectKey: 'test.pdf' } as SignedUrlRequest;
      mockProvider.getSignedUrl.mockResolvedValue({ url: 'http://signed' } as SignedUrlResponse);

      const result = await service.getSignedUrl(payload);

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ url: 'http://signed' });
    });
  });

  describe('onModuleInit', () => {
    it('should not throw when the provider is configured', () => {
      mockProvider.isConfigured.mockReturnValue(true);
      expect(() => service.onModuleInit()).not.toThrow();
    });

    it('should log an error (but not throw) when unconfigured outside production', () => {
      mockProvider.isConfigured.mockReturnValue(false);
      process.env.SIGNED_URL_PROVIDER = 's3';
      process.env.NODE_ENV = 'development';

      const errorSpy = jest.spyOn(service['logger'], 'error');
      expect(() => service.onModuleInit()).not.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('NOT configured'));
      errorSpy.mockRestore();
    });

    it('should fail hard when unconfigured in production', () => {
      mockProvider.isConfigured.mockReturnValue(false);
      process.env.SIGNED_URL_PROVIDER = 's3';
      process.env.NODE_ENV = 'production';

      expect(() => service.onModuleInit()).toThrowError(expect.stringContaining('NOT configured'));
    });

    it('should name the active provider from the environment', () => {
      process.env.SIGNED_URL_PROVIDER = 'gcs';
      expect(service.activeProviderName()).toBe('gcs');
    });

    it('should default the provider name to not-configured', () => {
      expect(service.activeProviderName()).toBe('not-configured');
    });
  });
});
