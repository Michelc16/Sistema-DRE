import { Controller, Post, UploadedFile, UseInterceptors, Param } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';

@Controller('tenants/:id/import')
export class ImportController {
  constructor(private svc: ImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Param('id') tenantId: string, @UploadedFile() file: any) {
    return this.svc.importTransactions(tenantId, file.buffer);
  }
}
