import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return hello response payload', () => {
      expect(appController.getHello()).toEqual({ message: 'Hello World!' });
    });
  });

  describe('healthz', () => {
    it('should return ok true', () => {
      expect(appController.healthz()).toEqual({ ok: true });
    });
  });
});
