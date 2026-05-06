import { createZodDto } from 'nestjs-zod';
import { logoutResponseSchema, refreshResponseSchema } from '../../shared/schemas';

export class RefreshResponseDto extends createZodDto(refreshResponseSchema) {}

export class LogoutResponseDto extends createZodDto(logoutResponseSchema) {}
