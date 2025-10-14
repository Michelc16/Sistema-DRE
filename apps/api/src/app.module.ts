import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { DREModule } from './dre/dre.module';
import { ImportModule } from './import/import.module';
import { TinyModule } from './integrations/tiny/tiny.module';
import { AppController } from './app.controller';

@Module({
  imports: [PrismaModule, DREModule, ImportModule, TinyModule],
  controllers: [AppController],
})
export class AppModule {}
