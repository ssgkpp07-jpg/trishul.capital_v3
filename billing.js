import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const roundMoney = amount => Math.round((amount + Number.EPSILON) * 100) / 100;
const PAID_STAMP = readFileSync(path.join(process.cwd(), 'public', 'admin', 'assets', 'paid-stamp.png'));
const BILLING_SETTING_FIELDS = [
  'logo_data_url', 'upi_id', 'upi_qr_data_url', 'bank_account_number', 'bank_account_name',
  'bank_name', 'bank_branch', 'bank_ifsc', 'company_name', 'company_address',
  'company_phone', 'company_email', 'monthly_server_fee_usd', 'usd_inr_rate'
];
const IMAGE_SIGNATURES = {
  'image/png': buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
};
const MAX_BILLING_IMAGE_BYTES = 1.5 * 1024 * 1024;
const validIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

export function normalizeInvoicePaymentDetails(input = {}) {
  const paymentMethod = String(input.payment_method || '').trim().toLowerCase();
  if (!['upi', 'bank_settled'].includes(paymentMethod)) throw new Error('Choose UPI or Bank settled as the payment method.');

  const paymentReference = String(input.payment_reference || '').trim();
  if (paymentReference.length > 200) throw new Error('Payment reference must be 200 characters or fewer.');

  let paymentGateway;
  let paymentUpiId = null;
  if (paymentMethod === 'upi') {
    paymentUpiId = String(input.payment_upi_id || '').trim();
    if (!paymentUpiId || paymentUpiId.length > 200) throw new Error('Enter a UPI ID or payment handle of 200 characters or fewer.');
    const selectedGateway = String(input.payment_gateway || '').trim();
    if (!['Google Pay', 'PhonePe', 'Paytm', 'Other'].includes(selectedGateway)) throw new Error('Choose a valid UPI gateway.');
    paymentGateway = selectedGateway === 'Other' ? String(input.payment_gateway_other || '').trim() : selectedGateway;
    if (!paymentGateway || paymentGateway.length > 100) throw new Error('Enter a gateway name of 100 characters or fewer.');
  } else {
    const selectedTransferType = String(input.bank_transfer_type || '').trim();
    if (!['IMPS', 'NEFT', 'RTGS', 'Other'].includes(selectedTransferType)) throw new Error('Choose a valid bank transfer type.');
    paymentGateway = selectedTransferType === 'Other' ? String(input.bank_transfer_other || '').trim() : selectedTransferType;
    if (!paymentGateway || paymentGateway.length > 100) throw new Error('Enter a bank transfer type of 100 characters or fewer.');
  }

  return {
    payment_method: paymentMethod,
    payment_gateway: paymentGateway,
    payment_upi_id: paymentUpiId,
    payment_reference: paymentReference || null
  };
}

export function formatPaidInvoiceDetails(invoice) {
  const method = invoice.payment_method === 'upi'
    ? ['Paid via UPI', invoice.payment_gateway, invoice.payment_upi_id ? `UPI ID: ${invoice.payment_upi_id}` : ''].filter(Boolean).join(' · ')
    : invoice.payment_method === 'bank_settled'
      ? ['Bank settled', invoice.payment_gateway].filter(Boolean).join(' · ')
      : 'Payment verified manually';
  return [
    method,
    invoice.paid_at ? `Verified on: ${String(invoice.paid_at).slice(0, 10)}` : '',
    invoice.payment_reference ? `Reference: ${invoice.payment_reference}` : ''
  ].filter(Boolean).join(' · ');
}

export function getDefaultBillingSettings() {
  return {
    logo_data_url: '',
    upi_id: process.env.COMPANY_UPI_ID || '',
    upi_qr_data_url: '',
    bank_account_number: '',
    bank_account_name: '',
    bank_name: '',
    bank_branch: '',
    bank_ifsc: '',
    company_name: process.env.COMPANY_NAME || 'Trishul Capital',
    company_address: process.env.COMPANY_ADDRESS || '',
    company_phone: process.env.COMPANY_PHONE || '',
    company_email: process.env.COMPANY_EMAIL || process.env.SMTP_USER || '',
    monthly_server_fee_usd: 0,
    usd_inr_rate: 0
  };
}

