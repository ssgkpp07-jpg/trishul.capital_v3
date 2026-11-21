import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildServerBillingSchedule,
  calculateBillingAmounts,
  createBillingInvoice,
  createBillingPdf,
  createServerBillingInvoice,
  formatBillingInvoiceNumber,
  getBillingPeriodDates,
  getMonthlyAnniversaryDate,
  getServerBillingCycles,
  replaceInvoiceAccountNumber
} from './billing.js';

test('invoice numbers use a monthly sequence with a padded month and year', () => {
  assert.equal(formatBillingInvoiceNumber(2026, 1, 1), 'INV-TC-001/01/2026');
  assert.equal(formatBillingInvoiceNumber(2026, 12, 12), 'INV-TC-012/12/2026');
  assert.equal(formatBillingInvoiceNumber(2026, 1, 1000), 'INV-TC-1000/01/2026');
  assert.throws(() => formatBillingInvoiceNumber(2026, 13, 1), /invalid/);
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

test('monthly server cycles start one month after onboarding and clamp month-end anniversaries', () => {
  assert.equal(getMonthlyAnniversaryDate('2024-01-31', 1), '2024-02-29');
  assert.equal(getMonthlyAnniversaryDate('2024-01-31', 2), '2024-03-31');
  assert.deepEqual(getServerBillingCycles('2024-01-31', '2024-03-15'), [
    { due_date: '2024-02-29', overdue: true },
    { due_date: '2024-03-31', overdue: false }
  ]);
});

test('server fee invoice and schedule group same-client accounts and track settled cycles', () => {
  const client = { client_id: 'C-1', first_name: 'Sample', second_name: 'Client', email: 'sample@example.com' };
  const settings = { monthly_server_fee_usd: 25, usd_inr_rate: 80 };
  const invoice = createServerBillingInvoice(client, '2024-02-29', ['ACC-1', 'ACC-2'], settings, 'INV-TC-001/02/2024', '2024-02-29');
  assert.equal(invoice.billing_type, 'server_fee');
  assert.equal(invoice.amount, 4000);
  assert.match(invoice.custom_line_items[0].description, /ACC-1/);

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
      amount: 4000
    }],
    clients: [{ ...client, whatsapp_number: '+14155552671' }],
    settings,
    today: '2024-03-15'
  });
  assert.deepEqual(cycles.map(cycle => [cycle.due_date, cycle.status, cycle.amount_usd]), [
    ['2024-02-29', 'settled', 50],
    ['2024-03-31', 'upcoming', 50]
  ]);
  assert.deepEqual(cycles[0].account_numbers, ['ACC-1', 'ACC-2']);
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
    payment_status: 'paid',
    paid_at: '2026-11-21T12:00:00.000Z',
    payment_reference: 'TEST-REFERENCE'
  });
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
});
