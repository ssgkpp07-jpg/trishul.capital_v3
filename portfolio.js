import ExcelJS from 'exceljs';

const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function summarizePortfolio(events) {
  const accounts = new Map();
  let fundsWithdrawn = 0;
  let profitsWithdrawn = 0;
  const now = new Date();
  const currentWeekStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay());
  const previousWeekStart = currentWeekStart - 7 * 24 * 60 * 60 * 1000;
  const currentMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const previousMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  let previousWeekProfits = 0;
  let previousMonthProfits = 0;

  const activeEvents = events.filter(event => !event.deleted_at);
  for (const event of [...activeEvents].sort((left, right) => new Date(left.created_at) - new Date(right.created_at))) {
    const accountNumber = String(event.account_number || '').trim();
    if (!accountNumber) continue;
    let account = accounts.get(accountNumber);
    if (!account) {
      account = { account_number: accountNumber, client_id: event.client_id || null, client_name: event.client_name, funds_added: 0, funds_withdrawn: 0, has_offboarded: false, updated_at: event.created_at };
      accounts.set(accountNumber, account);
    }
    account.client_id = event.client_id || account.client_id;
    account.client_name = event.client_name || account.client_name;
    account.updated_at = event.created_at;
    const amount = Number(event.amount) || 0;
    if (event.event_type === 'onboarded' || event.event_type === 'funds_added') account.funds_added += amount;
    if (event.event_type === 'offboarded') {
      account.funds_withdrawn += amount;
      account.has_offboarded = true;
      fundsWithdrawn += amount;
    }
    if (event.event_type === 'profit_withdrawn') {
      profitsWithdrawn += amount;
      const timestamp = new Date(event.created_at).getTime();
      if (timestamp >= previousWeekStart && timestamp < currentWeekStart) previousWeekProfits += amount;
      if (timestamp >= previousMonthStart && timestamp < currentMonthStart) previousMonthProfits += amount;
    }
  }

  const accountTotals = [...accounts.values()].map(account => ({
    ...account,
    funds_managed: roundMoney(Math.max(0, account.funds_added - account.funds_withdrawn))
  }));
  const activeAccounts = accountTotals.filter(account => account.funds_managed > 0);
  const offboardedAccounts = accountTotals.filter(account => account.funds_managed === 0 && account.has_offboarded);
  const clientKey = account => account.client_id ? `id:${account.client_id}` : `name:${account.client_name.trim().toLowerCase()}`;
  const activeClients = new Set(activeAccounts.map(clientKey));
  const offboardedClients = new Set(offboardedAccounts
    .map(clientKey)
    .filter(client => !activeClients.has(client)));

  return {
    summary: {
      onboarded_clients: activeClients.size,
      onboarded_accounts: activeAccounts.length,
      funds_managed: roundMoney(activeAccounts.reduce((total, account) => total + account.funds_managed, 0)),
      offboarded_clients: offboardedClients.size,
      offboarded_accounts: offboardedAccounts.length,
      funds_withdrawn: roundMoney(fundsWithdrawn),
      profits_withdrawn: roundMoney(profitsWithdrawn),
      previous_week_profits_withdrawn: roundMoney(previousWeekProfits),
      previous_month_profits_withdrawn: roundMoney(previousMonthProfits)
    },
    active_accounts: activeAccounts,
    events: [...events].sort((left, right) => new Date(right.created_at) - new Date(left.created_at) || Number(right.id) - Number(left.id))
  };
}

export function summarizePortfolioMonths(events) {
  const months = new Map();
  for (const event of events) {
    if (event.deleted_at) continue;
    const date = new Date(event.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!months.has(key)) months.set(key, { key, label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }), onboarded: new Set(), offboarded: new Set(), fundsAdded: 0, fundsWithdrawn: 0 });
    const month = months.get(key);
    const client = event.client_id ? `id:${event.client_id}` : `name:${String(event.client_name || '').trim().toLowerCase()}`;
    const amount = Number(event.amount) || 0;
    if (event.event_type === 'onboarded') month.onboarded.add(client);
    if (event.event_type === 'offboarded') {
      month.offboarded.add(client);
      month.fundsWithdrawn += amount;
    }
    if (event.event_type === 'onboarded' || event.event_type === 'funds_added') month.fundsAdded += amount;
  }
  return [...months.values()].sort((left, right) => left.key.localeCompare(right.key)).map(month => ({
    key: month.key,
    label: month.label,
    onboardedCount: month.onboarded.size,
    offboardedCount: month.offboarded.size,
    fundsAdded: roundMoney(month.fundsAdded),
    fundsWithdrawn: roundMoney(month.fundsWithdrawn)
  }));
}

export function filterPortfolioEventsByDate(events, from, to) {
  const validDate = value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
  if (!validDate(from) || !validDate(to)) throw new Error('Use valid dates in YYYY-MM-DD format');
  if (from && to && from > to) throw new Error('The From date must be on or before the To date');
  return events.filter(event => {
    const date = String(event.created_at || '').slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  });
}

export async function buildPortfolioWorkbook(events) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Trishul Capital';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Portfolio Ledger', { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = [
    { header: 'Date & time', key: 'created_at', width: 24, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
    { header: 'Client ID', key: 'client_id', width: 18 },
    { header: 'Client name', key: 'client_name', width: 24 },
    { header: 'Account number', key: 'account_number', width: 22 },
    { header: 'Activity', key: 'event_type', width: 22 },
    { header: 'Funds (USD)', key: 'amount', width: 18, style: { numFmt: '$#,##0.00' } },
    { header: 'Deleted at', key: 'deleted_at', width: 24, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
    { header: 'Record status', key: 'record_status', width: 16 }
  ];
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFF4D47B' } };
  for (const event of [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
    worksheet.addRow({
      created_at: new Date(event.created_at),
      client_id: event.client_id || '',
      client_name: event.client_name,
      account_number: event.account_number,
      event_type: ({ onboarded: 'Onboarded', funds_added: 'Funds added', offboarded: 'Offboarded', profit_withdrawn: 'Profit withdrawn' })[event.event_type] || event.event_type,
      amount: Number(event.amount) || 0,
      deleted_at: event.deleted_at ? new Date(event.deleted_at) : null,
      record_status: event.deleted_at ? 'Deleted' : 'Active'
    });
  }
  worksheet.autoFilter = { from: 'A1', to: 'H1' };
  return workbook.xlsx.writeBuffer();
}