export function normalizeBillingSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invoice settings must be an object.');
  const defaults = getDefaultBillingSettings();
  const result = {};
  for (const field of BILLING_SETTING_FIELDS) {
    const value = input[field] ?? defaults[field];
    if (field.endsWith('_data_url')) {
      if (typeof value !== 'string' || value.length > Math.ceil(MAX_BILLING_IMAGE_BYTES * 4 / 3) + 128) {
        throw new Error(`${field.replace(/_/g, ' ')} is too large.`);
      }
      if (!value) {
        result[field] = '';
        continue;
      }
      const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      if (!match) throw new Error('Invoice logo and UPI QR must be PNG or JPEG images.');
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > MAX_BILLING_IMAGE_BYTES
        || buffer.toString('base64') !== match[2] || !IMAGE_SIGNATURES[match[1]](buffer)) {
        throw new Error('Invoice logo and UPI QR must be valid PNG or JPEG images no larger than 2 MB.');
      }
      result[field] = value;
      continue;
    }
    if (field === 'monthly_server_fee_usd' || field === 'usd_inr_rate') {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || (field === 'usd_inr_rate' && number > 0 && number > 100000)) {
        throw new Error(`${field === 'monthly_server_fee_usd' ? 'Monthly server fee' : 'USD to INR rate'} must be a non-negative number.`);
      }
      result[field] = roundMoney(number);
      continue;
    }
    if (typeof value !== 'string' || value.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      throw new Error(`${field.replace(/_/g, ' ')} must be text with no more than 1,000 characters.`);
    }
    result[field] = value.trim();
  }
  if (result.company_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.company_email)) {
    throw new Error('Enter a valid company email address.');
  }
  return result;
}

export function getBillingPeriodDates(input) {
  const year = Number(input.year);
  const month = Number(input.month);
  const week = Number(input.week);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Choose a valid year.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a valid month.');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDay = input.period_type === 'weekly' ? (week - 1) * 7 + 1 : 1;
  if (!['weekly', 'monthly', 'onboard', 'instant'].includes(input.period_type)) throw new Error('Choose weekly, monthly, onboarding, or instant billing.');
  if (input.period_type === 'weekly' && (!Number.isInteger(week) || startDay < 1 || startDay > daysInMonth)) {
    throw new Error('Choose a valid week for the selected month.');
  }
  const endDay = ['monthly', 'onboard', 'instant'].includes(input.period_type) ? daysInMonth : Math.min(startDay + 6, daysInMonth);
  const date = day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { periodStart: date(startDay), periodEnd: date(endDay) };
}

