// Modul integrasi Xendit.

import { Global, Module } from '@nestjs/common';
import { XenditService } from './xendit.service';

@Global()
@Module({
  providers: [XenditService],
  exports: [XenditService],
})
export class XenditModule {}
