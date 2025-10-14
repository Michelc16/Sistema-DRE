import { Module } from '@nestjs/common';
import { DREService} from './dre.service';
import { DREController } from './dre.controller';

@Module({ providers: [DREService], controllers: [DREController] })
export class DREModule {}