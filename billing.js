import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

const roundMoney = amount => Math.round((amount + Number.EPSILON) * 100) / 100;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function getBillingPeriodDates(input) {
  const year = Number(input.year);
  const month = Number(input.month);
  const week = Number(input.week);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Choose a valid year.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a valid month.');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDay = input.period_type === 'monthly' ? 1 : (week - 1) * 7 + 1;
  if (!['weekly', 'monthly'].includes(input.period_type)) throw new Error('Choose weekly or monthly billing.');
  if (input.period_type === 'weekly' && (!Number.isInteger(week) || startDay < 1 || startDay > daysInMonth)) {
    throw new Error('Choose a valid week for the selected month.');
  }
  const endDay = input.period_type === 'monthly' ? daysInMonth : Math.min(startDay + 6, daysInMonth);
  const date = day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { periodStart: date(startDay), periodEnd: date(endDay) };
}

export function calculateBillingAmounts(input, maintenanceAlreadyCharged = false) {
  const withdrawalProfitUsd = Number(input.withdrawal_profit_usd);
  const profitSplitPercent = Number(input.profit_split_percent);
  const requestedMaintenanceUsd = Number(input.server_maintenance_usd ?? 0);
  const usdInrRate = Number(input.usd_inr_rate);
  if (!Number.isFinite(withdrawalProfitUsd) || withdrawalProfitUsd < 0) throw new Error('Withdrawal profit must be a non-negative USD amount.');
  if (!Number.isFinite(profitSplitPercent) || profitSplitPercent < 0 || profitSplitPercent > 100) throw new Error('Profit split must be between 0 and 100%.');
  if (!Number.isFinite(requestedMaintenanceUsd) || requestedMaintenanceUsd < 0) throw new Error('Server maintenance must be a non-negative USD amount.');
  if (!Number.isFinite(usdInrRate) || usdInrRate <= 0) throw new Error('Enter a valid USD/INR exchange rate.');
  const customLines = input.custom_line_items ?? [];
  if (!Array.isArray(customLines) || customLines.length > 20) throw new Error('Add no more than 20 custom invoice lines.');

  const withdrawal = roundMoney(withdrawalProfitUsd);
  const profitShareUsd = roundMoney(withdrawal * profitSplitPercent / 100);
  const profitShareAmount = roundMoney(profitShareUsd * usdInrRate);
  const serverMaintenanceUsd = maintenanceAlreadyCharged ? 0 : roundMoney(requestedMaintenanceUsd);
  const serverMaintenanceAmount = roundMoney(serverMaintenanceUsd * usdInrRate);
  const customLineItems = customLines.map(item => {
    const description = String(item?.description ?? '').trim();
    const amountUsd = Number(item?.amount_usd);
    if (!description || description.length > 200) throw new Error('Each custom line needs a description of 1–200 characters.');
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('Custom line amounts must be positive USD amounts.');
    return {
      description,
      amount_usd: roundMoney(amountUsd),
      amount_inr: roundMoney(amountUsd * usdInrRate)
    };
  });
  const amount = roundMoney(profitShareAmount + serverMaintenanceAmount + customLineItems.reduce((sum, item) => sum + item.amount_inr, 0));
  if (amount <= 0) throw new Error('The invoice total must be greater than zero.');
  return {
    withdrawal_profit_usd: withdrawal,
    profit_split_percent: profitSplitPercent,
    profit_share_usd: profitShareUsd,
    profit_share_amount: profitShareAmount,
    server_maintenance_usd: serverMaintenanceUsd,
    server_maintenance_amount: serverMaintenanceAmount,
    custom_line_items: customLineItems,
    usd_inr_rate: usdInrRate,
    amount
  };
}

export function createBillingInvoice(client, input, maintenanceAlreadyCharged = false) {
  const clientEmail = String(client.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) throw new Error('Add a valid email address to this client in Client Registration before creating an invoice.');
  const accountNumber = String(input.account_number || '').trim();
  if (!accountNumber || accountNumber.length > 100) throw new Error('Choose a valid portfolio account number.');
  const { periodStart, periodEnd } = getBillingPeriodDates(input);
  const amounts = calculateBillingAmounts(input, maintenanceAlreadyCharged);
  const clientName = `${client.first_name || ''} ${client.second_name || ''}`.trim();
  const clientAddress = [
    client.address_line1, client.address_line2, client.city, client.state, client.country, client.pincode
  ].filter(Boolean).join(', ');
  const now = new Date();
  return {
    invoice_number: `TC-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-${randomUUID().slice(0, 8).toUpperCase()}`,
    client_id: String(client.client_id),
    account_number: accountNumber,
    client_name: clientName,
    client_email: clientEmail,
    client_phone: String(client.whatsapp_number || ''),
    client_address: clientAddress,
    issue_date: now.toISOString().slice(0, 10),
    due_date: periodEnd,
    period_type: input.period_type,
    period_start: periodStart,
    period_end: periodEnd,
    ...amounts,
    status: 'email_failed',
    emailed_at: null
  };
}

function invoiceLines(invoice) {
  let custom = invoice.custom_line_items || [];
  if (typeof custom === 'string') {
    try { custom = JSON.parse(custom); } catch { custom = []; }
  }
  const lines = [];
  const profitAmount = Number(invoice.profit_share_amount || 0);
  if (profitAmount > 0) {
    lines.push({
      description: `Profit share for account ${invoice.account_number} (${Number(invoice.profit_split_percent).toFixed(2)}% of USD ${Number(invoice.withdrawal_profit_usd).toFixed(2)})`,
      amount: profitAmount
    });
  }
  if (Number(invoice.server_maintenance_amount) > 0) {
    lines.push({ description: `Server maintenance (USD ${Number(invoice.server_maintenance_usd).toFixed(2)})`, amount: Number(invoice.server_maintenance_amount) });
  }
  for (const item of Array.isArray(custom) ? custom : []) {
    lines.push({ description: `${item.description} (USD ${Number(item.amount_usd).toFixed(2)})`, amount: Number(item.amount_inr) });
  }
  return lines;
}

