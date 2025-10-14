import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.use(helmet());
    app.enableCors({
        origin: process.env.WEB_ORIGIN
            ? process.env.WEB_ORIGIN.split(',').map((o) => o.trim())
            : true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
    app.setGlobalPrefix('v1');
    await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
    console.log('API on http://localhost:4000/v1');
}
bootstrap();
