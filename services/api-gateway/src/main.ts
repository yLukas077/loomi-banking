import { NestFactory } from '@nestjs/core';
import { GatewayModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule, {
    bodyParser: false,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
