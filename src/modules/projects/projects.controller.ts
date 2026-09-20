// Endpoint proyek.

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
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { FilterProjectDto } from './dto/filter-project.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async getAll(@Query() filter: FilterProjectDto) {
    return this.projectsService.getAllProjects(filter);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('bisnis')
  async getMyProjects(@CurrentUser() user: JwtUser) {
    return this.projectsService.getMyProjects(user.id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.projectsService.getProjectById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('bisnis')
  async create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtUser) {
    return this.projectsService.createProject(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('bisnis')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.projectsService.updateProject(id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('bisnis')
  async delete(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.projectsService.deleteProject(id, user.id);
  }
}
