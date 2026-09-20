// Modul panel admin.

import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { RolesService } from './roles.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { IzinAdminGuard } from '../../common/guards/izin-admin.guard';

@Module({
  imports: [NotificationsModule, PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService, AuditService, RolesService, IzinAdminGuard],
  exports: [AdminService, AuditService, RolesService],
})
export class AdminModule {}
