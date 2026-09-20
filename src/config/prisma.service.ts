// Klien Prisma beserta daur hidup koneksinya.

import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10000, // 10 detik timeout connect
      idleTimeoutMillis: 30000, // lepas idle setelah 30 detik
      keepAlive: true, // cegah disconnect dari Supabase pooler
    });

    const adapter = new PrismaPg(pool);
    super({ adapter, log: ['error'] });
  }

  async onModuleInit() {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.$connect();
        this.logger.log('✅ Prisma connected to database');
        return;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(
          `⚠️  DB connect attempt ${attempt}/3 gagal: ${(err as Error).message}`,
        );
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 1500));
        }
      }
    }
    throw lastError;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
