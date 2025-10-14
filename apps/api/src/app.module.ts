import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { DREModule } from './dre/dre.module';
import { ImportModule } from './import/import.module';
import { TinyModule } from './integrations/tiny/tiny.module';

@Module({ imports: [PrismaModule, DREModule, ImportModule, TinyModule] })
export class AppModule {}