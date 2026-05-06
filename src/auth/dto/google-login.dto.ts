import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const googleLoginSchema = z.object({
  code: z.string().min(1),
});

export class GoogleLoginDto extends createZodDto(googleLoginSchema) {}
