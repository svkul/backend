import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LogoutResponse, OAuthLoginProfile, TokenPairResponse } from '../shared/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from './utils/tokens';
import { generateRefreshToken } from './utils/tokens';
import { ACCESS_TOKEN_TTL } from './constants';
import { REFRESH_DAYS } from './constants';
import type { RequestMeta } from './types/request-meta.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // =========================
  // GOOGLE LOGIN (entry point)
  // =========================

  async validateOAuthLogin(profile: OAuthLoginProfile): Promise<TokenPairResponse> {
    const account = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },

      include: { user: true },
    });

    let user = account?.user;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          accounts: {
            create: {
              provider: profile.provider,

              providerAccountId: profile.providerAccountId,
            },
          },
        },
      });
    }

    const device = await this.prisma.device.create({
      data: {
        userId: user.id,
        name: profile.deviceName,
        platform: profile.platform,
        userAgent: profile.userAgent,
        ip: profile.ip,
      },
    });

    return this.issueTokens(user.id, device.id, profile);
  }

  // =========================
  // ISSUE TOKENS
  // =========================

  private async issueTokens(
    userId: string,
    deviceId: string | null,
    meta?: RequestMeta,
  ): Promise<TokenPairResponse> {
    const accessToken = this.generateAccessToken(userId);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    await this.prisma.session.create({
      data: {
        userId,
        deviceId: deviceId ?? undefined,
        tokenHash,
        expiresAt: this.getRefreshExpiry(),
        userAgent: meta?.userAgent,
        ip: meta?.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  // =========================
  // REFRESH (rotation)
  // =========================

  async refresh(refreshToken: string): Promise<TokenPairResponse> {
    const tokenHash = hashToken(refreshToken);

    const session = await this.prisma.session.findFirst({
      where: { tokenHash },
    });

    if (!session) throw new UnauthorizedException();

    // reuse detection

    if (session.revoked) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId },
        data: { revoked: true, revokedAt: new Date() },
      });

      throw new UnauthorizedException('Token reuse detected');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Expired refresh token');
    }

    // revoke old
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(session.userId, session.deviceId);

    return tokens;
  }

  // =========================
  // LOGOUT
  // =========================

  async logout(refreshToken: string): Promise<LogoutResponse> {
    const tokenHash = hashToken(refreshToken);

    await this.prisma.session.updateMany({
      where: { tokenHash },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return { ok: true };
  }

  async logoutAll(userId: string): Promise<LogoutResponse> {
    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return { ok: true };
  }

  // =========================
  // JWT
  // =========================

  private generateAccessToken(userId: string) {
    return this.jwt.sign({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private getRefreshExpiry() {
    const d = new Date();

    d.setDate(d.getDate() + REFRESH_DAYS);

    return d;
  }
}
