import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { GetHelloResponseDto } from './app/dto/get-hello.dto';
import { HealthzResponseDto } from './app/dto/healthz.dto';
import { AppService } from './app.service';
import type { HealthzResponse, HelloResponse } from './shared/schemas';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get hello message' })
  @ZodResponse({ type: GetHelloResponseDto })
  getHello(): HelloResponse {
    return this.appService.getHello();
  }

  @SkipThrottle()
  @Get('healthz')
  @ApiOperation({ summary: 'Liveness probe (Railway / load balancers)' })
  @ZodResponse({ type: HealthzResponseDto })
  healthz(): HealthzResponse {
    return { ok: true };
  }
}
