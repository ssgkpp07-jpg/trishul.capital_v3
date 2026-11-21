import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaymentLinks } from './public/pay/payment.js';
import {
  buildServerBillingSchedule,
  calculateBillingAmounts,
  createGooglePayPaymentPageUrl,
  createBillingInvoice,
  createBillingPdf,
  formatBillingInvoiceNumber,
  getNextBillingInvoiceSequence,
  getBillingPeriodDates,
  getMonthlyAnniversaryDate,
  getServerBillingDueDate,
  getServerBillingCycles,
  replaceInvoiceAccountNumber
} from './billing.js';

test('invoice numbers use a monthly sequence with a padded month and year', () => {
  assert.equal(formatBillingInvoiceNumber(2026, 1, 1), 'INV-TC-001/01/2026');
  assert.equal(formatBillingInvoiceNumber(2026, 12, 12), 'INV-TC-012/12/2026');
  assert.equal(formatBillingInvoiceNumber(2026, 1, 1000), 'INV-TC-1000/01/2026');
  assert.throws(() => formatBillingInvoiceNumber(2026, 13, 1), /invalid/);
});

test('invoice sequencing reuses a permanently deleted number before continuing', () => {
  assert.equal(getNextBillingInvoiceSequence(4, 2), 2);
  assert.equal(getNextBillingInvoiceSequence(4, null), 5);
  assert.throws(() => getNextBillingInvoiceSequence(4, 0), /reusable invoice sequence/i);
});

test('Google Pay payment-page link prefills the configured payee, invoice total, and reference', () => {
  const uri = createGooglePayPaymentPageUrl(
    { invoice_number: 'INV-TC-001/11/2026', amount: 12500 },
    { upi_id: 'merchant@okaxis', company_name: 'Trishul Capital' },
    'https://example.com'
  );
  const payment = new URL(uri);
  assert.equal(payment.protocol, 'https:');
  assert.equal(payment.pathname, '/pay/index.html');
  assert.equal(payment.searchParams.get('pa'), 'merchant@okaxis');
  assert.equal(payment.searchParams.get('pn'), 'Trishul Capital');
  assert.equal(payment.searchParams.get('am'), '12500.00');
  assert.equal(payment.searchParams.get('cu'), 'INR');
  assert.equal(payment.searchParams.get('tn'), 'Invoice INV-TC-001/11/2026');
  assert.equal(createGooglePayPaymentPageUrl({ amount: 12500 }, { upi_id: '' }, 'https://example.com'), null);
  assert.throws(() => createGooglePayPaymentPageUrl({ amount: 12500 }, { upi_id: 'merchant@okaxis' }, 'javascript:alert(1)'), /must use HTTPS/);
});

