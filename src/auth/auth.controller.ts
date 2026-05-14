import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { CookieOptions, Response } from 'express';

import { getClientIp } from '../utils/get-client-ip';
import { AuthService } from './auth.service';
import { THROTTLE_AUTH_SENSITIVE } from './constants';
import { LogoutResponseDto, MeResponseDto, RefreshResponseDto } from './dto/session-actions.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OAuthRequest,
  RefreshTokenRequest,
} from './types/request.types';

/** Path prefix so refresh cookie is sent to refresh, logout, and similar `/auth/*` routes. */
const REFRESH_COOKIE_PATH = '/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private readRefreshTokenInput(req: RefreshTokenRequest): string | undefined {
    const cookies = req.cookies as unknown;
    const cookieRecord =
      typeof cookies === 'object' && cookies !== null ? (cookies as Record<string, unknown>) : null;
    const cookieToken =
      typeof cookieRecord?.refreshToken === 'string' ? cookieRecord.refreshToken : undefined;

    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim() || undefined
        : undefined;

    return bearerToken ?? cookieToken;
  }

  private extractRefreshToken(req: RefreshTokenRequest): string {
    const token = this.readRefreshTokenInput(req);
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return token;
  }

  private isProduction(): boolean {
    return (
      this.configService.getOrThrow<'development' | 'production' | 'test'>('app.NODE_ENV') ===
      'production'
    );
  }

  private webCookieBase(): Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite' | 'domain'> {
    const domain = this.configService.get<string>('auth.cookieDomain');
    return {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'lax',
      ...(domain ? { domain } : {}),
    };
  }

  private setWebAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const accessCookieMaxAge = this.configService.getOrThrow<number>(
      'auth.accessTokenCookieMaxAgeMs',
    );
    const refreshCookieMaxAge = this.configService.getOrThrow<number>('auth.refreshTokenTtlWebMs');
    const base = this.webCookieBase();

    res.cookie('accessToken', accessToken, {
      ...base,
      maxAge: accessCookieMaxAge,
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      ...base,
      maxAge: refreshCookieMaxAge,
      path: REFRESH_COOKIE_PATH,
    });
  }

  private clearWebAuthCookies(res: Response): void {
    const base = this.webCookieBase();
    res.clearCookie('accessToken', { ...base, path: '/' });
    res.clearCookie('refreshToken', { ...base, path: REFRESH_COOKIE_PATH });
  }

  @Get('google')
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport handles redirect to OAuth provider.
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Get('google/callback')
  @ApiOperation({ summary: 'Callback from Google OAuth' })
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    const userAgent = req.headers['user-agent'];
    const ip = getClientIp(req);

    const result = await this.authService.oAuthLogin({
      ...req.user,
      userAgent,
      ip,
      deviceName: 'web',
      platform: 'web',
    });

    const frontendUrl = this.configService.getOrThrow<string>('web.frontendUrl');
    const callbackUrl = new URL('/auth/callback', frontendUrl);

    this.setWebAuthCookies(res, result.accessToken, result.refreshToken);

    return res.redirect(callbackUrl.toString());
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and return new access token' })
  @ZodResponse({ type: RefreshResponseDto })
  async refresh(@Req() req: RefreshTokenRequest, @Res({ passthrough: true }) res: Response) {
    const token = this.extractRefreshToken(req);

    const data = await this.authService.refresh(token);
    this.setWebAuthCookies(res, data.accessToken, data.refreshToken);
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  }

  @Get('me')
  @ApiOperation({ summary: 'Return current user by access token' })
  @ZodResponse({ type: MeResponseDto })
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    return this.authService.meByUserId(req.user.sub);
  }

  @Post('protected')
  @ApiOperation({ summary: 'Protected route' })
  @UseGuards(JwtAuthGuard)
  protected() {
    return this.authService.protected();
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke current refresh token session' })
  @ZodResponse({ type: LogoutResponseDto })
  async logout(@Req() req: RefreshTokenRequest, @Res({ passthrough: true }) res: Response) {
    const token = this.readRefreshTokenInput(req);
    if (token) {
      await this.authService.logout(token);
    }
    this.clearWebAuthCookies(res);
    return { ok: true as const };
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Post('logout-all')
  @ApiOperation({ summary: 'Revoke all sessions for current user' })
  @ZodResponse({ type: LogoutResponseDto })
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const userAgent = req.headers['user-agent'];
    const ip = getClientIp(req);
    const result = await this.authService.logoutAll(req.user.sub, { userAgent, ip });
    this.clearWebAuthCookies(res);
    return result;
  }
}
