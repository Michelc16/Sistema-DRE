import { Injectable, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  // Opcional: habilitar hook de desligamento depois, caso necessário.
  // Deixei comentado para evitar o erro de tipo do $on:
  // async enableShutdownHooks(app: INestApplication) {
  //   this.$on('beforeExit', async () => { await app.close(); });
  // }
}
