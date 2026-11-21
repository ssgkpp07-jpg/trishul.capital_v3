import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBillingAmounts, createBillingInvoice, createBillingPdf, getBillingPeriodDates } from './billing.js';

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

test('invoice creation requires a client email and a positive invoice total', () => {
  const client = { client_id: 'C-1', first_name: 'Sample', second_name: 'Client', email: '' };
  const validClient = { ...client, email: 'sample@example.com' };
  const input = {
    account_number: 'ACC-1',
    period_type: 'monthly', year: 2026, month: 11,
    withdrawal_profit_usd: 100, profit_split_percent: 10,
    server_maintenance_usd: 0, usd_inr_rate: 90
  };
  assert.throws(() => createBillingInvoice(client, input), /valid email/);
  assert.throws(() => createBillingInvoice(validClient, { ...input, account_number: '' }), /portfolio account/);
  assert.throws(() => calculateBillingAmounts({ ...input, withdrawal_profit_usd: 0 }), /greater than zero/);
});

test('invoice PDF generation returns a PDF document', async () => {
  const invoice = createBillingInvoice(
    { client_id: 'C-1', first_name: 'Sample', second_name: 'Client', email: 'sample@example.com' },
    {
      account_number: 'ACC-1',
      period_type: 'monthly', year: 2026, month: 11,
      withdrawal_profit_usd: 100, profit_split_percent: 10,
      server_maintenance_usd: 0, usd_inr_rate: 90
    }
  );
  assert.equal(invoice.account_number, 'ACC-1');
  const pdf = await createBillingPdf(invoice);
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
});
