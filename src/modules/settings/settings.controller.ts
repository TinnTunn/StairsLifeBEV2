// Endpoint pengaturan publik dan admin.

import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  @SkipThrottle()
  async publik() {
    return { data: await this.settings.publik(), message: 'Berhasil' };
  }
}
