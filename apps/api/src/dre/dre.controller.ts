import { Controller, Get, Query } from '@nestjs/common';
import { DREService } from './dre.service';

@Controller('dre')
export class DREController {
    constructor(private svc: DREService) {}

    @Get()
    async getDre(@Query('tenantId') tenantID: string,
                 @Query('from') from: string,
                 @Query('to') to: string,
                 @Query('basis') basis: 'caixa'|'competencia' = 'competencia',
                 @Query('currency') currency = 'BRL') {
        return this.svc.computer(tenantID, from, to, basis, currency);
    }
}