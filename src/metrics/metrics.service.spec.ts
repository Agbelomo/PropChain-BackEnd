import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import {
  userRegistrationsTotal,
  userLoginsTotal,
  transactionsTotal,
  propertiesTotal,
  documentsTotal,
  transactionValueHistogram,
} from './metrics.controller';

describe('MetricsService - Business Metrics Wiring', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('User Registrations', () => {
    it('should increment userRegistrationsTotal with email method', () => {
      const spy = jest.spyOn(userRegistrationsTotal, 'inc');
      service.recordUserRegistration('email');
      expect(spy).toHaveBeenCalledWith({ method: 'email' });
    });

    it('should increment userRegistrationsTotal with google method', () => {
      const spy = jest.spyOn(userRegistrationsTotal, 'inc');
      service.recordUserRegistration('google');
      expect(spy).toHaveBeenCalledWith({ method: 'google' });
    });
  });

  describe('User Logins', () => {
    it('should increment userLoginsTotal with email method', () => {
      const spy = jest.spyOn(userLoginsTotal, 'inc');
      service.recordUserLogin('email');
      expect(spy).toHaveBeenCalledWith({ method: 'email' });
    });

    it('should increment userLoginsTotal with google method', () => {
      const spy = jest.spyOn(userLoginsTotal, 'inc');
      service.recordUserLogin('google');
      expect(spy).toHaveBeenCalledWith({ method: 'google' });
    });

    it('should increment userLoginsTotal with api-key method', () => {
      const spy = jest.spyOn(userLoginsTotal, 'inc');
      service.recordUserLogin('api-key');
      expect(spy).toHaveBeenCalledWith({ method: 'api-key' });
    });
  });

  describe('Transactions', () => {
    it('should increment transactionsTotal and observe value in transactionValueHistogram', () => {
      const txSpy = jest.spyOn(transactionsTotal, 'inc');
      const valSpy = jest.spyOn(transactionValueHistogram, 'observe');

      service.recordTransaction('SALE', 'PENDING', 350000);

      expect(txSpy).toHaveBeenCalledWith({ type: 'SALE', status: 'PENDING' });
      expect(valSpy).toHaveBeenCalledWith(350000);
    });

    it('should handle recordTransaction without amount', () => {
      const txSpy = jest.spyOn(transactionsTotal, 'inc');
      const valSpy = jest.spyOn(transactionValueHistogram, 'observe');

      service.recordTransaction('PURCHASE', 'COMPLETED');

      expect(txSpy).toHaveBeenCalledWith({ type: 'PURCHASE', status: 'COMPLETED' });
      expect(valSpy).not.toHaveBeenCalled();
    });
  });

  describe('Properties', () => {
    it('should increment propertiesTotal when property listing is created', () => {
      const spy = jest.spyOn(propertiesTotal, 'inc');
      service.recordPropertyCreated();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Documents', () => {
    it('should increment documentsTotal with document_type label', () => {
      const spy = jest.spyOn(documentsTotal, 'inc');
      service.recordDocumentUploaded('TITLE_DEED');
      expect(spy).toHaveBeenCalledWith({ document_type: 'TITLE_DEED' });
    });
  });
});
