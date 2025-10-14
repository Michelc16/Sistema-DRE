import { Module } from '@nestjs/common';
import { TinyClient } from './TinyClient';

@Module({ providers: [TinyClient], exports: [TinyClient] })
export class TinyModule {}