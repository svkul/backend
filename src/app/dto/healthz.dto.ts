import { createZodDto } from 'nestjs-zod';
import { healthzResponseSchema } from '../../shared/schemas';

export class HealthzResponseDto extends createZodDto(healthzResponseSchema) {}
