// Modul autentikasi.

import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { VerificationTokenService } from './verification-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SesiService } from './sesi.service';
import { AkunService } from './akun.service';
import { AkunController } from './akun.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET tidak di-set di environment.');
        }
        const expiresIn = (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as any;
        return { secret, signOptions: { expiresIn } };
      },
    }),
    EmailModule, // global, sudah ada
  ],
  controllers: [AuthController, AkunController],
  providers: [
    AuthService,
    TokenService,
    VerificationTokenService,
    JwtStrategy,
    SesiService,
    AkunService,
  ],
  exports: [AuthService, TokenService, SesiService, JwtModule, PassportModule],
})
export class AuthModule {}
