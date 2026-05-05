import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { appConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(appConfig.KEY);
  const { NODE_ENV, PORT } = config;

  if (NODE_ENV === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Backend API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    const cleanedDocument = cleanupOpenApiDoc(document);
    SwaggerModule.setup('docs', app, cleanedDocument);
  }

  await app.listen(PORT);
}
bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
