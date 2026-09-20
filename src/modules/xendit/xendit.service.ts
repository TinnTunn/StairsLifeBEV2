// Klien Xendit untuk invoice dan disbursement.

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';

@Injectable()
export class XenditService {
  private readonly logger = new Logger(XenditService.name);
  private readonly baseUrl = 'https://api.xendit.co';
  private readonly secretKey: string | undefined;
  private readonly callbackToken: string | undefined;

  constructor() {
    this.secretKey = process.env.XENDIT_SECRET_KEY;
    this.callbackToken = process.env.XENDIT_CALLBACK_TOKEN;

    if (!this.secretKey) {
      this.logger.warn(
        '⚠️  XENDIT_SECRET_KEY belum di-set. Pembayaran via Xendit AKAN GAGAL. ' +
          'Set environment variable sebelum production.',
      );
    }
    if (!this.callbackToken) {
      this.logger.warn(
        '⚠️  XENDIT_CALLBACK_TOKEN belum di-set. Webhook AKAN DITOLAK semua. ' +
          'Dapatkan dari Xendit Dashboard → Settings → Webhooks.',
      );
    }
  }

  verifyCallbackToken(receivedToken: string | undefined): boolean {
    if (!this.callbackToken || !receivedToken) return false;
    if (receivedToken.length !== this.callbackToken.length) return false;
    let result = 0;
    for (let i = 0; i < receivedToken.length; i++) {
      result |= receivedToken.charCodeAt(i) ^ this.callbackToken.charCodeAt(i);
    }
    return result === 0;
  }

  isConfigured(): boolean {
    return !!this.secretKey;
  }

  private buildAuthHeader(): string {
    if (!this.secretKey) {
      throw new InternalServerErrorException(
        'Xendit belum dikonfigurasi (XENDIT_SECRET_KEY kosong). Hubungi admin.',
      );
    }
    const credentials = Buffer.from(`${this.secretKey}:`).toString('base64');
    return `Basic ${credentials}`;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: this.buildAuthHeader(),
      ...(extraHeaders || {}),
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.error(`[Xendit ${method} ${path}] network error: ${msg}`);
      throw new InternalServerErrorException(
        'Gagal koneksi ke Xendit. Coba lagi dalam beberapa saat.',
      );
    }

    const text = await resp.text();
    let parsed: any;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!resp.ok) {
      const code = parsed?.error_code || `HTTP_${resp.status}`;
      const message = parsed?.message || `HTTP ${resp.status}`;
      this.logger.error(
        `[Xendit ${method} ${path}] ${resp.status} ${code}: ${message}`,
      );
      throw new InternalServerErrorException(
        `Gateway pembayaran menolak permintaan (${code}). Coba lagi nanti.`,
      );
    }

    return parsed as T;
  }

  async createInvoice(params: {
    externalId: string;
    amount: number;
    payerEmail: string;
    description: string;
    invoiceDuration?: number;
    successRedirectUrl?: string;
    failureRedirectUrl?: string;
    customer?: {
      given_names?: string;
      email?: string;
      mobile_number?: string;
    };
    items?: Array<{ name: string; quantity: number; price: number }>;
  }): Promise<XenditInvoice> {
    return this.request<XenditInvoice>('POST', '/v2/invoices', {
      external_id: params.externalId,
      amount: params.amount,
      payer_email: params.payerEmail,
      description: params.description,
      invoice_duration: params.invoiceDuration ?? 86_400, // 24 jam
      success_redirect_url: params.successRedirectUrl,
      failure_redirect_url: params.failureRedirectUrl,
      customer: params.customer,
      items: params.items,
      currency: 'IDR',
      locale: 'id',
    });
  }

  async getInvoice(invoiceId: string): Promise<XenditInvoice> {
    return this.request<XenditInvoice>('GET', `/v2/invoices/${invoiceId}`);
  }

  async expireInvoice(invoiceId: string): Promise<XenditInvoice> {
    return this.request<XenditInvoice>(
      'POST',
      `/invoices/${invoiceId}/expire!`,
    );
  }

  async createRefund(params: {
    invoiceId?: string;
    paymentId?: string; // payment_id dari invoice yang sudah paid
    amount: number;
    reason: string;
    externalId?: string;
  }): Promise<XenditRefund> {
    return this.request<XenditRefund>(
      'POST',
      '/refunds',
      {
        invoice_id: params.invoiceId,
        payment_id: params.paymentId,
        amount: params.amount,
        reason: params.reason,
      },
      params.externalId ? { 'X-IDEMPOTENCY-KEY': params.externalId } : {},
    );
  }

  async createDisbursement(params: {
    externalId: string;
    bankCode: string; // "BCA", "BNI", ...
    accountHolderName: string;
    accountNumber: string;
    description: string;
    amount: number;
  }): Promise<XenditDisbursement> {
    return this.request<XenditDisbursement>(
      'POST',
      '/disbursements',
      {
        external_id: params.externalId,
        bank_code: params.bankCode,
        account_holder_name: params.accountHolderName,
        account_number: params.accountNumber,
        description: params.description,
        amount: params.amount,
      },
      { 'X-IDEMPOTENCY-KEY': params.externalId },
    );
  }

  async getDisbursement(disbursementId: string): Promise<XenditDisbursement> {
    return this.request<XenditDisbursement>(
      'GET',
      `/disbursements/${disbursementId}`,
    );
  }
}

export interface XenditInvoice {
  id: string;
  external_id: string;
  user_id: string;
  status: 'PENDING' | 'PAID' | 'SETTLED' | 'EXPIRED';
  merchant_name: string;
  amount: number;
  payer_email: string;
  description: string;
  invoice_url: string;
  expiry_date: string;
  created: string;
  updated: string;
  paid_at?: string;
  payment_method?: string; // "BANK_TRANSFER" | "EWALLET" | "QR_CODE" | "RETAIL_OUTLET" | "CREDIT_CARD"
  payment_channel?: string; // "BCA" | "OVO" | "DANA" | ...
  payment_destination?: string;
  paid_amount?: number;
  currency: string;
}

export interface XenditRefund {
  id: string;
  payment_id?: string;
  invoice_id?: string;
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  reason: string;
  created: string;
  updated: string;
}

export interface XenditDisbursement {
  id: string;
  user_id: string;
  external_id: string;
  amount: number;
  bank_code: string;
  account_holder_name: string;
  disbursement_description: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  failure_code?: string;
  created: string;
  updated: string;
}

export interface XenditInvoiceWebhook {
  id: string;
  external_id: string;
  user_id: string;
  status: 'PAID' | 'EXPIRED' | 'PENDING';
  merchant_name: string;
  amount: number;
  payer_email: string;
  description: string;
  paid_amount?: number;
  paid_at?: string;
  payment_method?: string;
  payment_channel?: string;
  payment_destination?: string;
  // Xendit tidak konsisten dengan camelCase / snake_case, semua snake.
}
