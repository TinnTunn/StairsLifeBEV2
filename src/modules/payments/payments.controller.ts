// Endpoint pembayaran beserta webhook Xendit.

import type { Request } from 'express';
import type { JwtUser } from '../../common/types/jwt-payload.type';
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { XenditService } from '../xendit/xendit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Izin } from '../../common/decorators/izin.decorator';
import { IzinAdminGuard } from '../../common/guards/izin-admin.guard';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly xenditService: XenditService,
  ) {}

  @Post('invoice')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('bisnis')
  @Throttle({ medium: { limit: 30, ttl: 60_000 } })
  async createInvoice(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.paymentsService.createInvoice(dto, user.id);
  }

  @Post('webhook/xendit')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async xenditWebhook(@Req() req: Request, @Body() payload: any) {
    const token = req.header('x-callback-token');
    if (!this.xenditService.verifyCallbackToken(token)) {
      this.logger.warn(
        `Webhook ditolak: token mismatch (received=${token?.slice(0, 6)}...)`,
      );
      throw new ForbiddenException('Invalid callback token');
    }

    if (payload && typeof payload === 'object' && 'external_id' in payload) {
      return this.paymentsService.handleXenditInvoiceWebhook(payload);
    }

    this.logger.warn(
      `Webhook payload tidak dikenali: ${JSON.stringify(payload).slice(0, 200)}`,
    );
    return { success: true, message: 'Unknown payload type, ignored' };
  }

  @Get(':id/sync')
  @UseGuards(JwtAuthGuard)
  async syncPayment(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.paymentsService.syncPaymentWithXendit(id, user.id);
  }

  @Post('escrow')
  @UseGuards(JwtAuthGuard, RolesGuard, IzinAdminGuard)
  @Roles('admin')
  @Izin('Finance')
  async holdEscrow(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.paymentsService.holdEscrow(dto, user.id);
  }

  @Patch('escrow/:id/release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('bisnis')
  async releaseEscrow(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.paymentsService.releaseEscrow(id, user.id);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyPayments(@CurrentUser() user: JwtUser) {
    return this.paymentsService.getMyPayments(user.id);
  }

  @Get('contract/:contractId')
  @UseGuards(JwtAuthGuard)
  async getByContract(
    @Param('contractId') contractId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.paymentsService.getPaymentByContract(contractId, user.id);
  }
}
