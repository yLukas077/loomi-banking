import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'
import { LogInterceptor } from './common/interceptors/log.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  app.useGlobalFilters(new GlobalExceptionFilter())

  app.useGlobalInterceptors(new LogInterceptor())

  const config = new DocumentBuilder()
    .setTitle('Transactions Service')
    .setDescription('API documentation for the Transactions microservice')
    .setVersion('1.0.0')
    .addTag('Transactions')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'idempotency-key',
        in: 'header',
      },
      'idempotency-key',
    )
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)

  await app.listen(process.env.PORT || 3002)

}
bootstrap()
