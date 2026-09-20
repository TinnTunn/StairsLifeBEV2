// Endpoint panel admin.

import type { JwtUser } from '../../common/types/jwt-payload.type';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { SendAnnouncementDto } from './dto/send-announcement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Izin } from '../../common/decorators/izin.decorator';
import { IzinAdminGuard } from '../../common/guards/izin-admin.guard';
import { SettingsService } from '../settings/settings.service';
import { PaymentsService } from '../payments/payments.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, IzinAdminGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly audit: AuditService,
    private readonly rolesService: RolesService,
    private readonly izinGuard: IzinAdminGuard,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: JwtUser) {
    const akses = await this.izinGuard.aksesUntuk(user);
    return { data: akses, message: 'Berhasil' };
  }

  private _actorName(user: JwtUser): string {
    return (
      (user as any).full_name ||
      (user as any).name ||
      (user as any).email ||
      'Admin'
    );
  }

  @Get('stats')
  @Izin('Overview')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  @Izin('Users')
  async getAllUsers(
    @Query('role') role?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (page === undefined) return this.adminService.getAllUsers(role);
    return this.adminService.cariUsers({
      role,
      q,
      status,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20)),
    });
  }

  @Patch('users/:id/suspend')
  @Izin('Users')
  async suspendUser(
    @Param('id') id: string,
    @Body() body: SuspendUserDto,
    @CurrentUser() user: JwtUser,
  ) {
    const res = await this.adminService.toggleSuspendUser(id, body?.reason);
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'user.suspend_toggle',
      targetType: 'user',
      targetId: id,
      metadata: { reason: body?.reason ?? null },
    });
    return res;
  }

  @Get('verifications')
  @Izin('Verification')
  async getVerifications(@Query('status') status?: string) {
    return this.adminService.getPendingVerifications(status);
  }

  @Patch('verifications/:id')
  @Izin('Verification')
  async reviewVerification(
    @Param('id') id: string,
    @Body() dto: ReviewVerificationDto,
    @CurrentUser() user: JwtUser,
  ) {
    const res = await this.adminService.reviewVerification(id, dto, user.id);
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'verification.review',
      targetType: 'verification',
      targetId: id,
      metadata: {
        status: (dto as any).status,
        rejection_reason: (dto as any).rejection_reason ?? null,
      },
    });
    return res;
  }

  @Get('disputes')
  @Izin('Disputes')
  async getDisputes(@Query('status') status?: string) {
    return this.adminService.getAllDisputes(status);
  }

  @Get('disputes/:id')
  @Izin('Disputes')
  async getDispute(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getDisputeById(id);
  }

  @Patch('disputes/:id')
  @Izin('Disputes')
  async resolveDispute(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: JwtUser,
  ) {
    const res = await this.adminService.resolveDispute(id, dto, user.id);
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'dispute.resolve',
      targetType: 'dispute',
      targetId: id,
      metadata: {
        status: (dto as any).status,
        outcome: (dto as any).outcome ?? null,
      },
    });
    return res;
  }

  @Get('projects')
  @Izin('Projects')
  async getAllProjects(@Query('status') status?: string) {
    return this.adminService.getAllProjects(status);
  }

  @Post('announcements')
  @Izin('Announcement')
  async sendAnnouncement(
    @Body() dto: SendAnnouncementDto,
    @CurrentUser() user: JwtUser,
  ) {
    const res = await this.adminService.sendAnnouncement(dto, user.id);
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'announcement.send',
      targetType: 'announcement',
      metadata: {
        title: (dto as any).title ?? null,
        target: (dto as any).target ?? null,
      },
    });
    return res;
  }

  @Get('announcements')
  @Izin('Announcement')
  async getAnnouncements() {
    return this.adminService.getAnnouncements();
  }

  @Delete('projects/:id')
  @Izin('Projects')
  async deleteProject(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const res = await this.adminService.deleteProject(id);
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'project.delete',
      targetType: 'project',
      targetId: id,
    });
    return res;
  }

  @Get('finances')
  @Izin('Finance')
  async getFinances() {
    return this.adminService.getFinances();
  }

  @Get('finances/detail')
  @Izin('Finance')
  async getFinancesDetail(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ) {
    return this.adminService.getFinancesDetail(
      parseInt(page),
      parseInt(limit),
      status,
    );
  }

  @Get('settings')
  @Izin('Settings')
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  @Izin('Settings')
  async updateSettings(
    @Body() body: UpdateSettingsDto,
    @CurrentUser() user: JwtUser,
  ) {
    const res = await this.adminService.updateSettings(body);
    this.settings.invalidate();
    this.payments.invalidateFeeCache();
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'settings.update',
      targetType: 'settings',
      metadata: { ...body },
    });
    return res;
  }

  @Get('projects/:id/contracts')
  @Izin('Projects')
  async getProjectContracts(@Param('id') id: string) {
    return this.adminService.getProjectContracts(id);
  }

  @Get('audit-logs')
  @Izin('Overview')
  async getAuditLogs(@Query('limit') limit = '50') {
    const data = await this.audit.list(parseInt(limit, 10) || 50);
    return { data, message: 'Berhasil' };
  }

  @Get('roles')
  @Izin('Settings')
  async getRoles() {
    return this.rolesService.list();
  }

  @Post('roles')
  @Izin('Settings')
  async createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtUser) {
    const res = await this.rolesService.create(dto);
    IzinAdminGuard.bersihkanCache();
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'role.create',
      targetType: 'role',
      targetId: res.data?.id,
      metadata: { name: dto.name },
    });
    return res;
  }

  @Patch('roles/:id')
  @Izin('Settings')
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtUser,
  ) {
    const res = await this.rolesService.update(id, dto);
    IzinAdminGuard.bersihkanCache();
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'role.update',
      targetType: 'role',
      targetId: id,
      metadata: { ...dto },
    });
    return res;
  }

  @Delete('roles/:id')
  @Izin('Settings')
  async deleteRole(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    const res = await this.rolesService.remove(id);
    IzinAdminGuard.bersihkanCache();
    void this.audit.log({
      actorId: user.id,
      actorName: this._actorName(user),
      action: 'role.delete',
      targetType: 'role',
      targetId: id,
    });
    return res;
  }
}
