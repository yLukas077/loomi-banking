import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'
import { LogInterceptor } from './common/interceptors/log.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))

  app.useGlobalFilters(new GlobalExceptionFilter())
  
  app.useGlobalInterceptors(new LogInterceptor())

  await app.listen(process.env.PORT || 3001)
}
bootstrap()
