import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LogoutResponseDto, RefreshResponseDto } from './dto/session-actions.dto';
import type {
  AuthenticatedRequest,
  OAuthRequest,
  RefreshTokenRequest,
} from './types/request.types';
import { extractRequestMeta } from './utils/request-meta';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private extractRefreshToken(req: RefreshTokenRequest): string {
    const cookieToken = req.cookies?.refresh_token;
    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : undefined;
    const token = cookieToken || bearerToken;

    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return token;
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport handles redirect to OAuth provider.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    const { userAgent, ip } = extractRequestMeta(req);

    const result = await this.authService.validateOAuthLogin({
      ...req.user,
      userAgent,
      ip,
      deviceName: 'web',
      platform: 'web',
    });

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });

    const frontendUrl = this.configService.getOrThrow<string>('web.frontendUrl');
    return res.redirect(`${frontendUrl}/auth/callback?access=${result.accessToken}`);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and return new access token' })
  @ZodResponse({ type: RefreshResponseDto })
  async refresh(@Req() req: RefreshTokenRequest, @Res({ passthrough: true }) res: Response) {
    const token = this.extractRefreshToken(req);

    const data = await this.authService.refresh(token);

    res.cookie?.('refresh_token', data.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });

    return { accessToken: data.accessToken };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke current refresh token session' })
  @ZodResponse({ type: LogoutResponseDto })
  async logout(@Req() req: RefreshTokenRequest) {
    const token = this.extractRefreshToken(req);

    return this.authService.logout(token);
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Revoke all sessions for current user' })
  @ZodResponse({ type: LogoutResponseDto })
  async logoutAll(@Req() req: AuthenticatedRequest) {
    return this.authService.logoutAll(req.user.sub);
  }
}
