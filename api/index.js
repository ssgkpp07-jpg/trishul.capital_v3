import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import loginHandler from './login-handler.js';
import { summarizePortfolio, summarizePortfolioMonths, buildPortfolioWorkbook, filterPortfolioEventsByDate } from '../portfolio.js';
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
const supabase = { from: (...args) => getSupabase().from(...args) };
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
