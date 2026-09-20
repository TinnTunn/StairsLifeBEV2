// Pengirim surel lewat Resend.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { verificationEmailTemplate } from './templates/verification.template';
import { passwordResetTemplate } from './templates/password-reset.template';
import { welcomeTemplate } from './templates/welcome.template';
import {
  emailChangeTemplate,
  emailChangedNoticeTemplate,
} from './templates/email-change.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;
  private readonly appUrl: string;
  private readonly devMode: boolean;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress =
      this.config.get<string>('EMAIL_FROM') ??
      'StairsLife <noreply@example.com>';
    this.appUrl =
      this.config.get<string>('APP_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:5173';

    if (!apiKey) {
      this.resend = null;
      this.devMode = true;
      this.logger.warn(
        '⚠️  RESEND_API_KEY belum di-set. EmailService akan log ke console, tidak mengirim email.',
      );
    } else {
      this.resend = new Resend(apiKey);
      this.devMode = false;
      this.logger.log(`📧 EmailService ready. From: ${this.fromAddress}`);
    }
  }

  async sendVerificationEmail(args: {
    to: string;
    fullName: string;
    rawToken: string;
  }): Promise<void> {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(args.rawToken)}`;
    const { subject, html, text } = verificationEmailTemplate({
      fullName: args.fullName,
      verifyUrl,
    });

    return this._send({
      to: args.to,
      subject,
      html,
      text,
      tag: 'verification',
    });
  }

  async sendPasswordResetEmail(args: {
    to: string;
    fullName: string;
    rawToken: string;
  }): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(args.rawToken)}`;
    const { subject, html, text } = passwordResetTemplate({
      fullName: args.fullName,
      resetUrl,
    });

    return this._send({
      to: args.to,
      subject,
      html,
      text,
      tag: 'password_reset',
    });
  }

  async sendEmailChangeEmail(args: {
    to: string;
    fullName: string;
    rawToken: string;
  }): Promise<void> {
    const confirmUrl = `${this.appUrl}/konfirmasi-email?token=${encodeURIComponent(args.rawToken)}`;
    const { subject, html, text } = emailChangeTemplate({
      fullName: args.fullName,
      newEmail: args.to,
      confirmUrl,
    });
    return this._send({
      to: args.to,
      subject,
      html,
      text,
      tag: 'email_change',
    });
  }

  async sendEmailChangedNotice(args: {
    to: string;
    fullName: string;
    newEmail: string;
  }): Promise<void> {
    const { subject, html, text } = emailChangedNoticeTemplate({
      fullName: args.fullName,
      newEmail: args.newEmail,
    });
    return this._send({
      to: args.to,
      subject,
      html,
      text,
      tag: 'email_changed',
    });
  }

  async sendWelcomeEmail(args: {
    to: string;
    fullName: string;
    role: 'mahasiswa' | 'bisnis';
  }): Promise<void> {
    const { subject, html, text } = welcomeTemplate({
      fullName: args.fullName,
      role: args.role,
      appUrl: this.appUrl,
    });

    return this._send({
      to: args.to,
      subject,
      html,
      text,
      tag: 'welcome',
    });
  }

  private async _send(args: {
    to: string;
    subject: string;
    html: string;
    text: string;
    tag?: string;
  }): Promise<void> {
    if (this.devMode || !this.resend) {
      this.logger.log(
        `[DEV EMAIL] To: ${args.to} | Subject: ${args.subject}\n--- TEXT ---\n${args.text}\n--- END ---`,
      );
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        tags: args.tag ? [{ name: 'category', value: args.tag }] : undefined,
      });

      if (error) {
        this.logger.error(
          `Gagal kirim email ke ${args.to}: ${error.message}`,
          error,
        );
        return;
      }

      this.logger.log(
        `📧 Email terkirim ke ${args.to} | Subject: ${args.subject} | id=${data?.id}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Exception saat kirim email ke ${args.to}: ${err.message}`,
        err,
      );
    }
  }
}