export function getMonthlyAnniversaryDate(onboardDate, monthsAfterOnboarding) {
  if (!validIsoDate(String(onboardDate || '')) || !Number.isInteger(monthsAfterOnboarding) || monthsAfterOnboarding < 1) {
    throw new Error('A valid onboarding date and positive billing month are required.');
  }
  const [year, month, day] = onboardDate.split('-').map(Number);
  const monthIndex = year * 12 + month - 1 + monthsAfterOnboarding;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function getServerBillingDueDate(onboardDate, monthsAfterOnboarding) {
  return getMonthlyAnniversaryDate(onboardDate, monthsAfterOnboarding);
}

function getDaysBefore(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day - days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
}

export function getServerBillingCycles(onboardDate, today = new Date().toISOString().slice(0, 10)) {
  if (!validIsoDate(String(today || ''))) throw new Error('A valid current date is required.');
  if (!validIsoDate(String(onboardDate || ''))) throw new Error('A valid onboarding date is required.');
  const [onboardYear, onboardMonth] = onboardDate.split('-').map(Number);
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const monthDifference = (todayYear - onboardYear) * 12 + todayMonth - onboardMonth;
  const maximumOffset = Math.max(1, monthDifference + 2);
  const cycles = [];
  for (let offset = 1; offset <= maximumOffset; offset += 1) {
    const dueDate = getServerBillingDueDate(onboardDate, offset);
    cycles.push({ due_date: dueDate, overdue: dueDate <= today });
    if (dueDate > today) break;
  }
  return cycles;
}

export function buildServerBillingSchedule({ events, activeAccounts, invoices, clients, settings, today }) {
  const clientById = new Map((clients || []).map(client => [String(client.client_id || '').toUpperCase(), client]));
  const invoiceByCycle = new Map();
  for (const invoice of (invoices || []).filter(item => item.billing_type === 'server_fee' && !item.deleted_at && item.server_billing_due_date)) {
    const accounts = String(invoice.account_number || '').split(',').map(value => value.trim()).filter(Boolean);
    for (const accountNumber of accounts) {
      invoiceByCycle.set(`${String(invoice.client_id).toUpperCase()}\u0000${invoice.server_billing_due_date}\u0000${accountNumber}`, invoice);
    }
  }
  const groups = new Map();
  for (const account of activeAccounts || []) {
    const clientId = String(account.client_id || '').toUpperCase();
    const accountNumber = String(account.account_number || '');
    if (!clientId || !accountNumber) continue;
    const accountEvents = (events || [])
      .filter(event => !event.deleted_at && String(event.client_id || '').toUpperCase() === clientId && String(event.account_number || '') === accountNumber)
      .sort((left, right) => new Date(left.created_at) - new Date(right.created_at) || Number(left.id) - Number(right.id));
    let onboarding = null;
    for (const event of accountEvents) {
      if (event.event_type === 'offboarded') onboarding = null;
      else if (event.event_type === 'onboarded') onboarding = event;
    }
    if (!onboarding || Number(onboarding.server_billing_enabled) !== 1) continue;
    const client = clientById.get(clientId);
    if (!client || client.deleted_at) continue;
    const onboardingDate = onboarding.server_billing_onboarding_date || String(onboarding.created_at).slice(0, 10);
    for (const [cycleIndex, cycle] of getServerBillingCycles(String(onboardingDate).slice(0, 10), today).entries()) {
      const key = `${clientId}\u0000${cycle.due_date}\u0000${accountNumber}`;
      const legacyDueDate = getMonthlyAnniversaryDate(String(onboardingDate).slice(0, 10), cycleIndex + 1);
      const legacyInvoice = invoiceByCycle.get(`${clientId}\u0000${legacyDueDate}\u0000${accountNumber}`)
        || invoiceByCycle.get(`${clientId}\u0000${getDaysBefore(legacyDueDate, 7)}\u0000${accountNumber}`);
      if (legacyInvoice && !invoiceByCycle.has(key)) invoiceByCycle.set(key, legacyInvoice);
      if (!groups.has(key)) {
        groups.set(key, {
          client_id: clientId,
          client_name: `${client.first_name || ''} ${client.second_name || ''}`.trim() || account.client_name,
          account_numbers: [accountNumber],
          due_date: cycle.due_date,
          overdue: cycle.overdue
        });
      }
    }
  }
  return [...groups.values()].map(group => {
    const invoice = invoiceByCycle.get(`${group.client_id}\u0000${group.due_date}\u0000${group.account_numbers[0]}`) || null;
    const legacyLineItems = typeof invoice?.custom_line_items === 'string'
      ? JSON.parse(invoice.custom_line_items || '[]')
      : invoice?.custom_line_items || [];
    const legacyFeeLines = legacyLineItems.filter(line => String(line.description || '').startsWith('Monthly server fee · Account '));
    const serverCostUsd = legacyFeeLines.length
      ? legacyFeeLines.reduce((sum, line) => sum + Number(line.amount_usd || 0), 0)
      : Number(invoice?.server_maintenance_usd || 0);
    const serverCostInr = legacyFeeLines.length
      ? legacyFeeLines.reduce((sum, line) => sum + Number(line.amount_inr || 0), 0)
      : Number(invoice?.server_maintenance_amount || 0);
    return {
      ...group,
      amount_usd: invoice ? serverCostUsd : null,
      amount_inr: invoice ? serverCostInr : null,
      status: invoice ? (invoice.payment_status === 'paid' ? 'settled' : 'pending') : 'upcoming',
      invoice_id: invoice?.id || null,
      invoice_number: invoice?.invoice_number || null,
      client_email: clientById.get(group.client_id)?.email || '',
      client_phone: clientById.get(group.client_id)?.whatsapp_number || ''
    };
  }).sort((left, right) => left.due_date.localeCompare(right.due_date) || left.client_name.localeCompare(right.client_name));
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
  if (!Array.isArray(customLines) || customLines.length > 50) throw new Error('Add no more than 50 custom invoice lines.');

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

export function formatBillingInvoiceNumber(year, month, sequence) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100
    || !Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Invoice number date or sequence is invalid.');
  }
  return `INV-TC-${String(sequence).padStart(3, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function createGooglePayPaymentPageUrl(invoice, settings, siteUrl = process.env.PUBLIC_SITE_URL || 'https://trishul-capital-v3.vercel.app') {
  const upiId = String(settings?.upi_id || '').trim();
  const amount = Number(invoice?.amount);
  if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(upiId) || !Number.isFinite(amount) || amount <= 0) return null;
  let baseUrl;
  try {
    baseUrl = new URL(siteUrl);
  } catch {
    throw new Error('PUBLIC_SITE_URL must be a valid HTTPS URL.');
  }
  if (baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname))) {
    throw new Error('PUBLIC_SITE_URL must use HTTPS.');
  }
  const payeeName = String(settings.company_name || '').trim().slice(0, 100) || 'Trishul Capital';
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: `Invoice ${String(invoice.invoice_number || '')}`.slice(0, 80)
  });
  return `${baseUrl.origin}/pay/index.html?${params.toString()}`;
}

export function getNextBillingInvoiceSequence(lastSequence, reusableSequence) {
  const last = Number(lastSequence);
  if (!Number.isSafeInteger(last) || last < 0 || last >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Invoice sequence is invalid.');
  }
  if (reusableSequence !== undefined && reusableSequence !== null) {
    const reusable = Number(reusableSequence);
    if (!Number.isSafeInteger(reusable) || reusable < 1) throw new Error('Reusable invoice sequence is invalid.');
    return reusable;
  }
  return last + 1;
}

function validateBillingInvoiceNumber(invoiceNumber, issueDate) {
  const match = /^INV-TC-\d{3,}\/(\d{2})\/(\d{4})$/.exec(String(invoiceNumber || ''));
  if (!match || !validIsoDate(String(issueDate || ''))
    || Number(match[1]) !== Number(issueDate.slice(5, 7))
    || Number(match[2]) !== Number(issueDate.slice(0, 4))) {
    throw new Error('A valid monthly invoice number matching the issue date is required.');
  }
}

export function replaceInvoiceAccountNumber(invoice, oldAccountNumber, newAccountNumber) {
  const oldNumber = String(oldAccountNumber || '').trim();
  const newNumber = String(newAccountNumber || '').trim();
  const customLines = typeof invoice.custom_line_items === 'string'
    ? JSON.parse(invoice.custom_line_items)
    : invoice.custom_line_items;
  const descriptions = (Array.isArray(customLines) ? customLines : []).map(line => ({
    ...line,
    description: String(line.description || '')
      .replace(new RegExp(`\\b(account|Account) ${oldNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s·,])`, 'g'), (_, label) => `${label} ${newNumber}`)
  }));
  const accounts = String(invoice.account_number || '').split(',').map(value => value.trim());
  return {
    ...invoice,
    account_number: accounts.map(value => value === oldNumber ? newNumber : value).join(', '),
    custom_line_items: typeof invoice.custom_line_items === 'string' ? JSON.stringify(descriptions) : descriptions
  };
}

function clientInvoiceDetails(client) {
  const clientName = `${client.first_name || ''} ${client.second_name || ''}`.trim();
  const clientAddress = [
    client.address_line1, client.address_line2, client.city, client.state, client.country, client.pincode
  ].filter(Boolean).join(', ');
  return {
    client_id: String(client.client_id),
    client_name: clientName || 'Client',
    client_email: String(client.email || '').trim().toLowerCase(),
    client_phone: String(client.whatsapp_number || ''),
    client_address: clientAddress
  };
}

export function createBillingInvoice(client, input, maintenanceAlreadyCharged = false, settings = getDefaultBillingSettings(), invoiceNumber, issueDate = new Date().toISOString().slice(0, 10)) {
  const accountNumber = String(input.account_number || '').trim();
  if (!accountNumber || accountNumber.length > 100) throw new Error('Choose a valid portfolio account number.');
  validateBillingInvoiceNumber(invoiceNumber, issueDate);
  const isOnboardingInvoice = input.period_type === 'onboard';
  if (isOnboardingInvoice && Number(input.server_maintenance_usd) <= 0) {
    throw new Error('Enter a server cost greater than zero for an onboarding server bill.');
  }
  const serverBillingDueDate = input.server_billing_due_date
    ? String(input.server_billing_due_date).trim()
    : isOnboardingInvoice ? issueDate : null;
  if (serverBillingDueDate && !validIsoDate(serverBillingDueDate)) throw new Error('Choose a valid server billing due date.');
  const { periodStart, periodEnd } = getBillingPeriodDates(input);
  const amounts = calculateBillingAmounts(input, maintenanceAlreadyCharged);
  return {
    invoice_number: invoiceNumber,
    ...clientInvoiceDetails(client),
    account_number: accountNumber,
    issue_date: issueDate,
    due_date: serverBillingDueDate || periodEnd,
    period_type: input.period_type === 'onboard' ? 'monthly' : input.period_type,
    period_start: periodStart,
    period_end: periodEnd,
    billing_type: isOnboardingInvoice || serverBillingDueDate ? 'server_fee' : 'standard',
    server_billing_due_date: serverBillingDueDate,
    invoice_settings: normalizeBillingSettings(settings),
    payment_status: 'pending',
    paid_at: null,
    payment_method: null,
    payment_reference: null,
    deleted_at: null,
    ...amounts,
    status: 'email_failed',
    emailed_at: null
  };
}

export function createServerBillingInvoice(client, dueDate, accountNumbers, settings, invoiceNumber, issueDate = new Date().toISOString().slice(0, 10)) {
  const normalizedSettings = normalizeBillingSettings(settings);
  validateBillingInvoiceNumber(invoiceNumber, issueDate);
  if (!validIsoDate(String(dueDate || ''))) throw new Error('Choose a valid server billing due date.');
  const accounts = [...new Set((accountNumbers || []).map(value => String(value || '').trim()).filter(Boolean))].sort();
  if (!accounts.length || accounts.length > 50 || accounts.some(value => value.length > 100)) {
    throw new Error('The server billing invoice needs 1–50 valid account numbers.');
  }
  if (normalizedSettings.monthly_server_fee_usd <= 0) throw new Error('Set a monthly server fee greater than zero in Invoice Settings.');
  if (normalizedSettings.usd_inr_rate <= 0) throw new Error('Set a USD to INR rate in Invoice Settings before generating server invoices.');
  const [year, month] = dueDate.split('-').map(Number);
  const { periodStart, periodEnd } = getBillingPeriodDates({ period_type: 'monthly', year, month });
  const feeLines = accounts.map(accountNumber => ({
    description: `Monthly server fee · Account ${accountNumber} · Due ${dueDate}`,
    amount_usd: normalizedSettings.monthly_server_fee_usd
  }));
  const amounts = calculateBillingAmounts({
    withdrawal_profit_usd: 0,
    profit_split_percent: 0,
    server_maintenance_usd: 0,
    usd_inr_rate: normalizedSettings.usd_inr_rate,
    custom_line_items: feeLines
  });
  return {
    invoice_number: invoiceNumber,
    ...clientInvoiceDetails(client),
    account_number: accounts.join(', '),
    issue_date: issueDate,
    due_date: dueDate,
    period_type: 'monthly',
    period_start: periodStart,
    period_end: periodEnd,
    billing_type: 'server_fee',
    server_billing_due_date: dueDate,
    invoice_settings: normalizedSettings,
    payment_status: 'pending',
    paid_at: null,
    payment_method: null,
    payment_reference: null,
    deleted_at: null,
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
    lines.push({ description: `Server maintenance · Account ${invoice.account_number} (USD ${Number(invoice.server_maintenance_usd).toFixed(2)})`, amount: Number(invoice.server_maintenance_amount) });
  }
  for (const item of Array.isArray(custom) ? custom : []) {
    lines.push({ description: `${item.description} (USD ${Number(item.amount_usd).toFixed(2)})`, amount: Number(item.amount_inr) });
  }
  return lines;
}

function invoiceSettings(invoice) {
  let source = invoice.invoice_settings || {};
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  return normalizeBillingSettings(source);
}

function imageBuffer(dataUrl) {
  if (!dataUrl) return null;
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('A saved invoice image is invalid.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!IMAGE_SIGNATURES[match[1]](buffer)) throw new Error('A saved invoice image is invalid.');
  return buffer;
}

export function createBillingPdf(invoice) {
  return new Promise((resolve, reject) => {
    let settings;
    try { settings = invoiceSettings(invoice); } catch (error) { reject(error); return; }
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const left = 48;
    const right = document.page.width - 48;
    const contentWidth = right - left;
    const logo = imageBuffer(settings.logo_data_url);
    if (logo) document.image(logo, left, 38, { fit: [135, 72], align: 'left', valign: 'center' });
    else document.fillColor('#171717').font('Helvetica-Bold').fontSize(20).text(settings.company_name, left, 54, { width: 145 });
    document.fillColor('#222').font('Helvetica-Bold').fontSize(15)
      .text(settings.company_name, 270, 42, { width: right - 270, align: 'right' });
    document.font('Helvetica').fillColor('#555').fontSize(8)
      .text([settings.company_address, settings.company_phone, settings.company_email].filter(Boolean).join('\n'), 270, 62, {
        width: right - 270, align: 'right', lineGap: 2
      });

    document.rect(left, 127, contentWidth, 48).fill('#f0f1f3');
    const headerTitleWidth = 130;
    const headerTitleX = left + (contentWidth - headerTitleWidth) / 2;
    const headerSideWidth = 165;
    document.fillColor('#202632').font('Helvetica-Bold').fontSize(16)
      .text('INVOICE', headerTitleX, 139, { width: headerTitleWidth, align: 'center' });
    document.font('Helvetica').fontSize(8).fillColor('#3f4651')
      .text(`Invoice number: ${invoice.invoice_number}`, left + 14, 137, { width: headerSideWidth })
      .text(`Issue date: ${invoice.issue_date}`, left + 14, 151, { width: headerSideWidth })
      .text(`Due date: ${invoice.due_date}`, right - headerSideWidth, 137, { width: headerSideWidth, align: 'right' })
      .text(`Account: ${invoice.account_number || '—'}`, right - headerSideWidth, 151, { width: headerSideWidth, align: 'right' });

    document.fillColor('#666').font('Helvetica-Bold').fontSize(8).text('BILLED TO', left, 195);
    document.fillColor('#171717').font('Helvetica-Bold').fontSize(12).text(invoice.client_name, left, 209, { width: contentWidth });
    document.font('Helvetica').fillColor('#555').fontSize(8).text(
      [invoice.client_id, invoice.client_address, invoice.client_phone, invoice.client_email].filter(Boolean).join('\n'),
      left, 226, { width: 330, lineGap: 2 }
    );

    let rowY = Math.max(document.y + 20, 286);
    const drawTableHeader = y => {
      document.rect(left, y, contentWidth, 25).fill('#e9ebee');
      document.fillColor('#303741').font('Helvetica-Bold').fontSize(8).text('DESCRIPTION', left + 10, y + 8);
      document.text('AMOUNT (INR)', right - 137, y + 8, { width: 127, align: 'right' });
    };
    drawTableHeader(rowY);
    rowY += 34;
    const lines = invoiceLines(invoice);
    if (!lines.length) lines.push({ description: 'Services', amount: Number(invoice.amount || 0) });
    for (const line of lines) {
      const descriptionHeight = document.heightOfString(line.description, { width: 340, font: 'Helvetica', fontSize: 8, lineGap: 2 });
      if (rowY + descriptionHeight + 20 > 690) {
        document.addPage();
        rowY = 54;
        drawTableHeader(rowY);
        rowY += 34;
      }
      document.fillColor('#222').font('Helvetica').fontSize(8).text(line.description, left + 10, rowY, { width: 340, lineGap: 2 });
      document.text(`INR ${Number(line.amount).toFixed(2)}`, right - 137, rowY, { width: 127, align: 'right' });
      rowY += Math.max(descriptionHeight, 12) + 12;
      document.moveTo(left, rowY).lineTo(right, rowY).strokeColor('#e1e3e7').lineWidth(0.5).stroke();
      rowY += 10;
    }
    if (rowY + 45 > 700) {
      document.addPage();
      rowY = 55;
    }
    document.fillColor('#555').font('Helvetica').fontSize(8)
      .text(`Exchange rate: USD 1 = INR ${Number(invoice.usd_inr_rate).toFixed(4)}`, left, rowY + 4, { width: contentWidth, align: 'right' });
    rowY += 21;
    document.rect(right - 247, rowY, 247, 31).fill('#f0f1f3');
    document.fillColor('#171717').font('Helvetica-Bold').fontSize(10).text('TOTAL DUE (INR)', right - 237, rowY + 10);
    document.text(`INR ${Number(invoice.amount).toFixed(2)}`, right - 137, rowY + 10, { width: 127, align: 'right' });
    rowY += 45;

    const qr = imageBuffer(settings.upi_qr_data_url);
    if (rowY > 690) {
      document.addPage();
      rowY = 55;
    }
    const paymentPageUrl = createGooglePayPaymentPageUrl(invoice, settings);
    document.fillColor('#4b515a').font('Helvetica-Bold').fontSize(8).text('PAYMENT DETAILS', left, rowY);
    rowY += 15;
    if (qr) document.image(qr, left, rowY, { fit: [90, 90] });
    const bankDetails = [
      settings.upi_id ? `UPI ID: ${settings.upi_id}` : '',
      settings.bank_account_name ? `Account name: ${settings.bank_account_name}` : '',
      settings.bank_account_number ? `Account number: ${settings.bank_account_number}` : '',
      settings.bank_name ? `Bank: ${settings.bank_name}` : '',
      settings.bank_branch ? `Branch: ${settings.bank_branch}` : '',
      settings.bank_ifsc ? `IFSC: ${settings.bank_ifsc}` : ''
    ].filter(Boolean);
    const bankDetailsX = qr ? left + 105 : left;
    const bankDetailsWidth = paymentPageUrl || invoice.payment_status === 'paid'
      ? right - bankDetailsX - 212
      : qr ? 300 : contentWidth;
    document.font('Helvetica').fillColor('#333').fontSize(8).text(
      bankDetails.length ? bankDetails.join('\n') : 'Contact us for payment instructions.',
      bankDetailsX, rowY + 2, { width: bankDetailsWidth, lineGap: 4 }
    );
    if (invoice.payment_status === 'paid') {
      document.image(PAID_STAMP, right - 145, rowY - 2, { fit: [90, 80] });
    } else if (paymentPageUrl) {
      const buttonX = right - 200;
      const buttonY = rowY + 2;
      document.roundedRect(buttonX, buttonY, 200, 42, 6).fill('#168447');
      document.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
        .text('PAY NOW', buttonX + 8, buttonY + 6, { width: 184, align: 'center' })
        .fontSize(8).text(`INR ${Number(invoice.amount).toFixed(2)}`, buttonX + 8, buttonY + 22, { width: 184, align: 'center' });
      document.link(buttonX, buttonY, 200, 42, paymentPageUrl);
    }
    if (invoice.payment_status === 'paid') {
      document.fillColor('#24743a').font('Helvetica-Bold').fontSize(8)
        .text(formatPaidInvoiceDetails(invoice), left, Math.max(rowY + 96, document.y + 10), { width: contentWidth });
    }

    const footer = 'Please use the invoice number as your payment reference. This invoice is not a GST tax invoice unless applicable tax details are separately stated.';
    document.fillColor('#777').font('Helvetica').fontSize(7).text(footer, left, document.page.height - 80, {
      width: contentWidth, align: 'center'
    });
    document.end();
  });
}
