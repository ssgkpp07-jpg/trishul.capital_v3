(() => {
  const styles = document.createElement('style');
  styles.textContent = `
    #billingPanel{padding:0}
    .billing-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0 28px}
    .billing-card{padding:16px;border:1px solid #252e3a;border-radius:9px;background:#11161f}
    .billing-card span{display:block;color:#91a0b7;font-size:12px}
    .billing-card strong{display:block;margin-top:10px;color:#efc24c;font-size:20px;font-variant-numeric:tabular-nums}
    .billing-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end}
    .billing-form label,.billing-custom-label{display:block;color:#aab7ca;font-size:12px}
    .billing-form input,.billing-form select{width:100%;margin:5px 0;padding:10px}
    .billing-form button{width:auto;margin:0}
    .billing-client-email{grid-column:1/-1;margin:0 0 4px;color:#91a0b7;font-size:12px}
    .billing-week-field.hidden{display:none}
    .billing-custom-wrap{margin:18px 0}
    .billing-custom-line{display:grid;grid-template-columns:minmax(0,2fr) minmax(130px,1fr) auto;gap:8px;align-items:center;margin:8px 0}
    .billing-custom-line input{width:100%;margin:0}
    .billing-custom-line button{width:auto;margin:0}
    .billing-form .billing-submit{grid-column:1/-1;width:auto;justify-self:start;margin-top:4px}
    .billing-status{display:inline-block;padding:5px 8px;border:1px solid #404957;border-radius:20px;color:#c4cfdd;font-size:11px}
    .billing-status-sent{border-color:#31533d;color:#9be0ad}
    .billing-status-failed{border-color:#633b35;color:#ffb4a9}
    .billing-actions{display:flex;gap:6px;flex-wrap:wrap}
    .billing-no-email{color:#ffb4a9}
    .billing-no-account{grid-column:1/-1;margin:0;color:#ffb4a9;font-size:12px}
    .billing-pdf-dialog{width:min(1050px,calc(100vw - 28px));height:min(92vh,900px);max-width:none;max-height:92vh;padding:18px;background:#11161f;color:#e5eaf2;border:1px solid #424b59;border-radius:10px}
    .billing-pdf-dialog::backdrop{background:#000c}
    .billing-pdf-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .billing-pdf-dialog-header h2{margin:0}
    .billing-pdf-dialog iframe{display:block;width:100%;height:calc(100% - 55px);background:#fff;border:1px solid #303947;border-radius:6px}
    @media(max-width:850px){.billing-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.billing-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.billing-form{grid-template-columns:1fr}.billing-custom-line{grid-template-columns:1fr}.billing-summary{gap:8px}.billing-card{padding:12px}.billing-card strong{font-size:17px}}
    .admin-nav button:nth-child(4)::before{content:"$"}
    .admin-nav button:nth-child(5)::before{content:"◉"}
    .admin-nav button:nth-child(6)::before{content:"⚙"}
    .admin-nav button:nth-child(7)::before{content:"▧"}
    .admin-nav button:nth-child(8)::before{content:"◫"}
    .admin-nav button:nth-child(9)::before{content:"✉"}
    .admin-nav button:nth-child(10)::before{content:"✉"}
    .admin-nav button:nth-child(11)::before{content:"⌫"}
  `;
  document.head.append(styles);

  const panel = document.createElement('section');
  panel.id = 'billingPanel';
  panel.className = 'hidden';
  panel.innerHTML = `
    <div class="bar">
      <div>
        <h2>Billing</h2>
        <p class="muted">Create profit-share invoices for registered clients and email a PDF copy.</p>
      </div>
      <button type="button" class="portfolio-action" id="billingRefresh">Refresh</button>
    </div>
    <div id="billingSummary" class="billing-summary" aria-live="polite"></div>
    <h3>Create an invoice</h3>
    <div id="billingMsg" class="notice hidden" role="status"></div>
    <form id="billingForm" class="billing-form">
      <div>
        <label for="billingClientId">Registered client</label>
        <select id="billingClientId" required><option value="">Choose a client</option></select>
      </div>
      <div>
        <label for="billingAccountNumber">Account number</label>
        <select id="billingAccountNumber" required disabled><option value="">Choose a client first</option></select>
      </div>
      <p id="billingAccountHint" class="billing-no-account hidden" role="status"></p>
      <div>
        <label for="billingPeriodType">Billing period</label>
        <select id="billingPeriodType" required>
          <option value="monthly">Monthly</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>
      <div>
        <label for="billingYear">Year</label>
        <input id="billingYear" type="number" min="2000" max="2100" required>
      </div>
      <div>
        <label for="billingMonth">Month</label>
        <select id="billingMonth" required></select>
      </div>
      <div id="billingWeekField" class="billing-week-field hidden">
        <label for="billingWeek">Week of month</label>
        <select id="billingWeek"></select>
      </div>
      <div>
        <label for="billingWithdrawalProfit">Withdrawal profit (USD)</label>
        <input id="billingWithdrawalProfit" type="number" min="0" step="0.01" value="0" required>
      </div>
      <div>
        <label for="billingSplit">Profit share (%)</label>
        <input id="billingSplit" type="number" min="0" max="100" step="0.01" required>
      </div>
      <div>
        <label for="billingMaintenance">Monthly server maintenance (USD)</label>
        <input id="billingMaintenance" type="number" min="0" step="0.01" value="0" required>
      </div>
      <div>
        <label for="billingRate">USD to INR exchange rate</label>
        <input id="billingRate" type="number" min="0.0001" step="0.0001" required>
      </div>
      <p id="billingClientEmail" class="billing-client-email" aria-live="polite">Choose a registered client to see their saved email address.</p>
      <div class="billing-custom-wrap">
        <span class="billing-custom-label">Optional custom invoice lines (USD)</span>
        <div id="billingCustomLines"></div>
        <button type="button" class="portfolio-action" id="billingAddLine">Add custom line</button>
      </div>
      <button type="submit" class="billing-submit">Create and email invoice</button>
    </form>
    <h3>Invoices</h3>
    <div class="portfolio-table-wrap">
      <table class="portfolio-table">
        <thead><tr><th>Invoice</th><th>Client</th><th>Account number</th><th>Period</th><th>Total (INR)</th><th>Email status</th><th>Actions</th></tr></thead>
        <tbody id="billingInvoiceRows"><tr><td colspan="7">Loading invoices…</td></tr></tbody>
      </table>
    </div>
    <dialog id="billingPdfDialog" class="billing-pdf-dialog" aria-labelledby="billingPdfTitle">
      <div class="billing-pdf-dialog-header">
        <h2 id="billingPdfTitle">Invoice PDF preview</h2>
        <button type="button" class="portfolio-action" id="billingPdfClose">Close</button>
      </div>
      <iframe id="billingPdfFrame" title="Generated invoice PDF preview"></iframe>
    </dialog>`;
  const app = document.getElementById('app');
  const permanentPanel = document.getElementById('permanentDeletePanel');
  app.insertBefore(panel, permanentPanel);

  const nav = document.getElementById('adminNavigation');
  const portfolioButton = [...nav.querySelectorAll('button')].find(button => button.textContent.trim() === 'Portfolio');
  const billingButton = document.createElement('button');
  billingButton.type = 'button';
  billingButton.textContent = 'Billing';
  billingButton.addEventListener('click', () => window.showAdminPanel('billingPanel', billingButton, 'Billing'));
  portfolioButton.after(billingButton);

  const originalShowAdminPanel = window.showAdminPanel;
  window.showAdminPanel = (id, button, title) => {
    if (id !== 'billingPanel') panel.classList.add('hidden');
    if (id === 'billingPanel') {
      document.querySelectorAll('#app > section').forEach(section => section.classList.add('hidden'));
      panel.classList.remove('hidden');
      document.querySelectorAll('.admin-nav button').forEach(item => item.classList.toggle('active', item === button));
      document.getElementById('adminCurrentPage').textContent = title;
      nav.classList.remove('mobile-open');
      document.getElementById('adminMenuToggle').setAttribute('aria-expanded', 'false');
      document.getElementById('adminMenuToggle').setAttribute('aria-label', 'Open admin menu');
      window.loadBilling();
      return;
    }
    return originalShowAdminPanel(id, button, title);
  };

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthSelect = document.getElementById('billingMonth');
  monthSelect.innerHTML = months.map((month, index) => `<option value="${index + 1}">${month}</option>`).join('');
  const accountSelect = document.getElementById('billingAccountNumber');
  const clientSelect = document.getElementById('billingClientId');
  const message = document.getElementById('billingMsg');
  let invoices = [];
  let billingAccounts = [];
  let billingPdfPreviewUrl = '';

  function setBillingMessage(text, isError = false) {
    message.textContent = text;
    message.classList.remove('hidden');
    message.classList.toggle('billing-no-email', isError);
  }

  function updateWeekOptions() {
    const year = Number(document.getElementById('billingYear').value);
    const month = Number(monthSelect.value);
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weekSelect = document.getElementById('billingWeek');
    const previous = Number(weekSelect.value) || 1;
    const count = Math.ceil(dayCount / 7);
    weekSelect.innerHTML = Array.from({ length: count }, (_, index) => `<option value="${index + 1}">Week ${index + 1} (day ${index * 7 + 1}–${Math.min(index * 7 + 7, dayCount)})</option>`).join('');
    weekSelect.value = String(Math.min(previous, count));
  }

  function updateBillingPeriod() {
    const weekly = document.getElementById('billingPeriodType').value === 'weekly';
    document.getElementById('billingWeekField').classList.toggle('hidden', !weekly);
  }

  function renderBillingClients() {
    const selected = clientSelect.value;
    const clients = registeredClients.filter(client => !client.deleted_at);
    clientSelect.innerHTML = '<option value="">Choose a client</option>' + clients.map(client =>
      `<option value="${escapeHTML(client.client_id)}">${escapeHTML(client.client_id)} · ${escapeHTML(clientFullName(client))}</option>`
    ).join('');
    if (clients.some(client => client.client_id === selected)) clientSelect.value = selected;
    const client = clients.find(item => item.client_id === clientSelect.value);
    const email = document.getElementById('billingClientEmail');
    email.textContent = client
      ? (client.email ? `Invoice will be sent to ${client.email}` : 'This client has no email address. Update it in Clients before creating an invoice.')
      : 'Choose a registered client to see their saved email address.';
    email.classList.toggle('billing-no-email', Boolean(client && !client.email));
  }

  function renderBillingAccounts() {
    const clientId = clientSelect.value;
    const selected = accountSelect.value;
    const accounts = billingAccounts.filter(account => account.client_id.toUpperCase() === clientId.toUpperCase());
    accountSelect.innerHTML = clientId
      ? '<option value="">Choose an account number</option>' + accounts.map(account =>
        `<option value="${escapeHTML(account.account_number)}">${escapeHTML(account.account_number)}</option>`
      ).join('')
      : '<option value="">Choose a client first</option>';
    accountSelect.disabled = !clientId || !accounts.length;
    if (accounts.some(account => account.account_number === selected)) accountSelect.value = selected;
    const hint = document.getElementById('billingAccountHint');
    hint.textContent = clientId && !accounts.length
      ? 'No portfolio accounts are linked to this client. Add an account in Portfolio before creating an invoice.'
      : '';
    hint.classList.toggle('hidden', !clientId || accounts.length > 0);
  }

  function readBillingAccounts(portfolio) {
    const accounts = new Map();
    const addAccount = (clientId, accountNumber) => {
      const id = String(clientId || '').trim().toUpperCase();
      const number = String(accountNumber || '').trim();
      if (id && number) accounts.set(`${id}\u0000${number}`, { client_id: id, account_number: number });
    };
    for (const event of portfolio.events || []) {
      if (!event.deleted_at) addAccount(event.client_id, event.account_number);
    }
    for (const account of portfolio.active_accounts || []) {
      addAccount(account.client_id, account.account_number);
    }
    billingAccounts = [...accounts.values()].sort((left, right) =>
      left.client_id.localeCompare(right.client_id) ||
      left.account_number.localeCompare(right.account_number, undefined, { numeric: true, sensitivity: 'base' })
    );
    renderBillingAccounts();
  }

  function billingMoney(value) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function renderBillingSummary() {
    const sent = invoices.filter(invoice => invoice.status === 'sent').length;
    const failed = invoices.length - sent;
    const total = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    document.getElementById('billingSummary').innerHTML = [
      ['Invoices', invoices.length],
      ['Emails sent', sent],
      ['Needs email retry', failed],
      ['Total invoiced', billingMoney(total)]
    ].map(([label, value]) => `<div class="billing-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function renderBillingInvoices() {
    const rows = document.getElementById('billingInvoiceRows');
    rows.innerHTML = invoices.map(invoice => {
      const sent = invoice.status === 'sent';
      return `<tr>
        <td>${escapeHTML(invoice.invoice_number)}</td>
        <td>${escapeHTML(invoice.client_id)} · ${escapeHTML(invoice.client_name)}<br><span class="muted">${escapeHTML(invoice.client_email)}</span></td>
        <td>${escapeHTML(invoice.account_number || '—')}</td>
        <td>${escapeHTML(invoice.period_type)}<br><span class="muted">${escapeHTML(invoice.period_start)} to ${escapeHTML(invoice.period_end)}</span></td>
        <td>${billingMoney(invoice.amount)}</td>
        <td><span class="billing-status ${sent ? 'billing-status-sent' : 'billing-status-failed'}">${sent ? 'Sent' : 'Email failed'}</span>${invoice.emailed_at ? `<br><span class="muted">${escapeHTML(new Date(invoice.emailed_at).toLocaleString())}</span>` : ''}</td>
        <td><div class="billing-actions">
          <button type="button" class="portfolio-action" onclick="previewBillingPdf(${Number(invoice.id)})">Preview PDF</button>
          <button type="button" class="portfolio-action" onclick="downloadBillingPdf(${Number(invoice.id)},'${escapeHTML(invoice.invoice_number)}')">Download PDF</button>
          <button type="button" class="portfolio-action" onclick="resendBillingInvoice(${Number(invoice.id)})">Send again</button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">No invoices yet. Create one above using a registered client.</td></tr>';
    renderBillingSummary();
  }

  function addBillingLine() {
    const row = document.createElement('div');
    row.className = 'billing-custom-line';
    row.innerHTML = '<input class="billing-line-description" maxlength="200" placeholder="Description" aria-label="Custom line description"><input class="billing-line-amount" type="number" min="0.01" step="0.01" placeholder="Amount USD" aria-label="Custom line amount in USD"><button type="button" class="danger portfolio-action">Remove</button>';
    row.querySelector('button').addEventListener('click', () => row.remove());
    document.getElementById('billingCustomLines').append(row);
  }

  document.getElementById('billingYear').value = String(new Date().getFullYear());
  monthSelect.value = String(new Date().getMonth() + 1);
  updateWeekOptions();
  updateBillingPeriod();
  document.getElementById('billingPeriodType').addEventListener('change', updateBillingPeriod);
  monthSelect.addEventListener('change', updateWeekOptions);
  document.getElementById('billingYear').addEventListener('change', updateWeekOptions);
  clientSelect.addEventListener('change', () => {
    renderBillingClients();
    renderBillingAccounts();
  });
  document.getElementById('billingPdfClose').addEventListener('click', () => {
    document.getElementById('billingPdfDialog').close();
  });
  document.getElementById('billingPdfDialog').addEventListener('close', () => {
    const frame = document.getElementById('billingPdfFrame');
    frame.removeAttribute('src');
    if (billingPdfPreviewUrl) URL.revokeObjectURL(billingPdfPreviewUrl);
    billingPdfPreviewUrl = '';
  });
  document.getElementById('billingRefresh').addEventListener('click', () => window.loadBilling());
  document.getElementById('billingAddLine').addEventListener('click', addBillingLine);

  window.loadBilling = async () => {
    renderBillingClients();
    try {
      const [invoiceData, portfolio] = await Promise.all([
        api('/api/admin/billing/invoices'),
        api('/api/admin/portfolio')
      ]);
      invoices = invoiceData.invoices || [];
      readBillingAccounts(portfolio);
      renderBillingInvoices();
      message.classList.add('hidden');
    } catch (error) {
      setBillingMessage(error.message, true);
      document.getElementById('billingInvoiceRows').innerHTML = '<tr><td colspan="7">Billing data could not be loaded.</td></tr>';
    }
  };

  window.submitBillingInvoice = async event => {
    event.preventDefault();
    const client = registeredClients.find(item => item.client_id === clientSelect.value && !item.deleted_at);
    if (!client) return setBillingMessage('Choose an active registered client.', true);
    if (!client.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) {
      return setBillingMessage('This client needs a valid saved email address. Update it in Clients before creating an invoice.', true);
    }
    if (!billingAccounts.some(account => account.client_id.toUpperCase() === client.client_id.toUpperCase() && account.account_number === accountSelect.value)) {
      return setBillingMessage('Choose an account number linked to this client.', true);
    }
    const form = document.getElementById('billingForm');
    const submit = form.querySelector('button[type="submit"]');
    const customLines = [...document.querySelectorAll('.billing-custom-line')].map(row => ({
      description: row.querySelector('.billing-line-description').value.trim(),
      amount_usd: Number(row.querySelector('.billing-line-amount').value)
    })).filter(line => line.description || Number.isFinite(line.amount_usd) && line.amount_usd > 0);
    const payload = {
      client_id: client.client_id,
      account_number: accountSelect.value,
      period_type: document.getElementById('billingPeriodType').value,
      year: Number(document.getElementById('billingYear').value),
      month: Number(monthSelect.value),
      week: Number(document.getElementById('billingWeek').value),
      withdrawal_profit_usd: Number(document.getElementById('billingWithdrawalProfit').value),
      profit_split_percent: Number(document.getElementById('billingSplit').value),
      server_maintenance_usd: Number(document.getElementById('billingMaintenance').value),
      usd_inr_rate: Number(document.getElementById('billingRate').value),
      custom_line_items: customLines
    };
    submit.disabled = true;
    message.classList.add('hidden');
    try {
      const result = await api('/api/admin/billing/invoices', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      document.getElementById('billingYear').value = String(new Date().getFullYear());
      monthSelect.value = String(new Date().getMonth() + 1);
      document.getElementById('billingWithdrawalProfit').value = '0';
      document.getElementById('billingMaintenance').value = '0';
      document.getElementById('billingCustomLines').replaceChildren();
      updateWeekOptions();
      updateBillingPeriod();
      renderBillingClients();
      renderBillingAccounts();
      await window.loadBilling();
      setBillingMessage(`Invoice ${result.invoice.invoice_number} created and emailed to ${result.invoice.client_email}.`);
    } catch (error) {
      await window.loadBilling();
      setBillingMessage(error.message, true);
    } finally {
      submit.disabled = false;
    }
  };
  document.getElementById('billingForm').addEventListener('submit', window.submitBillingInvoice);

  window.previewBillingPdf = async id => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/billing/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'PDF preview failed.');
      }
      if (billingPdfPreviewUrl) URL.revokeObjectURL(billingPdfPreviewUrl);
      billingPdfPreviewUrl = URL.createObjectURL(await response.blob());
      document.getElementById('billingPdfFrame').src = billingPdfPreviewUrl;
      document.getElementById('billingPdfDialog').showModal();
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  };

  window.downloadBillingPdf = async (id, invoiceNumber) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/billing/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'PDF download failed.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  };

  window.resendBillingInvoice = async id => {
    const invoice = invoices.find(item => Number(item.id) === Number(id));
    if (!invoice || !confirm(`Send invoice ${invoice.invoice_number} again to ${invoice.client_email}?`)) return;
    try {
      const result = await api(`/api/admin/billing/invoices/${id}/send`, { method: 'POST' });
      await window.loadBilling();
      setBillingMessage(`Invoice ${result.invoice.invoice_number} emailed to ${result.invoice.client_email}.`);
    } catch (error) {
      await window.loadBilling();
      setBillingMessage(error.message, true);
    }
  };
})();
