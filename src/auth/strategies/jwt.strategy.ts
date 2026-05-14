import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          const raw = req.cookies as Record<string, unknown> | undefined;
          const token = raw?.accessToken;
          return typeof token === 'string' && token.length > 0 ? token : null;
        },
      ]),
      secretOrKey: configService.getOrThrow<string>('auth.jwtAccessSecret'),
      algorithms: ['HS256'],
      issuer: configService.getOrThrow<string>('auth.jwtIssuer'),
      audience: configService.getOrThrow<string>('auth.jwtAudience'),
      jsonWebTokenOptions: { clockTolerance: 30 },
    });
  }

  validate(payload: JwtPayload) {
    return { sub: payload.sub };
  }
}