export function createBillingPdf(invoice) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const company = process.env.COMPANY_NAME || 'Trishul Capital';
    const companyEmail = process.env.COMPANY_EMAIL || process.env.SMTP_USER || '';
    document.fillColor('#171717').fontSize(20).text(company, 48, 48);
    document.fillColor('#555').fontSize(9).text(
      [process.env.COMPANY_ADDRESS, companyEmail, process.env.COMPANY_PHONE].filter(Boolean).join('  |  '),
      48, 76, { width: 500 }
    );
    document.moveTo(48, 112).lineTo(547, 112).strokeColor('#d6ad43').lineWidth(2).stroke();
    document.fillColor('#171717').fontSize(22).text('INVOICE', 48, 130);
    document.fontSize(10).text(`Invoice number: ${invoice.invoice_number}`, 48, 164);
    document.text(`Issue date: ${invoice.issue_date}`, 48, 180);
    document.text(`Due date: ${invoice.due_date}`, 48, 196);
    document.text(`Billing period: ${invoice.period_type} · ${invoice.period_start} to ${invoice.period_end}`, 48, 212);
    document.text(`Account number: ${invoice.account_number}`, 48, 228);

    document.fillColor('#777').fontSize(9).text('BILLED TO', 48, 250);
    document.fillColor('#171717').fontSize(12).text(invoice.client_name, 48, 266);
    document.fillColor('#555').fontSize(9).text(
      [invoice.client_id, invoice.client_address, invoice.client_phone, invoice.client_email].filter(Boolean).join('\n'),
      48, 284, { width: 320, lineGap: 3 }
    );

    const headerY = Math.max(document.y + 24, 350);
    document.rect(48, headerY, 499, 25).fill('#f0f1f3');
    document.fillColor('#343434').fontSize(9).text('DESCRIPTION', 58, headerY + 8);
    document.text('AMOUNT (INR)', 420, headerY + 8, { width: 117, align: 'right' });
    let rowY = headerY + 38;
    for (const line of invoiceLines(invoice)) {
      document.fillColor('#222').fontSize(9).text(line.description, 58, rowY, { width: 340 });
      document.text(`INR ${Number(line.amount).toFixed(2)}`, 410, rowY, { width: 127, align: 'right' });
      rowY = Math.max(document.y, rowY + 16) + 10;
      if (rowY > 690) {
        document.addPage();
        rowY = 60;
      }
      document.moveTo(48, rowY).lineTo(547, rowY).strokeColor('#e2e4e8').lineWidth(0.5).stroke();
      rowY += 12;
    }
    document.fillColor('#555').fontSize(9).text(`Exchange rate: USD 1 = INR ${Number(invoice.usd_inr_rate).toFixed(4)}`, 300, rowY, { width: 237, align: 'right' });
    rowY += 22;
    document.rect(300, rowY, 247, 30).fill('#f0f1f3');
    document.fillColor('#171717').fontSize(11).text('TOTAL DUE (INR)', 310, rowY + 9);
    document.text(`INR ${Number(invoice.amount).toFixed(2)}`, 420, rowY + 9, { width: 117, align: 'right' });
    if (process.env.COMPANY_UPI_ID) {
      document.fillColor('#555').fontSize(9).text(`UPI ID: ${process.env.COMPANY_UPI_ID}`, 48, rowY + 48);
    }
    document.fillColor('#777').fontSize(8).text(
      'Please use the invoice number as your payment reference. This invoice is not a GST tax invoice unless applicable tax details are separately stated.',
      48, 748, { width: 499, align: 'center' }
    );
    document.end();
  });
}

export async function sendBillingInvoiceEmail(invoice, pdf) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invoice email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS on the backend.');
  }
  const company = process.env.COMPANY_NAME || 'Trishul Capital';
  const from = process.env.SMTP_FROM || `${company} <${user}>`;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass }
  });
  const total = `INR ${Number(invoice.amount).toFixed(2)}`;
  const lines = invoiceLines(invoice).map(line => `<li>${escapeHtml(line.description)} — INR ${Number(line.amount).toFixed(2)}</li>`).join('');
  return transport.sendMail({
    from,
    to: invoice.client_email,
    subject: `Invoice ${invoice.invoice_number} - Account ${invoice.account_number} from ${company}`,
    text: [
      `Hello ${invoice.client_name},`,
      '',
      `Please find attached invoice ${invoice.invoice_number} for ${total}.`,
      `Account number: ${invoice.account_number}`,
      `Billing period: ${invoice.period_start} to ${invoice.period_end}`,
      `Due date: ${invoice.due_date}`,
      '',
      `Regards,`,
      company
    ].join('\n'),
    html: `<p>Hello ${escapeHtml(invoice.client_name)},</p><p>Please find attached invoice <strong>${escapeHtml(invoice.invoice_number)}</strong> for <strong>${total}</strong>.</p><p>Account number: ${escapeHtml(invoice.account_number)}<br>Billing period: ${escapeHtml(invoice.period_start)} to ${escapeHtml(invoice.period_end)}<br>Due date: ${escapeHtml(invoice.due_date)}</p><ul>${lines}</ul><p>Regards,<br>${escapeHtml(company)}</p>`,
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdf, contentType: 'application/pdf' }]
  });
}
