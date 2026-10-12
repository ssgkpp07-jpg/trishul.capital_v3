import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import loginHandler from './login-handler.js';
import { summarizePortfolio, summarizePortfolioMonths, buildPortfolioWorkbook, filterPortfolioEventsByDate } from '../portfolio.js';

let supabaseClient;
const getSupabase = () => {
  if (!supabaseClient) {
    if (!process.env.SUPABASE_URL || !/^https?:\/\//.test(process.env.SUPABASE_URL)) throw new Error('SUPABASE_URL must be a valid https:// URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
};
const supabase = { from: (...args) => getSupabase().from(...args) };
const secret = process.env.JWT_SECRET || 'change-this-secret';

const json = (statusCode, body) => {
  return { statusCode, body: JSON.stringify(body) };
};

const bodyOf = (req) => req.body || {};

const numberFrom = value => {
  if (value == null) return null;
  const match = String(value).replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const parseStats = html => {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const get = label => {
    const match = text.match(new RegExp(`${label}\\s*[:|]?\\s*([+\\-]?\\d[\\d,.]*)(%|\\$)?`, 'i'));
    return match ? numberFrom(match[1]) : null;
  };
  return {
    gain: get('Gain'), daily: get('Daily'), monthly: get('Monthly'), yearly: get('Yearly'),
    drawdown: get('Drawdown'), balance: get('Balance'), equity: get('Equity'), profit: get('Profit'),
    pips: get('Pips'), trades: get('Trades'), profit_factor: get('Profit Factor')
  };
};

const syncAccount = async account => {
  const response = await fetch(account.myfxbook_url, { headers: { 'User-Agent': 'Mozilla/5.0 TrishulCapital/1.0' } });
  if (!response.ok) throw new Error(`Myfxbook HTTP ${response.status}`);
  const stats = parseStats(await response.text());
  const { error: snapshotError } = await supabase.from('snapshots').insert({ account_id: account.id, ...stats });
  if (snapshotError) throw snapshotError;
  const { error: accountError } = await supabase.from('accounts').update({ last_sync: new Date().toISOString() }).eq('id', account.id);
  if (accountError) throw accountError;
};

const authorized = (req) => {
  try {
    jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret);
    return true;
  } catch {
    return false;
  }
};

const performanceAccount = account => ({
  id: String(account.id),
  name: account.name,
  broker: account.broker_name || '',
  account_number: account.account_number || '',
  investor_password: account.investor_password || '',
  server: account.server || '',
  myfxbook_url: account.myfxbook_url || ''
});
const getPortfolio = async () => {
  const { data, error } = await supabase.from('portfolio_events').select('*').order('created_at', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return summarizePortfolio(data || []);
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const requestedRoute = typeof req.query?.route === 'string' ? req.query.route : '';
  const path = requestedRoute.startsWith('/api/admin/')
    ? requestedRoute
    : req.url.split('?')[0];
  const method = req.method;

  try {
    if (method === 'GET' && path === '/api/health') {
      return res.status(200).json({ ok: true, service: 'trishul-capital-api' });
    }

    if (method === 'POST' && path === '/api/admin/login') {
      return loginHandler(req, res);
    }

    if (method === 'GET' && path === '/api/performance-details') {
      const { data, error } = await supabase.from('accounts').select('*').eq('kind', 'performance').eq('active', true).order('id');
      if (error) throw error;
      return res.status(200).json({ accounts: data.map(performanceAccount) });
    }

    if (method === 'GET' && path === '/api/portfolio') {
      const portfolio = await getPortfolio();
      return res.status(200).json({ summary: portfolio.summary, monthly: summarizePortfolioMonths(portfolio.events) });
    }

    if (method === 'GET' && path === '/api/accounts') {
      const kind = req.query.kind || 'performance';
      const { data, error } = await supabase.from('accounts').select('*').eq('kind', kind).eq('active', true).order('id', { ascending: false });
      if (error) throw error;
      const accounts = await Promise.all(data.map(async account => {
        const { data: snapshots, error: snapshotError } = await supabase.from('snapshots').select('*').eq('account_id', account.id).order('captured_at', { ascending: false }).limit(1);
        if (snapshotError) throw snapshotError;
        return { ...account, stats: snapshots[0] || {} };
      }));
      return res.status(200).json({ accounts });
    }

    if (method === 'GET' && path === '/api/settings/contact') {
      const { data, error } = await supabase.from('settings').select('key,value').in('key', ['contact_email', 'contact_whatsapp', 'contact_telegram']);
      if (error) throw error;
      const values = Object.fromEntries(data.map(item => [item.key, item.value]));
      return res.status(200).json({ email: values.contact_email || '', whatsapp: values.contact_whatsapp || '', telegram: values.contact_telegram || '' });
    }

    if (method === 'GET' && path === '/api/settings/socials') {
      const { data, error } = await supabase.from('socials').select('*').eq('active', true).order('id');
      if (error) throw error;
      return res.status(200).json({ items: data });
    }

    if (!authorized(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (method === 'GET' && path === '/api/admin/accounts') {
      const { data, error } = await supabase.from('accounts').select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ accounts: data });
    }

    if (method === 'GET' && path === '/api/admin/performance-details') {
      const { data, error } = await supabase.from('accounts').select('*').eq('kind', 'performance').eq('active', true).order('id');
      if (error) throw error;
      return res.status(200).json({ accounts: data.map(performanceAccount) });
    }

    if (method === 'GET' && path === '/api/admin/portfolio') {
      return res.status(200).json(await getPortfolio());
    }

    if (method === 'GET' && path === '/api/admin/portfolio/clients') {
      const { data, error } = await supabase.from('portfolio_clients').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ clients: data || [] });
    }

    if (method === 'POST' && path === '/api/admin/portfolio/clients') {
      const input = bodyOf(req);
      const client = {
        client_id: String(input.client_id || '').trim().toUpperCase(),
        first_name: String(input.first_name || '').trim(),
        second_name: String(input.second_name || '').trim(),
        national_id: String(input.national_id || '').trim(),
        address_line1: String(input.address_line1 || '').trim(),
        address_line2: String(input.address_line2 || '').trim(),
        city: String(input.city || '').trim(), state: String(input.state || '').trim(),
        country: String(input.country || '').trim(), pincode: String(input.pincode || '').trim()
      };
      if (Object.entries(client).some(([field, value]) => field !== 'address_line2' && !value)) return res.status(400).json({ message: 'Complete all required client registration fields' });
      const { error } = await supabase.from('portfolio_clients').insert(client);
      if (error?.code === '23505') return res.status(409).json({ message: 'That Client ID is already registered' });
      if (error) throw error;
      const { data, error: listError } = await supabase.from('portfolio_clients').select('*').order('created_at', { ascending: false });
      if (listError) throw listError;
      return res.status(201).json({ clients: data || [] });
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/portfolio/clients/') && path.endsWith('/permanent')) {
      const clientId = decodeURIComponent(path.slice('/api/admin/portfolio/clients/'.length, -'/permanent'.length)).trim().toUpperCase();
      const { data: existing, error: existingError } = await supabase.from('portfolio_clients').select('deleted_at').eq('client_id', clientId).maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return res.status(404).json({ message: 'Registered client not found' });
      if (!existing.deleted_at) return res.status(409).json({ message: 'Remove the client first before permanent deletion' });
      const { data, error } = await supabase.from('portfolio_clients').delete().eq('client_id', clientId).select('client_id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Registered client not found' });
      const { data: clients, error: listError } = await supabase.from('portfolio_clients').select('*').order('created_at', { ascending: false });
      if (listError) throw listError;
      return res.status(200).json({ clients: clients || [], portfolio: await getPortfolio() });
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/portfolio/clients/')) {
      const clientId = decodeURIComponent(path.slice('/api/admin/portfolio/clients/'.length)).trim().toUpperCase();
      const { data, error } = await supabase.from('portfolio_clients').update({ deleted_at: new Date().toISOString() }).eq('client_id', clientId).is('deleted_at', null).select('client_id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Active registered client not found' });
      const { data: clients, error: listError } = await supabase.from('portfolio_clients').select('*').order('created_at', { ascending: false });
      if (listError) throw listError;
      return res.status(200).json({ clients: clients || [] });
    }

    if (method === 'GET' && path === '/api/admin/portfolio/export') {
      const { data, error } = await supabase.from('portfolio_events').select('*').order('created_at');
      if (error) throw error;
      let events;
      try { events = filterPortfolioEventsByDate(data || [], req.query.from || '', req.query.to || ''); } catch (filterError) { return res.status(400).json({ message: filterError.message }); }
      const workbook = await buildPortfolioWorkbook(events);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="portfolio-ledger.xlsx"');
      return res.status(200).send(Buffer.from(workbook));
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/portfolio/event/') && path.endsWith('/permanent')) {
      const eventId = path.slice('/api/admin/portfolio/event/'.length, -'/permanent'.length);
      if (!/^\d+$/.test(eventId)) return res.status(400).json({ message: 'Invalid portfolio event ID' });
      const { data: existing, error: existingError } = await supabase.from('portfolio_events').select('deleted_at').eq('id', eventId).maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return res.status(404).json({ message: 'Portfolio entry not found' });
      if (!existing.deleted_at) return res.status(409).json({ message: 'Delete the entry first before permanent deletion' });
      const { data, error } = await supabase.from('portfolio_events').delete().eq('id', eventId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Portfolio entry not found' });
      return res.status(200).json(await getPortfolio());
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/portfolio/event/')) {
      const eventId = path.slice('/api/admin/portfolio/event/'.length);
      if (!/^\d+$/.test(eventId)) return res.status(400).json({ message: 'Invalid portfolio event ID' });
      const { data, error } = await supabase.from('portfolio_events').update({ deleted_at: new Date().toISOString() }).eq('id', eventId).is('deleted_at', null).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Active portfolio entry not found' });
      return res.status(200).json(await getPortfolio());
    }

    if (method === 'POST' && path === '/api/admin/portfolio') {
      const input = bodyOf(req);
      const type = input.type;
      const clientId = String(input.client_id || '').trim().toUpperCase();
      const accountNumber = String(input.account_number || '').trim();
      const amount = Number(input.amount);
      const createdAt = input.created_at ? new Date(input.created_at) : new Date();
      if (!['onboarded', 'profit_withdrawn'].includes(type)) return res.status(400).json({ message: 'Choose onboarding or profit withdrawal' });
      if (!clientId || !accountNumber) return res.status(400).json({ message: 'Client ID and account number are required' });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Enter an amount greater than zero' });
      if (Number.isNaN(createdAt.getTime())) return res.status(400).json({ message: 'Enter a valid date and time' });

      const { data: client, error: clientError } = await supabase.from('portfolio_clients').select('*').eq('client_id', clientId).is('deleted_at', null).maybeSingle();
      if (clientError) throw clientError;
      if (!client) return res.status(404).json({ message: 'Register this client before adding a portfolio entry' });

      const portfolio = await getPortfolio();
      const active = portfolio.active_accounts.find(account => account.account_number === accountNumber);
      if (active && active.client_id !== clientId) return res.status(409).json({ message: 'This account number belongs to a different Client ID' });
      if (type === 'profit_withdrawn' && !active) return res.status(400).json({ message: 'Profit withdrawals require an active account' });
      const { error } = await supabase.from('portfolio_events').insert({
        event_type: type === 'onboarded' && active ? 'funds_added' : type,
        client_id: clientId,
        client_name: `${client.first_name} ${client.second_name}`.trim(),
        account_number: accountNumber,
        amount,
        created_at: createdAt.toISOString()
      });
      if (error) throw error;
      return res.status(201).json(await getPortfolio());
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/portfolio/')) {
      const accountNumber = decodeURIComponent(path.slice('/api/admin/portfolio/'.length)).trim();
      const active = (await getPortfolio()).active_accounts.find(account => account.account_number === accountNumber);
      if (!active) return res.status(404).json({ message: 'Active portfolio account not found' });
      const { error } = await supabase.from('portfolio_events').insert({
        event_type: 'offboarded',
        client_id: active.client_id,
        client_name: active.client_name,
        account_number: active.account_number,
        amount: active.funds_managed
      });
      if (error) throw error;
      return res.status(200).json(await getPortfolio());
    }

    if (method === 'PUT' && path === '/api/admin/performance-details') {
      const accounts = bodyOf(req).accounts;
      if (!Array.isArray(accounts)) return res.status(400).json({ message: 'Performance accounts must be a list' });

      const { data: current, error: currentError } = await supabase.from('accounts').select('*').eq('kind', 'performance');
      if (currentError) throw currentError;
      const currentById = new Map(current.map(account => [String(account.id), account]));
      const seenIds = new Set();
      const seenNames = new Set();
      const existingRecords = [];
      const newRecords = [];

      for (const account of accounts) {
        const id = String(account?.id || '');
        if (!id || seenIds.has(id)) return res.status(400).json({ message: 'Each performance account must have a unique ID' });
        seenIds.add(id);
        if (typeof account.name !== 'string' || !account.name.trim()) return res.status(400).json({ message: 'EA display name is required' });
        const name = account.name.trim();
        if (seenNames.has(name.toLowerCase())) return res.status(400).json({ message: 'EA display names must be unique' });
        seenNames.add(name.toLowerCase());
        for (const field of ['broker', 'account_number', 'investor_password', 'server', 'myfxbook_url']) {
          if (typeof account[field] !== 'string' || !account[field].trim()) return res.status(400).json({ message: `${name}: ${field.replace(/_/g, ' ')} is required` });
        }
        let url;
        try { url = new URL(account.myfxbook_url.trim()); } catch { return res.status(400).json({ message: `${name}: enter a valid Myfxbook URL` }); }
        if (url.protocol !== 'https:' || url.hostname !== 'www.myfxbook.com') return res.status(400).json({ message: `${name}: Myfxbook URL must use https://www.myfxbook.com` });

        const existing = currentById.get(id);
        const record = {
          ...(existing ? { id: existing.id } : {}),
          kind: 'performance',
          name,
          package_name: name,
          broker_name: account.broker.trim(),
          account_number: account.account_number.trim(),
          investor_password: account.investor_password.trim(),
          server: account.server.trim(),
          myfxbook_url: account.myfxbook_url.trim(),
          active: true
        };
        (existing ? existingRecords : newRecords).push(record);
      }

      let saved = [];
      if (existingRecords.length) {
        const { data, error } = await supabase.from('accounts').upsert(existingRecords).select('*');
        if (error) throw error;
        saved = data;
      }
      if (newRecords.length) {
        const { data, error } = await supabase.from('accounts').insert(newRecords).select('*');
        if (error) throw error;
        saved = [...saved, ...data];
      }
      const removedIds = current.filter(account => !seenIds.has(String(account.id))).map(account => account.id);
      if (removedIds.length) {
        const { error } = await supabase.from('accounts').update({ active: false }).in('id', removedIds);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true, accounts: saved.map(performanceAccount) });
    }

    if (method === 'POST' && path === '/api/admin/accounts') {
      const input = bodyOf(req);
      if (!input.name || !input.myfxbook_url) {
        return res.status(400).json({ message: 'Name and Myfxbook URL are required' });
      }
      const { data, error } = await supabase.from('accounts').insert({ kind: input.kind || 'client', name: input.name, package_name: input.package_name || '', myfxbook_url: input.myfxbook_url }).select('id').single();
      if (error) throw error;
      return res.status(200).json({ ok: true, id: data.id });
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/accounts/')) {
      const id = path.split('/').pop();
      const { error } = await supabase.from('accounts').update({ active: false }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (method === 'POST' && path === '/api/admin/sync') {
      const { data: accounts, error } = await supabase.from('accounts').select('*').eq('active', true);
      if (error) throw error;
      const results = await Promise.allSettled(accounts.map(syncAccount));
      const failed = results.filter(result => result.status === 'rejected').length;
      return res.status(200).json({ ok: failed === 0, synced: results.length - failed, failed });
    }

    if (method === 'GET' && path === '/api/admin/socials') {
      const { data, error } = await supabase.from('socials').select('*').order('id');
      if (error) throw error;
      return res.status(200).json({ items: data });
    }

    if (method === 'POST' && path === '/api/admin/socials') {
      const input = bodyOf(req);
      const { error } = await supabase.from('socials').insert({ platform: input.platform, url: input.url || '' });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (method === 'PUT' && path === '/api/admin/settings') {
      const input = bodyOf(req);
      const { error } = await supabase.from('settings').upsert({ key: input.key, value: input.value || '' });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (method === 'GET' && path === '/api/admin/pages') {
      const { data, error } = await supabase.from('pages').select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ pages: data });
    }

    if (method === 'POST' && path === '/api/admin/pages') {
      const input = bodyOf(req);
      const { error } = await supabase.from('pages').insert({ slug: input.slug, title: input.title, body: input.body });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ message: 'Not found' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message?.includes('SUPABASE_') ? error.message : 'Server error' });
  }
}