test('payment page targets Google Pay on Android and offers generic UPI as fallback', () => {
  const links = createPaymentLinks({
    pa: 'merchant@okaxis',
    pn: 'Trishul Capital',
    am: '12500.00',
    tn: 'Invoice INV-TC-001/11/2026'
  });
  assert.match(links.googlePay, /^intent:\/\/pay\?.*#Intent;scheme=upi;package=com\.google\.android\.apps\.nbu\.paisa\.user;end$/);
  assert.match(links.otherUpi, /^upi:\/\/pay\?/);
  assert.match(links.googlePay, /am=12500\.00/);
});

test('account number edits update invoice account lists and account-specific line descriptions', () => {
  const updated = replaceInvoiceAccountNumber({
    account_number: 'ACC-1, ACC-10',
    custom_line_items: [
      { description: 'Profit share for account ACC-1' },
      { description: 'Monthly server fee · Account ACC-1 · Due 2026-01-31' },
      { description: 'Other charge' }
    ]
  }, 'ACC-1', 'NEW-1');
  assert.equal(updated.account_number, 'NEW-1, ACC-10');
  assert.deepEqual(updated.custom_line_items.map(line => line.description), [
    'Profit share for account NEW-1',
    'Monthly server fee · Account NEW-1 · Due 2026-01-31',
    'Other charge'
  ]);
});

test('weekly billing dates stop at the end of the selected month', () => {
  assert.deepEqual(getBillingPeriodDates({ period_type: 'weekly', year: 2024, month: 2, week: 5 }), {
    periodStart: '2024-02-29',
    periodEnd: '2024-02-29'
  });
  assert.throws(() => getBillingPeriodDates({ period_type: 'weekly', year: 2023, month: 2, week: 5 }), /valid week/);
});

test('profit share, maintenance, and custom lines convert to INR with rounded totals', () => {
  const amounts = calculateBillingAmounts({
    withdrawal_profit_usd: 100,
    profit_split_percent: 20,
    server_maintenance_usd: 5,
    usd_inr_rate: 80,
    custom_line_items: [{ description: 'Support', amount_usd: 10 }]
  });
  assert.equal(amounts.profit_share_usd, 20);
  assert.equal(amounts.profit_share_amount, 1600);
  assert.equal(amounts.server_maintenance_amount, 400);
  assert.equal(amounts.custom_line_items[0].amount_inr, 800);
  assert.equal(amounts.amount, 2800);
});

test('monthly maintenance is not charged twice in the same billing month', () => {
  const amounts = calculateBillingAmounts({
    withdrawal_profit_usd: 100,
    profit_split_percent: 10,
    server_maintenance_usd: 25,
    usd_inr_rate: 80
  }, true);
  assert.equal(amounts.server_maintenance_usd, 0);
  assert.equal(amounts.amount, 800);
});

test('invoice creation accepts manual WhatsApp-only sharing but requires an account and positive total', () => {
  const client = { client_id: 'C-1', first_name: 'Sample', second_name: 'Client', email: '' };
  const input = {
    account_number: 'ACC-1',
    period_type: 'monthly', year: 2026, month: 11,
    withdrawal_profit_usd: 100, profit_split_percent: 10,
    server_maintenance_usd: 0, usd_inr_rate: 90
  };
  const invoice = createBillingInvoice({ ...client, whatsapp_number: '+14155552671' }, input, false, undefined, 'INV-TC-001/11/2026', '2026-11-30');
  assert.equal(invoice.invoice_number, 'INV-TC-001/11/2026');
  assert.equal(invoice.client_email, '');
  assert.equal(invoice.client_phone, '+14155552671');
  assert.equal(invoice.payment_status, 'pending');
  assert.throws(() => createBillingInvoice(client, { ...input, account_number: '' }), /portfolio account/);
  assert.throws(() => createBillingInvoice(client, input, false, undefined, 'INV-TC-001/10/2026', '2026-11-30'), /matching the issue date/);
  assert.throws(() => calculateBillingAmounts({ ...input, withdrawal_profit_usd: 0 }), /greater than zero/);
});

test('monthly server cycles are due on onboarding anniversaries', () => {
  assert.equal(getMonthlyAnniversaryDate('2024-01-31', 1), '2024-02-29');
  assert.equal(getMonthlyAnniversaryDate('2024-01-31', 2), '2024-03-31');
  assert.equal(getServerBillingDueDate('2024-01-31', 1), '2024-02-29');
  assert.equal(getServerBillingDueDate('2024-01-31', 2), '2024-03-31');
  assert.deepEqual(getServerBillingCycles('2024-01-31', '2024-03-15'), [
    { due_date: '2024-02-29', overdue: true },
    { due_date: '2024-03-31', overdue: false }
  ]);
});

test('server fee schedules are tracked per account and invoice values are entered manually', () => {
  const client = { client_id: 'C-1', first_name: 'Sample', second_name: 'Client', email: 'sample@example.com' };
  const invoice = createBillingInvoice(client, {
    account_number: 'ACC-1',
    period_type: 'monthly', year: 2024, month: 2,
    withdrawal_profit_usd: 0, profit_split_percent: 0,
    server_maintenance_usd: 25, usd_inr_rate: 80,
    server_billing_due_date: '2024-02-29',
    custom_line_items: [{ description: 'Additional service', amount_usd: 5 }]
  }, false, undefined, 'INV-TC-001/02/2024', '2024-02-15');
  assert.equal(invoice.billing_type, 'server_fee');
  assert.equal(invoice.due_date, '2024-02-29');
  assert.equal(invoice.server_maintenance_usd, 25);
  assert.equal(invoice.usd_inr_rate, 80);
  assert.equal(invoice.amount, 2400);

  const cycles = buildServerBillingSchedule({
    events: ['ACC-1', 'ACC-2'].map((account_number, index) => ({
      id: index + 1,
      client_id: 'C-1',
      account_number,
      event_type: 'onboarded',
      created_at: '2024-01-31T00:00:00.000Z',
      server_billing_enabled: true
    })),
    activeAccounts: ['ACC-1', 'ACC-2'].map(account_number => ({ client_id: 'C-1', account_number })),
    invoices: [{
      ...invoice,
      id: 8,
      server_billing_due_date: '2024-02-29',
      payment_status: 'paid',
      amount: 2400
    }],
    clients: [{ ...client, whatsapp_number: '+14155552671' }],
    settings: {},
    today: '2024-03-15'
  });
  assert.deepEqual(cycles.map(cycle => [cycle.account_numbers[0], cycle.due_date, cycle.status]), [
    ['ACC-1', '2024-02-29', 'settled'],
    ['ACC-2', '2024-02-29', 'upcoming'],
    ['ACC-1', '2024-03-31', 'upcoming'],
    ['ACC-2', '2024-03-31', 'upcoming']
  ]);
  assert.equal(cycles[0].amount_usd, 25);
  assert.equal(cycles[0].amount_inr, 2000);
});

test('a generated unpaid server-fee invoice remains a pending cycle', () => {
  const cycles = buildServerBillingSchedule({
    events: [{
      id: 1,
      client_id: 'C-1',
      account_number: 'ACC-1',
      event_type: 'onboarded',
      created_at: '2024-01-10T00:00:00.000Z',
      server_billing_enabled: true,
      server_billing_onboarding_date: '2024-01-10'
    }],
    activeAccounts: [{ client_id: 'C-1', account_number: 'ACC-1' }],
    invoices: [{
      id: 8,
      client_id: 'C-1',
      account_number: 'ACC-1',
      billing_type: 'server_fee',
      server_billing_due_date: '2024-02-10',
      payment_status: 'pending'
    }],
    clients: [{ client_id: 'C-1', first_name: 'Sample', second_name: 'Client' }],
    settings: {},
    today: '2024-02-01'
  });
  assert.deepEqual(cycles.map(cycle => [cycle.due_date, cycle.status]), [['2024-02-10', 'pending']]);
});

test('enabled accounts remain visible in upcoming cycles without global pricing settings', () => {
  const cycles = buildServerBillingSchedule({
    events: [{
      id: 1,
      client_id: 'C-1',
      account_number: 'ACC-1',
      event_type: 'onboarded',
      created_at: '2024-01-10T00:00:00.000Z',
      server_billing_enabled: true
    }],
    activeAccounts: [{ client_id: 'C-1', account_number: 'ACC-1' }],
    invoices: [],
    clients: [{ client_id: 'C-1', first_name: 'Sample', second_name: 'Client' }],
    settings: {},
    today: '2024-01-20'
  });
  assert.deepEqual(cycles.map(cycle => [cycle.due_date, cycle.status, cycle.amount_usd]), [
    ['2024-02-10', 'upcoming', null]
  ]);
});

test('invoice PDF generation returns a PDF document', async () => {
  const invoice = createBillingInvoice(
    { client_id: 'C-1', first_name: 'Sample', second_name: 'Client', email: 'sample@example.com' },
    {
      account_number: 'ACC-1',
      period_type: 'monthly', year: 2026, month: 11,
      withdrawal_profit_usd: 100, profit_split_percent: 10,
      server_maintenance_usd: 0, usd_inr_rate: 90
    },
    false,
    undefined,
    'INV-TC-001/11/2026',
    '2026-11-30'
  );
  assert.equal(invoice.account_number, 'ACC-1');
  const pdf = await createBillingPdf({
    ...invoice,
    invoice_settings: { ...invoice.invoice_settings, upi_id: 'merchant@okaxis' },
    payment_status: 'paid',
    paid_at: '2026-11-21T12:00:00.000Z',
    payment_reference: 'TEST-REFERENCE'
  });
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
  assert.ok(pdf.includes(Buffer.from('/pay/index.html?')));
  assert.match(pdf.toString('latin1'), /\/Count 1\b/);
});
