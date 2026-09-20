// Endpoint lamaran.

import type { JwtUser } from '../../common/types/jwt-payload.type';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('mahasiswa')
  async apply(@Body() dto: CreateApplicationDto, @CurrentUser() user: JwtUser) {
    return this.applicationsService.applyToProject(dto, user.id);
  }

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles('mahasiswa')
  async getMyApplications(@CurrentUser() user: JwtUser) {
    return this.applicationsService.getMyApplications(user.id);
  }

  @Get('project/:projectId')
  @UseGuards(RolesGuard)
  @Roles('bisnis')
  async getProjectApplications(
    @Param('projectId') projectId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.applicationsService.getProjectApplications(projectId, user.id);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.applicationsService.getApplicationById(id, user.id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('bisnis')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.applicationsService.updateApplicationStatus(id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('mahasiswa')
  async withdraw(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.applicationsService.withdrawApplication(id, user.id);
  }
}
