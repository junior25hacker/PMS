import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { AppConfig } from '../../config/configuration';

export interface ReceiptEmailData {
  invoiceNumber: string;
  issuedAt: Date;
  cashier: string;
  customer: { name: string; phone: string | null; email: string | null };
  paymentMethod: string;
  currency: string;
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    amountPaid: number;
    changeDue: number;
  };
  lines: Array<{
    name: string;
    batchNumber: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  business: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
}

const money = (value: number): string => `$${Number(value || 0).toFixed(2)}`;

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

@Injectable()
export class ReceiptEmailService {
  private readonly logger = new Logger(ReceiptEmailService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async send(receipt: ReceiptEmailData, recipient: string): Promise<void> {
    const mail = this.config.get('mail', { infer: true });
    if (!mail.host || !mail.from) {
      throw new ServiceUnavailableException(
        'Receipt email is not configured. Set SMTP_HOST and MAIL_FROM first.',
      );
    }

    const transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
    });

    try {
      await transporter.sendMail({
        from: mail.from,
        to: recipient,
        subject: `Receipt ${receipt.invoiceNumber} from ${receipt.business.name}`,
        text: this.text(receipt),
        html: this.html(receipt),
      });
    } catch (error) {
      this.logger.error(`Receipt email failed for ${receipt.invoiceNumber}`, error);
      throw new ServiceUnavailableException('Receipt email could not be sent. Please try again.');
    }
  }

  private text(receipt: ReceiptEmailData): string {
    const lines = receipt.lines.map((line) =>
      `${line.name} x${line.quantity} @ ${money(line.unitPrice)} = ${money(line.lineTotal)}`,
    );
    return [
      receipt.business.name,
      receipt.business.address,
      receipt.business.phone,
      `Receipt: ${receipt.invoiceNumber}`,
      `Date: ${receipt.issuedAt.toISOString()}`,
      `Cashier: ${receipt.cashier}`,
      '',
      ...lines,
      '',
      `Subtotal: ${money(receipt.totals.subtotal)}`,
      `Tax: ${money(receipt.totals.tax)}`,
      `Discount: ${money(receipt.totals.discount)}`,
      `Total: ${money(receipt.totals.total)}`,
      `Paid (${receipt.paymentMethod}): ${money(receipt.totals.amountPaid)}`,
      `Change: ${money(receipt.totals.changeDue)}`,
    ].filter(Boolean).join('\n');
  }

  private html(receipt: ReceiptEmailData): string {
    const lines = receipt.lines.map((line) => `
      <tr><td>${escapeHtml(line.name)} x${line.quantity}</td>
      <td>${money(line.unitPrice)}</td><td>${money(line.lineTotal)}</td></tr>`).join('');
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#20252b;max-width:620px;margin:24px auto">
      <h1>${escapeHtml(receipt.business.name)}</h1>
      <p>${escapeHtml(receipt.business.address)}${receipt.business.phone ? ` · ${escapeHtml(receipt.business.phone)}` : ''}</p>
      <hr><p><strong>Receipt ${escapeHtml(receipt.invoiceNumber)}</strong><br>${escapeHtml(receipt.issuedAt.toISOString())}<br>Cashier: ${escapeHtml(receipt.cashier)}</p>
      <table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Item</th><th align="right">Unit</th><th align="right">Total</th></tr></thead><tbody>${lines}</tbody></table>
      <hr><p style="text-align:right">Subtotal: ${money(receipt.totals.subtotal)}<br>Tax: ${money(receipt.totals.tax)}<br>Discount: ${money(receipt.totals.discount)}<br><strong>Total: ${money(receipt.totals.total)}</strong><br>Paid (${escapeHtml(receipt.paymentMethod)}): ${money(receipt.totals.amountPaid)}<br>Change: ${money(receipt.totals.changeDue)}</p>
      <p>Thank you for your purchase.</p></body></html>`;
  }
}