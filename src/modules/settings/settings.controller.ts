import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /**
   * GET /api/v1/settings/public — tanpa login.
   * Dipanggil server Next saat merender halaman publik, sehingga semua
   * pengunjung berbagi satu IP; throttle per IP akan menahan mereka semua.
   */
  @Get('public')
  @SkipThrottle()
  async publik() {
    return { data: await this.settings.publik(), message: 'Berhasil' };
  }
}
