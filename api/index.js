import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import loginHandler from './login-handler.js';
import { summarizePortfolio, summarizePortfolioMonths, buildPortfolioWorkbook, filterPortfolioEventsByDate } from '../portfolio.js';
import { buildServerBillingSchedule, createBillingInvoice, createBillingPdf, formatBillingInvoiceNumber, getBillingPeriodDates, getDefaultBillingSettings, normalizeBillingSettings, normalizeInvoicePaymentDetails } from '../billing.js';
import { getMarketQuotes } from '../server/market-quotes.js';

let supabaseClient;
const getSupabase = () => {
  if (!supabaseClient) {
    if (!process.env.SUPABASE_URL || !/^https?:\/\//.test(process.env.SUPABASE_URL)) throw new Error('SUPABASE_URL must be a valid https:// URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
};
const supabase = { from: (...args) => getSupabase().from(...args), rpc: (...args) => getSupabase().rpc(...args) };
const secret = process.env.JWT_SECRET || 'change-this-secret';

const json = (statusCode, body) => {
  return { statusCode, body: JSON.stringify(body) };
};

const bodyOf = (req) => req.body || {};
const founderImageKey = 'about_founder_image';
const maxFounderImageBytes = 3 * 1024 * 1024;
const contactCardProfileDefaults = {
  title: 'Trishul Capital',
  subtitle: 'Account Management & Expert Advisor Services',
  tagline: 'AUTOMATED · SYSTEMATIC · TRANSPARENT',
  logo: '/images/trident.png'
};
const contactButtonIcons = new Set(['🌐', '◎', '➤', '✉', '☎', 'f', '▶', 'in', '✦']);
const maxContactButtonIconBytes = 512 * 1024;
const founderImageTypes = {
  'image/jpeg': buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
};
const isValidContactButtonIcon = icon => {
  if (typeof icon !== 'string') return false;
  if (contactButtonIcons.has(icon)) return true;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(icon);
  if (!match) return false;
  const buffer = Buffer.from(match[2], 'base64');
  return buffer.length > 0 && buffer.length <= maxContactButtonIconBytes
    && buffer.toString('base64') === match[2] && founderImageTypes[match[1]](buffer);
};
const validateContactButton = input => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  if (!name || name.length > 48) return { error: 'Button name must be between 1 and 48 characters' };
  if (!url || url.length > 2048 || /[\u0000-\u001f]/.test(url)) return { error: 'Enter a valid hyperlink' };
  const relativeUrl = url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
  const absoluteUrl = /^(https?:\/\/|mailto:|tel:)/i.test(url);
  if (!relativeUrl && !absoluteUrl) return { error: 'Use an https, http, mailto, tel, or same-site path URL' };
  if (/^https?:\/\//i.test(url)) {
    try { new URL(url); } catch { return { error: 'Enter a valid hyperlink' }; }
  }
  if (!isValidContactButtonIcon(input.icon)) return { error: 'Choose a listed icon or upload a valid PNG, JPEG, or WebP icon (512 KB maximum)' };
  return { value: { name, url, icon: input.icon } };
};
const DEFAULT_PORTFOLIO_MESSAGE_TEMPLATES = {
  onboarded: 'Hello {{client_name}},\n\nWelcome to Trishul Capital. Your account has been onboarded successfully.\n\nClient ID: {{client_id}}\nAccount number: {{account_number}}\nFunds recorded: {{amount}}\nDate: {{date}}\n\nPlease contact us if you have any questions.\n\n— Trishul Capital',
  offboarded: 'Hello {{client_name}},\n\nYour account has been offboarded from our active portfolio records.\n\nClient ID: {{client_id}}\nAccount number: {{account_number}}\nFunds withdrawn: {{amount}}\nDate: {{date}}\n\nThank you for being with Trishul Capital.\n\n— Trishul Capital',
  profit_withdrawn: 'Hello {{client_name}},\n\nYour profit withdrawal has been recorded successfully.\n\nClient ID: {{client_id}}\nAccount number: {{account_number}}\nProfit withdrawn: {{amount}}\nDate: {{date}}\n\nPlease contact us if you have any questions.\n\n— Trishul Capital'
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
const getBillingSettings = async () => {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'billing_invoice_settings').maybeSingle();
  if (error) throw error;
  return normalizeBillingSettings(data ? JSON.parse(data.value) : getDefaultBillingSettings());
};
const nextBillingInvoiceNumber = async issueDate => {
  const [year, month] = issueDate.slice(0, 7).split('-').map(Number);
  const { data: sequence, error } = await supabase.rpc('next_billing_invoice_sequence', {
    p_issue_year: year,
    p_issue_month: month
  });
  if (error) throw error;
  return formatBillingInvoiceNumber(year, month, Number(sequence));
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const requestedRoute = typeof req.query?.route === 'string' ? req.query.route : '';
  const path = requestedRoute.startsWith('/api/')
    ? requestedRoute
    : req.url.split('?')[0];
  const method = req.method;

  try {
    if (method === 'GET' && path === '/api/health') {
      return res.status(200).json({ ok: true, service: 'trishul-capital-api' });
    }

    if (method === 'GET' && path === '/api/market-quotes') {
      const quotes = await getMarketQuotes();
      return res.status(200).json(quotes);
    }

    if (method === 'GET' && path === '/api/about/founder-image') {
      const { data, error } = await supabase.from('settings').select('value').eq('key', founderImageKey).maybeSingle();
      if (error) throw error;
      if (!data?.value) return res.status(404).json({ message: 'No founder image has been uploaded' });
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.value);
      if (!match) return res.status(500).json({ message: 'The saved founder image is invalid' });
      const buffer = Buffer.from(match[2], 'base64');
      if (!founderImageTypes[match[1]](buffer)) return res.status(500).json({ message: 'The saved founder image is invalid' });
      res.setHeader('Content-Type', match[1]);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buffer);
    }

    if (method === 'POST' && path === '/api/admin/login') {
      return loginHandler(req, res);
    }

    if (path.startsWith('/api/admin/billing/')) {
      if (!authorized(req)) return res.status(401).json({ message: 'Unauthorized' });

      if (method === 'GET' && path === '/api/admin/billing/settings') {
        return res.status(200).json({ settings: await getBillingSettings() });
      }

      if (method === 'PUT' && path === '/api/admin/billing/settings') {
        let settings;
        try { settings = normalizeBillingSettings(bodyOf(req).settings); } catch (error) {
          return res.status(400).json({ message: error.message });
        }
        const { error } = await supabase.from('settings').upsert({
          key: 'billing_invoice_settings',
          value: JSON.stringify(settings)
        }, { onConflict: 'key' });
        if (error) throw error;
        return res.status(200).json({ settings });
      }

      if (method === 'GET' && path === '/api/admin/billing/overview') {
        const settings = await getBillingSettings();
        const [portfolio, invoiceResult, clientResult] = await Promise.all([
          getPortfolio(),
          supabase.from('billing_invoices')
            .select('id,client_id,client_name,account_number,billing_type,deleted_at,server_billing_due_date,invoice_number,payment_status,custom_line_items,server_maintenance_usd,server_maintenance_amount')
            .eq('billing_type', 'server_fee').is('deleted_at', null),
          supabase.from('portfolio_clients').select('client_id,first_name,second_name,email,whatsapp_number,deleted_at').is('deleted_at', null)
        ]);
        if (invoiceResult.error) throw invoiceResult.error;
        if (clientResult.error) throw clientResult.error;
        const cycles = buildServerBillingSchedule({
          events: portfolio.events,
          activeAccounts: portfolio.active_accounts,
          invoices: invoiceResult.data || [],
          clients: clientResult.data || [],
          settings,
          today: new Date().toISOString().slice(0, 10)
        });
        return res.status(200).json({ settings, cycles, portfolio });
      }

      if (method === 'GET' && path === '/api/admin/billing/invoices') {
        const { data, error } = await supabase.from('billing_invoices')
          .select('id,invoice_number,client_id,account_number,billing_type,client_name,client_email,client_phone,due_date,period_type,period_start,period_end,amount,payment_status,paid_at,payment_method,payment_gateway,payment_upi_id,payment_reference,profit_share_amount,server_maintenance_usd,server_maintenance_amount,custom_line_items,created_at')
          .is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
        if (error) throw error;
        return res.status(200).json({ invoices: data || [] });
      }

      if (method === 'GET' && path === '/api/admin/billing/audit') {
        const { data, error } = await supabase.from('billing_invoices')
          .select('id,invoice_number,client_id,account_number,billing_type,client_name,client_email,client_phone,due_date,period_type,period_start,period_end,amount,payment_status,paid_at,payment_method,payment_gateway,payment_upi_id,payment_reference,profit_share_amount,server_maintenance_usd,server_maintenance_amount,custom_line_items,created_at')
          .is('deleted_at', null).order('payment_status').order('due_date').order('id').limit(500);
        if (error) throw error;
        return res.status(200).json({ invoices: data || [] });
      }

      if (method === 'GET' && path === '/api/admin/billing/deleted-invoices') {
        const { data, error } = await supabase.from('billing_invoices').select('*')
          .not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ invoices: data || [] });
      }

      if (method === 'POST' && path === '/api/admin/billing/invoices') {
        const input = bodyOf(req);
        const issueDate = new Date().toISOString().slice(0, 10);
        const clientId = String(input.client_id || '').trim().toUpperCase();
        const { data: client, error: clientError } = await supabase.from('portfolio_clients').select('*')
          .eq('client_id', clientId).is('deleted_at', null).maybeSingle();
        if (clientError) throw clientError;
        if (!client) return res.status(404).json({ message: 'Choose an active registered client before creating an invoice.' });
        const accountNumber = String(input.account_number || '').trim();
        if (!accountNumber) return res.status(400).json({ message: 'Choose an account number for this invoice.' });
        const { data: registeredAccount, error: accountError } = await supabase.from('portfolio_events').select('id')
          .eq('client_id', clientId).eq('account_number', accountNumber).is('deleted_at', null).limit(1).maybeSingle();
        if (accountError) throw accountError;
        if (!registeredAccount) return res.status(404).json({ message: 'Choose an account number linked to this registered client in Portfolio.' });

        const scheduledDueDate = String(input.server_billing_due_date || '').trim()
          || (input.period_type === 'onboard' ? issueDate : '');
        let monthInvoices = [];
        if (scheduledDueDate && input.period_type !== 'onboard') {
          const parsedDueDate = new Date(`${scheduledDueDate}T00:00:00.000Z`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDueDate) || Number.isNaN(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== scheduledDueDate) {
            return res.status(400).json({ message: 'Choose a valid server billing due date.' });
          }
          const [portfolio, invoiceResult] = await Promise.all([
            getPortfolio(),
            supabase.from('billing_invoices').select('*').eq('billing_type', 'server_fee').is('deleted_at', null)
          ]);
          if (invoiceResult.error) throw invoiceResult.error;
          const cycle = buildServerBillingSchedule({
            events: portfolio.events,
            activeAccounts: portfolio.active_accounts,
            invoices: invoiceResult.data || [],
            clients: [client],
            settings: {},
            today: new Date().toISOString().slice(0, 10)
          }).find(item => item.client_id === clientId && item.due_date === scheduledDueDate && item.account_numbers.includes(accountNumber));
          if (!cycle) return res.status(400).json({ message: 'This account does not have an enabled server billing cycle for that due date.' });
          if (cycle.invoice_id) return res.status(409).json({ message: 'An invoice already exists for this account and server billing cycle.' });
        }

        let period;
        try { period = getBillingPeriodDates(input); } catch (error) {
          return res.status(400).json({ message: error.message });
        }
        if (!scheduledDueDate && input.period_type !== 'onboard') {
          const monthStart = `${period.periodStart.slice(0, 7)}-01`;
          const monthEndDay = new Date(Date.UTC(Number(period.periodStart.slice(0, 4)), Number(period.periodStart.slice(5, 7)), 0)).getUTCDate();
          const monthEnd = `${period.periodStart.slice(0, 7)}-${String(monthEndDay).padStart(2, '0')}`;
          const { data, error: periodError } = await supabase.from('billing_invoices')
            .select('period_type,period_start,server_maintenance_usd')
            .eq('client_id', clientId).eq('billing_type', 'standard').is('deleted_at', null)
            .gte('period_start', monthStart).lte('period_start', monthEnd);
          if (periodError) throw periodError;
          monthInvoices = data || [];
        }

        const settings = await getBillingSettings();
        const [issueYear, issueMonth] = issueDate.slice(0, 7).split('-').map(Number);
        let invoice;
        try {
          invoice = createBillingInvoice(
            client,
            { ...input, server_billing_due_date: scheduledDueDate || null },
            !scheduledDueDate && monthInvoices.some(item => Number(item.server_maintenance_usd) > 0),
            settings,
            formatBillingInvoiceNumber(issueYear, issueMonth, 1),
            issueDate
          );
        } catch (error) {
          return res.status(400).json({ message: error.message });
        }
        invoice.invoice_number = await nextBillingInvoiceNumber(issueDate);
        const { data, error } = await supabase.from('billing_invoices').insert(invoice).select('*').single();
        if (error?.code === '23505') {
          return res.status(409).json({
            message: scheduledDueDate
              ? 'An invoice already exists for this account and server billing cycle.'
              : 'An invoice with this number already exists.'
          });
        }
        if (error) throw error;
        return res.status(201).json({ invoice: data });
      }

      if (method === 'POST' && path === '/api/admin/billing/server-invoices') {
        return res.status(410).json({ message: 'Server-fee invoices are now created manually from the invoice form.' });
      }

      const pdfMatch = /^\/api\/admin\/billing\/invoices\/(\d+)\/pdf$/.exec(path);
      if (method === 'GET' && pdfMatch) {
        const { data: invoice, error } = await supabase.from('billing_invoices').select('*')
          .eq('id', Number(pdfMatch[1])).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        const pdf = await createBillingPdf(invoice);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
        return res.status(200).send(pdf);
      }

      const paidMatch = /^\/api\/admin\/billing\/invoices\/(\d+)\/paid$/.exec(path);
      if (method === 'POST' && paidMatch) {
        const id = Number(paidMatch[1]);
        const { data: invoice, error } = await supabase.from('billing_invoices').select('id,invoice_number,payment_status')
          .eq('id', id).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        if (invoice.payment_status === 'paid') return res.status(409).json({ message: 'This invoice is already marked as paid.' });
        let paymentDetails;
        try { paymentDetails = normalizeInvoicePaymentDetails(bodyOf(req)); } catch (validationError) {
          return res.status(400).json({ message: validationError.message });
        }
        const { data, error: updateError } = await supabase.from('billing_invoices')
          .update({ ...paymentDetails, payment_status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', id).eq('payment_status', 'pending').is('deleted_at', null)
          .select('id,invoice_number,payment_status,paid_at,payment_method,payment_gateway,payment_upi_id,payment_reference').maybeSingle();
        if (updateError) throw updateError;
        if (!data) return res.status(409).json({ message: 'This invoice was already updated. Refresh and try again.' });
        return res.status(200).json({ invoice: data });
      }

      const paymentDetailsMatch = /^\/api\/admin\/billing\/invoices\/(\d+)\/payment-details$/.exec(path);
      if (method === 'PUT' && paymentDetailsMatch) {
        const id = Number(paymentDetailsMatch[1]);
        const { data: invoice, error } = await supabase.from('billing_invoices')
          .select('id,payment_status').eq('id', id).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
        if (invoice.payment_status !== 'paid') return res.status(409).json({ message: 'Only paid invoices can have their payment details edited.' });
        let paymentDetails;
        try { paymentDetails = normalizeInvoicePaymentDetails(bodyOf(req)); } catch (validationError) {
          return res.status(400).json({ message: validationError.message });
        }
        const { data, error: updateError } = await supabase.from('billing_invoices')
          .update(paymentDetails).eq('id', id).eq('payment_status', 'paid').is('deleted_at', null)
          .select('id,invoice_number,payment_status,paid_at,payment_method,payment_gateway,payment_upi_id,payment_reference').maybeSingle();
        if (updateError) throw updateError;
        if (!data) return res.status(409).json({ message: 'This invoice changed while you were editing it. Refresh and try again.' });
        return res.status(200).json({ invoice: data });
      }

      const permanentMatch = /^\/api\/admin\/billing\/invoices\/(\d+)\/permanent$/.exec(path);
      if (method === 'DELETE' && permanentMatch) {
        const id = Number(permanentMatch[1]);
        const { data: existing, error: existingError } = await supabase.from('billing_invoices')
          .select('deleted_at').eq('id', id).maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return res.status(404).json({ message: 'Invoice not found.' });
        if (!existing.deleted_at) return res.status(409).json({ message: 'Delete the invoice first before permanent deletion.' });
        const { data, error } = await supabase.rpc('permanently_delete_billing_invoice', { p_invoice_id: id });
        if (error) throw error;
        if (!data) return res.status(404).json({ message: 'Invoice not found.' });
        return res.status(200).json({ ok: true });
      }

      const invoiceMatch = /^\/api\/admin\/billing\/invoices\/(\d+)$/.exec(path);
      if (method === 'DELETE' && invoiceMatch) {
        const { data, error } = await supabase.from('billing_invoices')
          .update({ deleted_at: new Date().toISOString() }).eq('id', Number(invoiceMatch[1])).is('deleted_at', null)
          .select('id').maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ message: 'Active invoice not found.' });
        return res.status(200).json({ ok: true });
      }

      return res.status(404).json({ message: 'Billing endpoint not found.' });
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

    if (method === 'GET' && path === '/api/contact-card/profile') {
      const keys = Object.keys(contactCardProfileDefaults).map(field => `contact_card_${field}`);
      const { data, error } = await supabase.from('settings').select('key,value').in('key', keys);
      if (error) throw error;
      const values = Object.fromEntries((data || []).map(item => [item.key, item.value]));
      const profile = Object.fromEntries(Object.entries(contactCardProfileDefaults).map(([field, fallback]) => [
        field, values[`contact_card_${field}`] ?? fallback
      ]));
      return res.status(200).json(profile);
    }

    if (method === 'GET' && path === '/api/contact-buttons') {
      const { data, error } = await supabase.from('contact_buttons').select('id,name,url,icon').order('position').order('id');
      if (error) throw error;
      return res.status(200).json({ items: data || [] });
    }

    if (!authorized(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (method === 'GET' && path === '/api/admin/contact-card/profile') {
      const keys = Object.keys(contactCardProfileDefaults).map(field => `contact_card_${field}`);
      const { data, error } = await supabase.from('settings').select('key,value').in('key', keys);
      if (error) throw error;
      const values = Object.fromEntries((data || []).map(item => [item.key, item.value]));
      const profile = Object.fromEntries(Object.entries(contactCardProfileDefaults).map(([field, fallback]) => [
        field, values[`contact_card_${field}`] ?? fallback
      ]));
      return res.status(200).json(profile);
    }

    if (method === 'PUT' && path === '/api/admin/contact-card/profile') {
      const input = bodyOf(req);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const subtitle = typeof input.subtitle === 'string' ? input.subtitle.trim() : '';
      const tagline = typeof input.tagline === 'string' ? input.tagline.trim() : '';
      const logo = input.logo;
      if (!title || title.length > 80) return res.status(400).json({ message: 'Title must be between 1 and 80 characters' });
      if (subtitle.length > 160) return res.status(400).json({ message: 'Subtitle must be 160 characters or fewer' });
      if (tagline.length > 100) return res.status(400).json({ message: 'Tagline must be 100 characters or fewer' });
      let validLogo = logo === contactCardProfileDefaults.logo;
      if (typeof logo === 'string') {
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
        if (match) {
          const buffer = Buffer.from(match[2], 'base64');
          validLogo = buffer.length > 0 && buffer.length <= maxFounderImageBytes
            && buffer.toString('base64') === match[2] && founderImageTypes[match[1]](buffer);
        }
      }
      if (!validLogo) return res.status(400).json({ message: 'Upload a valid JPEG, PNG, or WebP logo (3 MB maximum)' });
      const { error } = await supabase.from('settings').upsert([
        { key: 'contact_card_title', value: title },
        { key: 'contact_card_subtitle', value: subtitle },
        { key: 'contact_card_tagline', value: tagline },
        { key: 'contact_card_logo', value: logo }
      ]);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (method === 'GET' && path === '/api/admin/contact-buttons') {
      const { data, error } = await supabase.from('contact_buttons').select('id,name,url,icon,position').order('position').order('id');
      if (error) throw error;
      return res.status(200).json({ items: data || [] });
    }

    if (method === 'POST' && path === '/api/admin/contact-buttons') {
      const checked = validateContactButton(bodyOf(req));
      if (checked.error) return res.status(400).json({ message: checked.error });
      const { data: last, error: positionError } = await supabase.from('contact_buttons').select('position').order('position', { ascending: false }).limit(1).maybeSingle();
      if (positionError) throw positionError;
      const position = Number.isInteger(last?.position) ? last.position + 1 : 0;
      const { data, error } = await supabase.from('contact_buttons').insert({ ...checked.value, position }).select('id').single();
      if (error) throw error;
      return res.status(201).json({ ok: true, id: data.id });
    }

    if (method === 'PUT' && path.startsWith('/api/admin/contact-buttons/')) {
      const id = path.slice('/api/admin/contact-buttons/'.length);
      if (!/^\d+$/.test(id) || Number(id) < 1) return res.status(400).json({ message: 'Invalid contact button id' });
      const checked = validateContactButton(bodyOf(req));
      if (checked.error) return res.status(400).json({ message: checked.error });
      const { data, error } = await supabase.from('contact_buttons').update(checked.value).eq('id', id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Contact button not found' });
      return res.status(200).json({ ok: true });
    }

    if (method === 'DELETE' && path.startsWith('/api/admin/contact-buttons/')) {
      const id = path.slice('/api/admin/contact-buttons/'.length);
      if (!/^\d+$/.test(id) || Number(id) < 1) return res.status(400).json({ message: 'Invalid contact button id' });
      const { data, error } = await supabase.from('contact_buttons').delete().eq('id', id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Contact button not found' });
      return res.status(200).json({ ok: true });
    }

    if (method === 'PUT' && path === '/api/admin/about/founder-image') {
      const image = bodyOf(req).image;
      const match = typeof image === 'string' && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
      if (!match) return res.status(400).json({ message: 'Upload a valid JPEG, PNG, or WebP image' });
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > maxFounderImageBytes) {
        return res.status(400).json({ message: 'Founder images must be 3 MB or smaller' });
      }
      if (buffer.toString('base64') !== match[2] || !founderImageTypes[match[1]](buffer)) {
        return res.status(400).json({ message: 'The uploaded file is not a valid JPEG, PNG, or WebP image' });
      }
      const { error } = await supabase.from('settings').upsert({ key: founderImageKey, value: image });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (method === 'DELETE' && path === '/api/admin/about/founder-image') {
      const { error } = await supabase.from('settings').delete().eq('key', founderImageKey);
      if (error) throw error;
      return res.status(200).json({ ok: true });
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

    if (method === 'GET' && path === '/api/admin/message-templates') {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'portfolio_message_templates').maybeSingle();
      if (error) throw error;
      if (!data?.value) return res.status(200).json({ templates: DEFAULT_PORTFOLIO_MESSAGE_TEMPLATES });
      let templates;
      try {
        templates = JSON.parse(data.value);
      } catch {
        throw new Error('Saved portfolio message templates are not valid JSON. Re-save the templates from the admin page.');
      }
      const validTemplates = Object.fromEntries(Object.keys(DEFAULT_PORTFOLIO_MESSAGE_TEMPLATES).map(key => [key, typeof templates?.[key] === 'string' ? templates[key] : DEFAULT_PORTFOLIO_MESSAGE_TEMPLATES[key]]));
      return res.status(200).json({ templates: validTemplates });
    }

    if (method === 'PUT' && path === '/api/admin/message-templates') {
      const templates = bodyOf(req).templates;
      if (!templates || typeof templates !== 'object' || Array.isArray(templates)) {
        return res.status(400).json({ message: 'Provide onboarded, offboarded, and profit_withdrawn message templates.' });
      }
      for (const key of Object.keys(DEFAULT_PORTFOLIO_MESSAGE_TEMPLATES)) {
        if (typeof templates[key] !== 'string' || !templates[key].trim()) {
          return res.status(400).json({ message: `The ${key.replace(/_/g, ' ')} message cannot be empty.` });
        }
        if (templates[key].length > 5000) {
          return res.status(400).json({ message: `The ${key.replace(/_/g, ' ')} message must be 5,000 characters or fewer.` });
        }
      }
      const { error } = await supabase.from('settings').upsert({ key: 'portfolio_message_templates', value: JSON.stringify(templates) });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (method === 'GET' && path === '/api/admin/portfolio/clients') {
      const { data, error } = await supabase.from('portfolio_clients').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ clients: data || [] });
    }

    if (method === 'PUT' && path.startsWith('/api/admin/portfolio/clients/')) {
      const clientId = decodeURIComponent(path.slice('/api/admin/portfolio/clients/'.length)).trim().toUpperCase();
      const input = bodyOf(req);
      const client = {
        first_name: String(input.first_name || '').trim(),
        second_name: String(input.second_name || '').trim(),
        email: String(input.email || '').trim().toLowerCase(),
        whatsapp_number: String(input.whatsapp_number || '').trim(),
        national_id: String(input.national_id || '').trim(),
        address_line1: String(input.address_line1 || '').trim(),
        address_line2: String(input.address_line2 || '').trim(),
        city: String(input.city || '').trim(),
        state: String(input.state || '').trim(),
        country: String(input.country || '').trim(),
        pincode: String(input.pincode || '').trim()
      };
      if (!clientId) return res.status(400).json({ message: 'Client ID is required' });
      if (Object.entries(client).some(([field, value]) => !['address_line2', 'email', 'whatsapp_number'].includes(field) && !value)) return res.status(400).json({ message: 'Complete all required client information fields' });
      if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) return res.status(400).json({ message: 'Enter a valid client email address or leave it blank' });
      if (client.whatsapp_number && !/^\+[1-9]\d{7,14}$/.test(client.whatsapp_number)) return res.status(400).json({ message: 'Enter the WhatsApp number in international format, e.g. +14155552671, or leave it blank' });
      const { data, error } = await supabase.from('portfolio_clients').update(client).eq('client_id', clientId).select('*').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: 'Registered client not found' });
      return res.status(200).json({ client: data });
    }

    if (method === 'POST' && path === '/api/admin/portfolio/clients') {
      const input = bodyOf(req);
      const client = {
        client_id: String(input.client_id || '').trim().toUpperCase(),
        first_name: String(input.first_name || '').trim(),
        second_name: String(input.second_name || '').trim(),
        email: String(input.email || '').trim().toLowerCase(),
        whatsapp_number: String(input.whatsapp_number || '').trim(),
        national_id: String(input.national_id || '').trim(),
        address_line1: String(input.address_line1 || '').trim(),
        address_line2: String(input.address_line2 || '').trim(),
        city: String(input.city || '').trim(), state: String(input.state || '').trim(),
        country: String(input.country || '').trim(), pincode: String(input.pincode || '').trim()
      };
      if (Object.entries(client).some(([field, value]) => field !== 'address_line2' && !value)) return res.status(400).json({ message: 'Complete all required client registration fields' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) return res.status(400).json({ message: 'Enter a valid client email address' });
      if (!/^\+[1-9]\d{7,14}$/.test(client.whatsapp_number)) return res.status(400).json({ message: 'Enter the WhatsApp number in international format, e.g. +14155552671' });
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

    if (method === 'PUT' && path === '/api/admin/portfolio/account') {
      const input = bodyOf(req);
      const clientId = String(input.client_id || '').trim().toUpperCase();
      const accountNumber = String(input.account_number || '').trim();
      const newAccountNumber = String(input.new_account_number || '').trim();
      const onboardedDate = String(input.onboarded_date || '').trim();
      if (!clientId || !accountNumber || !newAccountNumber || accountNumber.length > 100 || newAccountNumber.length > 100) {
        return res.status(400).json({ message: 'Client ID and valid old and new account numbers are required.' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(onboardedDate)
        || Number.isNaN(new Date(`${onboardedDate}T00:00:00.000Z`).getTime())
        || new Date(`${onboardedDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== onboardedDate) {
        return res.status(400).json({ message: 'Enter a valid account onboarded date.' });
      }
      if (typeof input.server_billing_enabled !== 'boolean') {
        return res.status(400).json({ message: 'Choose whether monthly server billing is enabled.' });
      }
      const portfolio = await getPortfolio();
      const active = portfolio.active_accounts.find(account => account.client_id === clientId && account.account_number === accountNumber);
      if (!active) return res.status(404).json({ message: 'Active account not found.' });
      if (portfolio.active_accounts.some(account => account.account_number === newAccountNumber
        && !(account.client_id === clientId && account.account_number === accountNumber))) {
        return res.status(409).json({ message: 'This account number is already assigned to another active account.' });
      }
      const { data: result, error } = await supabase.rpc('update_portfolio_account', {
        p_client_id: clientId,
        p_account_number: accountNumber,
        p_new_account_number: newAccountNumber,
        p_onboarded_date: onboardedDate,
        p_server_billing_enabled: input.server_billing_enabled
      });
      if (error) throw error;
      if (result?.error) return res.status(Number(result.status) || 409).json({ message: result.error });
      return res.status(200).json(await getPortfolio());
    }

    if (method === 'POST' && path === '/api/admin/portfolio') {
      const input = bodyOf(req);
      const type = input.type;
      const clientId = String(input.client_id || '').trim().toUpperCase();
      const accountNumber = String(input.account_number || '').trim();
      const amount = Number(input.amount);
      const createdAt = input.created_at ? new Date(input.created_at) : new Date();
      const serverBillingEnabled = type === 'onboarded' && input.server_billing_enabled === true;
      if (!['onboarded', 'funds_added', 'profit_withdrawn'].includes(type)) return res.status(400).json({ message: 'Choose onboarding, added funds, or profit withdrawal' });
      if (!clientId || !accountNumber) return res.status(400).json({ message: 'Client ID and account number are required' });
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Enter an amount greater than zero' });
      if (Number.isNaN(createdAt.getTime())) return res.status(400).json({ message: 'Enter a valid date and time' });
      const serverBillingOnboardingDate = String(input.server_billing_onboarding_date || createdAt.toISOString().slice(0, 10));
      if (serverBillingEnabled && (!/^\d{4}-\d{2}-\d{2}$/.test(serverBillingOnboardingDate)
        || Number.isNaN(new Date(`${serverBillingOnboardingDate}T00:00:00.000Z`).getTime())
        || new Date(`${serverBillingOnboardingDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== serverBillingOnboardingDate)) {
        return res.status(400).json({ message: 'Enter a valid server billing onboarding date' });
      }

      const { data: client, error: clientError } = await supabase.from('portfolio_clients').select('*').eq('client_id', clientId).is('deleted_at', null).maybeSingle();
      if (clientError) throw clientError;
      if (!client) return res.status(404).json({ message: 'Register this client before adding a portfolio entry' });

      const portfolio = await getPortfolio();
      const active = portfolio.active_accounts.find(account => account.account_number === accountNumber);
      if (active && active.client_id !== clientId) return res.status(409).json({ message: 'This account number belongs to a different Client ID' });
      if (type === 'funds_added' && !active) return res.status(400).json({ message: 'Added funds require an active account for this Client ID' });
      if (type === 'profit_withdrawn' && !active) return res.status(400).json({ message: 'Profit withdrawals require an active account' });
      const { error } = await supabase.from('portfolio_events').insert({
        event_type: type === 'onboarded' && active ? 'funds_added' : type,
        client_id: clientId,
        client_name: `${client.first_name} ${client.second_name}`.trim(),
        account_number: accountNumber,
        amount,
        created_at: createdAt.toISOString(),
        server_billing_enabled: serverBillingEnabled && !active,
        server_billing_onboarding_date: serverBillingEnabled && !active ? serverBillingOnboardingDate : null
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
