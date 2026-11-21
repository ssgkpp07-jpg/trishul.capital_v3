(() => {
  const styles = document.createElement('style');
  styles.textContent = `
    #billingPanel{padding:0}
    .billing-summary,.billing-settings-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0 24px}
    .billing-summary{grid-template-columns:repeat(3,minmax(0,1fr))}
    .billing-card{padding:16px;border:1px solid #252e3a;border-radius:9px;background:#11161f}
    .billing-card span{display:block;color:#91a0b7;font-size:12px}
    .billing-card strong{display:block;margin-top:10px;color:#efc24c;font-size:20px;font-variant-numeric:tabular-nums}
    .billing-subnav{display:flex;gap:8px;flex-wrap:nowrap;overflow-x:auto;margin:18px 0;border-bottom:1px solid #29313d}
    .billing-subnav button{width:auto;flex:0 0 auto;white-space:nowrap;margin:0;padding:12px 16px;background:transparent;color:#aab7ca;border:0;border-bottom:2px solid transparent;border-radius:0}
    .billing-subnav button.active{color:#f0c95e;border-bottom-color:#d8b143}
    .billing-form,.billing-settings-grid{align-items:end}
    .billing-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .billing-form label,.billing-settings-grid label{display:block;color:#aab7ca;font-size:12px}
    .billing-form input,.billing-form select,.billing-settings-grid input,.billing-settings-grid textarea{width:100%;margin:5px 0;padding:10px}
    .billing-form button{width:auto;margin:0}
    .billing-client-email,.billing-help{grid-column:1/-1;margin:0 0 4px;color:#91a0b7;font-size:12px}
    .billing-week-field.hidden,.billing-view.hidden{display:none}
    .billing-custom-wrap{grid-column:1/-1;margin:12px 0}
    .billing-custom-line{display:grid;grid-template-columns:minmax(0,2fr) minmax(130px,1fr) auto;gap:8px;align-items:center;margin:8px 0}
    .billing-custom-line input{width:100%;margin:0}
    .billing-custom-line button{width:auto;margin:0}
    .billing-form .billing-submit{grid-column:1/-1;width:auto;justify-self:start;margin-top:4px}
    .billing-actions{display:flex;gap:6px;flex-wrap:wrap}
    .billing-actions button{width:auto;margin:0}
    .billing-status{display:inline-block;padding:5px 8px;border:1px solid #404957;border-radius:20px;color:#c4cfdd;font-size:11px;white-space:nowrap}
    .billing-status-paid,.billing-status-settled{border-color:#31533d;color:#9be0ad}
    .billing-status-pending{border-color:#705b24;color:#f2d781}
    .billing-status-overdue{border-color:#633b35;color:#ffb4a9}
    .billing-error{color:#ffb4a9}
    .billing-pdf-dialog{width:min(1050px,calc(100vw - 28px));height:min(92vh,900px);max-width:none;max-height:92vh;padding:18px;background:#11161f;color:#e5eaf2;border:1px solid #424b59;border-radius:10px}
    .billing-pdf-dialog::backdrop{background:#000c}
    .billing-pdf-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .billing-pdf-dialog-header h2{margin:0}
    .billing-pdf-dialog iframe{display:block;width:100%;height:calc(100% - 55px);background:#fff;border:1px solid #303947;border-radius:6px}
    .billing-image-preview{display:block;max-width:180px;max-height:100px;margin:8px 0;object-fit:contain;background:#fff;border:1px solid #303947;border-radius:6px}
    .billing-image-field{padding:12px;border:1px solid #252e3a;border-radius:8px;background:#11161f}
    .billing-settings-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    .billing-settings-grid textarea{min-height:84px;resize:vertical}
    .billing-checkbox{display:flex!important;align-items:center;gap:8px;margin:10px 0}
    .billing-checkbox input{width:auto!important}
    .billing-table-note{margin:8px 0 14px;color:#91a0b7;font-size:12px}
    @media(max-width:850px){.billing-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.billing-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.billing-form,.billing-settings-grid{grid-template-columns:1fr}.billing-custom-line{grid-template-columns:1fr}.billing-summary{gap:8px}.billing-card{padding:12px}.billing-card strong{font-size:17px}}
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
      <div><h2>Billing</h2><p class="muted">Create invoices and prepare client messages manually. No email or WhatsApp messages are sent automatically.</p></div>
      <button type="button" class="portfolio-action" id="billingRefresh">Refresh</button>
    </div>
    <nav class="billing-subnav" aria-label="Billing pages">
      <button type="button" class="active" data-billing-view-button="overview">Overview</button>
      <button type="button" data-billing-view-button="invoices">Invoices</button>
      <button type="button" data-billing-view-button="audit">Audit</button>
      <button type="button" data-billing-view-button="settings">Invoice Settings</button>
    </nav>
    <div id="billingMsg" class="notice hidden" role="status"></div>
    <section class="billing-view" data-billing-view="overview">
      <div id="billingSummary" class="billing-summary" aria-live="polite"></div>
      <div class="bar"><div><h3>Monthly server billing</h3><p class="muted">Each cycle is due on the account’s monthly onboarding-date anniversary. Dates beyond a month’s last day are clamped to that month’s end.</p></div></div>
      <p class="billing-table-note">Choose Create invoice to open the invoice form with the due date and account preselected. Enter that invoice’s server cost, exchange rate, profit share, and any additional lines yourself.</p>
      <div class="portfolio-table-wrap"><table class="portfolio-table">
        <thead><tr><th>Due date</th><th>Client</th><th>Account number</th><th>Server cost (USD)</th><th>Server cost (INR)</th><th>Status</th><th>Action</th></tr></thead>
        <tbody id="billingScheduleRows"><tr><td colspan="7">Loading server billing…</td></tr></tbody>
      </table></div>
    </section>
    <section class="billing-view hidden" data-billing-view="invoices">
      <h3>Create an invoice</h3>
      <form id="billingForm" class="billing-form">
        <div><label for="billingClientId">Registered client</label><select id="billingClientId" required><option value="">Choose a client</option></select></div>
        <div><label for="billingAccountNumber">Account number</label><select id="billingAccountNumber" required disabled><option value="">Choose a client first</option></select></div>
        <p id="billingAccountHint" class="billing-help hidden" role="status"></p>
        <div><label for="billingPeriodType">Billing period</label><select id="billingPeriodType" required><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></div>
        <div><label for="billingYear">Year</label><input id="billingYear" type="number" min="2000" max="2100" required></div>
        <div><label for="billingMonth">Month</label><select id="billingMonth" required></select></div>
        <div id="billingWeekField" class="billing-week-field hidden"><label for="billingWeek">Week of month</label><select id="billingWeek"></select></div>
        <div><label for="billingWithdrawalProfit">Withdrawal profit (USD)</label><input id="billingWithdrawalProfit" type="number" min="0" step="0.01" value="0" required></div>
        <div><label for="billingSplit">Profit share (%)</label><input id="billingSplit" type="number" min="0" max="100" step="0.01" value="0" required></div>
        <div><label for="billingMaintenance">Server cost (USD)</label><input id="billingMaintenance" type="number" min="0" step="0.01" value="0" required></div>
        <div><label for="billingRate">USD to INR exchange rate</label><input id="billingRate" type="number" min="0.0001" step="0.0001" required></div>
        <div id="billingScheduledCycleNote" class="billing-help hidden"><span id="billingScheduledCycleText"></span> <button type="button" class="portfolio-action" id="billingClearScheduledCycle">Clear scheduled cycle</button></div>
        <p id="billingClientDetails" class="billing-client-email" aria-live="polite">Choose a client to see their saved email and WhatsApp details.</p>
        <div class="billing-custom-wrap"><span class="billing-client-email">Optional custom invoice lines (USD)</span><div id="billingCustomLines"></div><button type="button" class="portfolio-action" id="billingAddLine">Add custom line</button></div>
        <p class="billing-help">Creating an invoice does not send it. Download the PDF, then attach it yourself to the email or WhatsApp draft.</p>
        <button type="submit" class="billing-submit">Create invoice</button>
      </form>
      <h3>Invoices</h3>
      <div class="portfolio-table-wrap"><table class="portfolio-table">
        <thead><tr><th>Invoice</th><th>Client</th><th>Account number</th><th>Period</th><th>Total (INR)</th><th>Payment</th><th>Actions</th></tr></thead>
        <tbody id="billingInvoiceRows"><tr><td colspan="7">Loading invoices…</td></tr></tbody>
      </table></div>
    </section>
    <section class="billing-view hidden" data-billing-view="audit">
      <h3>Payment audit</h3>
      <p class="billing-table-note">Verify the payment against your bank or UPI record, then mark the invoice paid. Verification is manual.</p>
      <div class="portfolio-table-wrap"><table class="portfolio-table">
        <thead><tr><th>Invoice</th><th>Client</th><th>Account</th><th>Due date</th><th>Total (INR)</th><th>Payment status</th><th>Verified at</th><th>Action</th></tr></thead>
        <tbody id="billingAuditRows"><tr><td colspan="8">Loading audit…</td></tr></tbody>
      </table></div>
    </section>
    <section class="billing-view hidden" data-billing-view="settings">
      <h3>Invoice Settings</h3>
      <p class="billing-table-note">These details are saved with each new invoice, so later setting changes do not alter existing PDFs.</p>
      <form id="billingSettingsForm">
        <div class="billing-settings-grid">
          <div class="billing-image-field"><label for="billingLogoUpload">Invoice logo (PNG, JPEG, or WebP)</label><img id="billingLogoPreview" class="billing-image-preview" alt="Invoice logo preview"><input id="billingLogoUpload" type="file" accept="image/png,image/jpeg,image/webp"></div>
          <div class="billing-image-field"><label for="billingQrUpload">UPI QR code (PNG, JPEG, or WebP)</label><img id="billingQrPreview" class="billing-image-preview" alt="UPI QR code preview"><input id="billingQrUpload" type="file" accept="image/png,image/jpeg,image/webp"></div>
          <div><label for="billingSettingsUpi">UPI ID / payment code</label><input id="billingSettingsUpi" maxlength="200"></div>
          <div><label for="billingSettingsBankAccount">Account number</label><input id="billingSettingsBankAccount" maxlength="100"></div>
          <div><label for="billingSettingsAccountName">Account name</label><input id="billingSettingsAccountName" maxlength="200"></div>
          <div><label for="billingSettingsBankName">Bank name</label><input id="billingSettingsBankName" maxlength="200"></div>
          <div><label for="billingSettingsBranch">Branch</label><input id="billingSettingsBranch" maxlength="200"></div>
          <div><label for="billingSettingsIfsc">IFSC code</label><input id="billingSettingsIfsc" maxlength="50"></div>
          <div><label for="billingSettingsCompany">Company name</label><input id="billingSettingsCompany" maxlength="200" required></div>
          <div><label for="billingSettingsPhone">Phone number</label><input id="billingSettingsPhone" maxlength="100"></div>
          <div><label for="billingSettingsEmail">Email address</label><input id="billingSettingsEmail" type="email" maxlength="200"></div>
          <div style="grid-column:1/-1"><label for="billingSettingsAddress">From address</label><textarea id="billingSettingsAddress" maxlength="1000"></textarea></div>
        </div>
        <button type="submit" class="portfolio-action">Save Invoice Settings</button>
      </form>
    </section>
    <dialog id="billingPdfDialog" class="billing-pdf-dialog" aria-labelledby="billingPdfTitle">
      <div class="billing-pdf-dialog-header"><h2 id="billingPdfTitle">Invoice PDF preview</h2><button type="button" class="portfolio-action" id="billingPdfClose">Close</button></div>
      <iframe id="billingPdfFrame" title="Generated invoice PDF preview"></iframe>
    </dialog>`;

  const app = document.getElementById('app');
  const permanentPanel = document.getElementById('permanentDeletePanel');
  app.insertBefore(panel, permanentPanel);

  const portfolioForm = document.getElementById('portfolioForm');
  const serverBillingField = document.createElement('div');
  serverBillingField.id = 'portfolioServerBillingField';
  serverBillingField.innerHTML = '<label class="billing-checkbox" for="portfolioServerBillingEnabled"><input id="portfolioServerBillingEnabled" type="checkbox"> Track monthly server billing for this account</label><p class="billing-help">This adds monthly due-date reminders. Enter the server cost and exchange rate each time you create an invoice.</p>';
  portfolioForm.append(serverBillingField);
  const updateServerBillingToggle = () => {
    const newAccount = document.getElementById('portfolioAccountSelect').value === '__new__';
    const visible = document.getElementById('portfolioType').value === 'onboarded' && newAccount;
    serverBillingField.classList.toggle('hidden', !visible);
  };
  updateServerBillingToggle();
  const originalToggleNewPortfolioAccount = window.toggleNewPortfolioAccount;
  window.toggleNewPortfolioAccount = () => {
    originalToggleNewPortfolioAccount();
    updateServerBillingToggle();
  };
  document.getElementById('portfolioType').addEventListener('change', updateServerBillingToggle);
  document.getElementById('portfolioAccountSelect').addEventListener('change', updateServerBillingToggle);

  const deletedInvoicesSection = document.createElement('section');
  deletedInvoicesSection.innerHTML = `<h3>Deleted invoices</h3><div class="portfolio-table-wrap"><table class="portfolio-table"><thead><tr><th>Invoice</th><th>Client</th><th>Deleted at</th><th>Action</th></tr></thead><tbody id="permanentInvoiceRows"><tr><td colspan="4">No deleted invoices.</td></tr></tbody></table></div>`;
  permanentPanel.append(deletedInvoicesSection);

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
      for (const panelId of ['overviewPanel', 'performancePanel', 'socialPanel', 'contactPanel', 'contactCardPanel', 'founderImagePanel', 'clientsPanel', 'portfolioPanel', 'permanentDeletePanel', 'billingPanel']) {
        document.getElementById(panelId)?.classList.add('hidden');
      }
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

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const apiBase = (window.TRISHUL_API_URL || '').replace(/\/$/, '');
  const apiRequest = async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Billing request failed.');
    return result;
  };
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthSelect = document.getElementById('billingMonth');
  monthSelect.innerHTML = months.map((month, index) => `<option value="${index + 1}">${month}</option>`).join('');
  const clientSelect = document.getElementById('billingClientId');
  const accountSelect = document.getElementById('billingAccountNumber');
  const message = document.getElementById('billingMsg');
  const fileLogo = document.getElementById('billingLogoUpload');
  const fileQr = document.getElementById('billingQrUpload');
  let invoices = [];
  let auditInvoices = [];
  let billingAccounts = [];
  let serverCycles = [];
  let billingSettings = {};
  let scheduledServerBillingDueDate = '';
  let billingPdfPreviewUrl = '';

  function setBillingMessage(text, isError = false) {
    message.textContent = text;
    message.classList.remove('hidden');
    message.classList.toggle('billing-error', isError);
  }

  function moneyInr(value) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function moneyUsd(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function statusBadge(status, overdue = false) {
    const label = status === 'paid' || status === 'settled' ? 'Settled'
      : status === 'pending' ? 'Pending'
        : overdue ? 'Due / uninvoiced' : 'Upcoming';
    const style = status === 'paid' || status === 'settled' ? 'billing-status-settled'
      : status === 'pending' ? 'billing-status-pending'
        : overdue ? 'billing-status-overdue' : '';
    return `<span class="billing-status ${style}">${label}</span>`;
  }

  function updateWeekOptions() {
    const year = Number(document.getElementById('billingYear').value);
    const month = Number(monthSelect.value);
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weekSelect = document.getElementById('billingWeek');
    const previous = Number(weekSelect.value) || 1;
    const count = Math.ceil(dayCount / 7);
    weekSelect.innerHTML = Array.from({ length: count }, (_, index) =>
      `<option value="${index + 1}">Week ${index + 1} (day ${index * 7 + 1}–${Math.min(index * 7 + 7, dayCount)})</option>`
    ).join('');
    weekSelect.value = String(Math.min(previous, count));
  }

  function updateBillingPeriod() {
    document.getElementById('billingWeekField').classList.toggle('hidden', document.getElementById('billingPeriodType').value !== 'weekly');
  }

  function renderBillingClients() {
    const selected = clientSelect.value;
    const clients = registeredClients.filter(client => !client.deleted_at);
    clientSelect.innerHTML = '<option value="">Choose a client</option>' + clients.map(client =>
      `<option value="${escapeHtml(client.client_id)}">${escapeHtml(client.client_id)} · ${escapeHtml(clientFullName(client))}</option>`
    ).join('');
    if (clients.some(client => client.client_id === selected)) clientSelect.value = selected;
    const client = clients.find(item => item.client_id === clientSelect.value);
    const details = document.getElementById('billingClientDetails');
    details.textContent = client
      ? `Email: ${client.email || 'not saved'} · WhatsApp: ${client.whatsapp_number || 'not saved'}`
      : 'Choose a client to see their saved email and WhatsApp details.';
    renderBillingAccounts();
  }

  function renderBillingAccounts() {
    const clientId = clientSelect.value;
    const selected = accountSelect.value;
    const accounts = billingAccounts.filter(account => account.client_id.toUpperCase() === clientId.toUpperCase());
    accountSelect.innerHTML = clientId
      ? '<option value="">Choose an account number</option>' + accounts.map(account =>
        `<option value="${escapeHtml(account.account_number)}">${escapeHtml(account.account_number)}</option>`
      ).join('')
      : '<option value="">Choose a client first</option>';
    accountSelect.disabled = !clientId || !accounts.length;
    if (accounts.some(account => account.account_number === selected)) accountSelect.value = selected;
    const hint = document.getElementById('billingAccountHint');
    hint.textContent = clientId && !accounts.length ? 'No portfolio accounts are linked to this client. Add an account in Portfolio first.' : '';
    hint.classList.toggle('hidden', !clientId || accounts.length > 0);
  }

  function readBillingAccounts(portfolio) {
    const accounts = new Map();
    const addAccount = (clientId, accountNumber) => {
      const id = String(clientId || '').trim().toUpperCase();
      const number = String(accountNumber || '').trim();
      if (id && number) accounts.set(`${id}\u0000${number}`, { client_id: id, account_number: number });
    };
    for (const event of portfolio.events || []) if (!event.deleted_at) addAccount(event.client_id, event.account_number);
    for (const account of portfolio.active_accounts || []) addAccount(account.client_id, account.account_number);
    billingAccounts = [...accounts.values()].sort((left, right) =>
      left.client_id.localeCompare(right.client_id) ||
      left.account_number.localeCompare(right.account_number, undefined, { numeric: true, sensitivity: 'base' })
    );
    renderBillingAccounts();
  }

  function renderBillingSummary() {
    const upcoming = serverCycles.filter(cycle => cycle.status === 'upcoming');
    const serverInvoices = auditInvoices.filter(invoice => invoice.billing_type === 'server_fee');
    const pendingServer = serverInvoices.filter(invoice => invoice.payment_status !== 'paid');
    const settledServer = serverInvoices.filter(invoice => invoice.payment_status === 'paid');
    const profitInvoices = auditInvoices.filter(invoice => Number(invoice.profit_share_amount || 0) > 0);
    const pendingProfit = profitInvoices.filter(invoice => invoice.payment_status !== 'paid');
    const settledProfit = profitInvoices.filter(invoice => invoice.payment_status === 'paid');
    const serverInvoiceUsd = invoice => {
      const lines = Array.isArray(invoice.custom_line_items) ? invoice.custom_line_items : [];
      const legacyFees = lines.filter(line => String(line.description || '').startsWith('Monthly server fee · Account '));
      return legacyFees.length
        ? legacyFees.reduce((sum, line) => sum + Number(line.amount_usd || 0), 0)
        : Number(invoice.server_maintenance_usd || 0);
    };
    const total = auditInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    document.getElementById('billingSummary').innerHTML = [
      ['Upcoming server fees', `${upcoming.length} cycle${upcoming.length === 1 ? '' : 's'}`],
      ['Pending server invoices', `${pendingServer.length} · ${moneyUsd(pendingServer.reduce((sum, invoice) => sum + serverInvoiceUsd(invoice), 0))}`],
      ['Settled server fees', `${settledServer.length} · ${moneyUsd(settledServer.reduce((sum, invoice) => sum + serverInvoiceUsd(invoice), 0))}`],
      ['Pending profit split invoices', `${pendingProfit.length} · ${moneyInr(pendingProfit.reduce((sum, invoice) => sum + Number(invoice.profit_share_amount || 0), 0))}`],
      ['Settled profit split invoices', `${settledProfit.length} · ${moneyInr(settledProfit.reduce((sum, invoice) => sum + Number(invoice.profit_share_amount || 0), 0))}`],
      ['Invoices · total', `${auditInvoices.length} · ${moneyInr(total)}`]
    ].map(([label, value]) => `<div class="billing-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('billingSummary').setAttribute('aria-label', `Billing summary. ${upcoming.length} upcoming server fees, ${pendingServer.length} pending server invoices, ${settledServer.length} settled server invoices, ${pendingProfit.length} pending profit split invoices, and ${settledProfit.length} settled profit split invoices.`);
  }

  function renderBillingSchedule() {
    const rows = document.getElementById('billingScheduleRows');
    rows.innerHTML = serverCycles.map(cycle => {
      const action = cycle.invoice_id
        ? `<button type="button" class="portfolio-action" onclick="previewBillingPdf(${Number(cycle.invoice_id)})">Preview invoice</button>`
        : `<button type="button" class="portfolio-action" onclick="prepareServerBillingInvoice('${encodeURIComponent(cycle.client_id).replace(/'/g, '%27')}','${encodeURIComponent(cycle.account_numbers[0]).replace(/'/g, '%27')}','${cycle.due_date}')">Create invoice</button>`;
      return `<tr>
        <td>${escapeHtml(cycle.due_date)}${cycle.overdue && cycle.status === 'upcoming' ? '<br><span class="billing-error">Due</span>' : ''}</td>
        <td>${escapeHtml(cycle.client_id)} · ${escapeHtml(cycle.client_name)}<br><span class="muted">${escapeHtml(cycle.client_email || cycle.client_phone || '')}</span></td>
        <td>${escapeHtml(cycle.account_numbers[0])}</td>
        <td>${cycle.amount_usd == null ? '<span class="muted">Set in invoice</span>' : moneyUsd(cycle.amount_usd)}</td>
        <td>${cycle.amount_inr == null ? '<span class="muted">Set in invoice</span>' : moneyInr(cycle.amount_inr)}</td>
        <td>${statusBadge(cycle.status, cycle.overdue)}</td><td><div class="billing-actions">${action}</div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">No active accounts have monthly server billing enabled.</td></tr>';
  }

  function invoicePaymentLabel(invoice) {
    return invoice.payment_status === 'paid' ? statusBadge('paid') : statusBadge('pending');
  }

  function renderInvoiceRows() {
    const rows = document.getElementById('billingInvoiceRows');
    rows.innerHTML = invoices.map(invoice => {
      const emailDisabled = !invoice.client_email;
      const phoneDisabled = !invoice.client_phone;
      return `<tr>
        <td>${escapeHtml(invoice.invoice_number)}${invoice.billing_type === 'server_fee' ? '<br><span class="muted">Server fee</span>' : ''}</td>
        <td>${escapeHtml(invoice.client_id)} · ${escapeHtml(invoice.client_name)}<br><span class="muted">${escapeHtml(invoice.client_email || invoice.client_phone || '')}</span></td>
        <td>${escapeHtml(invoice.account_number || '—')}</td>
        <td>${escapeHtml(invoice.period_type)}<br><span class="muted">${escapeHtml(invoice.period_start)} to ${escapeHtml(invoice.period_end)}</span></td>
        <td>${moneyInr(invoice.amount)}</td><td>${invoicePaymentLabel(invoice)}</td>
        <td><div class="billing-actions">
          <button type="button" class="portfolio-action" onclick="previewBillingPdf(${Number(invoice.id)})">Preview PDF</button>
          <button type="button" class="portfolio-action" onclick="downloadBillingPdf(${Number(invoice.id)},'${escapeHtml(invoice.invoice_number)}')">Download PDF</button>
          <button type="button" class="portfolio-action" ${emailDisabled ? 'disabled title="No client email saved"' : `onclick="prepareBillingEmail(${Number(invoice.id)})"`}>Email draft</button>
          <button type="button" class="portfolio-action" ${phoneDisabled ? 'disabled title="No client WhatsApp saved"' : `onclick="prepareBillingWhatsApp(${Number(invoice.id)})"`}>WhatsApp draft</button>
          <button type="button" class="danger portfolio-action" onclick="deleteBillingInvoice(${Number(invoice.id)})">Delete</button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">No invoices yet. Create one above using a registered client.</td></tr>';
  }

  function renderAuditRows() {
    const rows = document.getElementById('billingAuditRows');
    rows.innerHTML = auditInvoices.map(invoice => `<tr>
      <td>${escapeHtml(invoice.invoice_number)}</td>
      <td>${escapeHtml(invoice.client_id)} · ${escapeHtml(invoice.client_name)}</td>
      <td>${escapeHtml(invoice.account_number || '—')}</td>
      <td>${escapeHtml(invoice.due_date)}</td>
      <td>${moneyInr(invoice.amount)}</td>
      <td>${invoicePaymentLabel(invoice)}${invoice.payment_reference ? `<br><span class="muted">${escapeHtml(invoice.payment_reference)}</span>` : ''}</td>
      <td>${invoice.paid_at ? escapeHtml(new Date(invoice.paid_at).toLocaleString()) : '—'}</td>
      <td><div class="billing-actions">
        ${invoice.payment_status === 'paid' ? 'Verified' : `<button type="button" class="portfolio-action" onclick="markBillingInvoicePaid(${Number(invoice.id)})">Verify / mark paid</button>`}
        <button type="button" class="portfolio-action" onclick="previewBillingPdf(${Number(invoice.id)})">Preview</button>
      </div></td>
    </tr>`).join('') || '<tr><td colspan="8">No invoices to audit.</td></tr>';
  }

  function renderDeletedInvoices(deleted) {
    const rows = document.getElementById('permanentInvoiceRows');
    rows.innerHTML = deleted.map(invoice => `<tr>
      <td>${escapeHtml(invoice.invoice_number)}</td>
      <td>${escapeHtml(invoice.client_id)} · ${escapeHtml(invoice.client_name)}</td>
      <td>${invoice.deleted_at ? escapeHtml(new Date(invoice.deleted_at).toLocaleString()) : '—'}</td>
      <td><button type="button" class="danger portfolio-action" onclick="permanentlyDeleteBillingInvoice(${Number(invoice.id)})">Delete permanently</button></td>
    </tr>`).join('') || '<tr><td colspan="4">No deleted invoices.</td></tr>';
  }

  function renderSettings() {
    const fields = {
      billingSettingsUpi: 'upi_id',
      billingSettingsBankAccount: 'bank_account_number',
      billingSettingsAccountName: 'bank_account_name',
      billingSettingsBankName: 'bank_name',
      billingSettingsBranch: 'bank_branch',
      billingSettingsIfsc: 'bank_ifsc',
      billingSettingsCompany: 'company_name',
      billingSettingsPhone: 'company_phone',
      billingSettingsEmail: 'company_email',
      billingSettingsAddress: 'company_address'
    };
    for (const [id, key] of Object.entries(fields)) document.getElementById(id).value = billingSettings[key] ?? '';
    document.getElementById('billingLogoPreview').src = billingSettings.logo_data_url || '/admin/assets/invoice-logo.webp';
    document.getElementById('billingLogoPreview').classList.toggle('hidden', !billingSettings.logo_data_url);
    document.getElementById('billingQrPreview').src = billingSettings.upi_qr_data_url || '';
    document.getElementById('billingQrPreview').classList.toggle('hidden', !billingSettings.upi_qr_data_url);
  }

  async function blobToPngDataUrl(blob) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare the image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const result = canvas.toDataURL('image/png');
    const dataSize = Math.ceil((result.length - result.indexOf(',') - 1) * 3 / 4);
    if (dataSize > 1.5 * 1024 * 1024) throw new Error('Choose an image smaller than 1.5 MB after conversion.');
    return result;
  }

  function addBillingLine() {
    const row = document.createElement('div');
    row.className = 'billing-custom-line';
    row.innerHTML = '<input class="billing-line-description" maxlength="200" placeholder="Description" aria-label="Custom line description"><input class="billing-line-amount" type="number" min="0.01" step="0.01" placeholder="Amount USD" aria-label="Custom line amount in USD"><button type="button" class="danger portfolio-action">Remove</button>';
    row.querySelector('button').addEventListener('click', () => row.remove());
    document.getElementById('billingCustomLines').append(row);
  }

  function saveSettingsForm() {
    const fields = {
      upi_id: 'billingSettingsUpi',
      bank_account_number: 'billingSettingsBankAccount',
      bank_account_name: 'billingSettingsAccountName',
      bank_name: 'billingSettingsBankName',
      bank_branch: 'billingSettingsBranch',
      bank_ifsc: 'billingSettingsIfsc',
      company_name: 'billingSettingsCompany',
      company_phone: 'billingSettingsPhone',
      company_email: 'billingSettingsEmail',
      company_address: 'billingSettingsAddress'
    };
    for (const [key, id] of Object.entries(fields)) billingSettings[key] = document.getElementById(id).value.trim();
    return apiRequest('/api/admin/billing/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings: billingSettings })
    });
  }

  async function loadBilling() {
    renderBillingClients();
    try {
      const [invoiceData, auditData, portfolio, settingsData, overview] = await Promise.all([
        apiRequest('/api/admin/billing/invoices'),
        apiRequest('/api/admin/billing/audit'),
        apiRequest('/api/admin/portfolio'),
        apiRequest('/api/admin/billing/settings'),
        apiRequest('/api/admin/billing/overview')
      ]);
      invoices = invoiceData.invoices || [];
      auditInvoices = auditData.invoices || [];
      billingSettings = settingsData.settings;
      if (!billingSettings.logo_data_url) {
        const response = await fetch('/admin/assets/invoice-logo.webp');
        if (!response.ok) throw new Error('The default invoice logo could not be loaded.');
        billingSettings.logo_data_url = await blobToPngDataUrl(await response.blob());
        const saved = await apiRequest('/api/admin/billing/settings', { method: 'PUT', body: JSON.stringify({ settings: billingSettings }) });
        billingSettings = saved.settings;
      }
      serverCycles = overview.cycles || [];
      readBillingAccounts(portfolio);
      renderSettings();
      renderInvoiceRows();
      renderAuditRows();
      renderBillingSchedule();
      renderBillingSummary();
      message.classList.add('hidden');
    } catch (error) {
      setBillingMessage(error.message, true);
      document.getElementById('billingInvoiceRows').innerHTML = '<tr><td colspan="7">Billing data could not be loaded.</td></tr>';
      document.getElementById('billingScheduleRows').innerHTML = '<tr><td colspan="7">Server billing data could not be loaded.</td></tr>';
    }
  }

  async function convertUpload(input, key, previewId) {
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setBillingMessage('Choose a PNG, JPEG, or WebP image.', true);
      input.value = '';
      return;
    }
    try {
      billingSettings[key] = await blobToPngDataUrl(file);
      document.getElementById(previewId).src = billingSettings[key];
      document.getElementById(previewId).classList.remove('hidden');
      setBillingMessage('Image ready. Save Invoice Settings to apply it to new invoices.');
    } catch (error) {
      setBillingMessage(error.message, true);
    } finally {
      input.value = '';
    }
  }

  async function prepareEmail(invoice) {
    if (!invoice?.client_email) return setBillingMessage('This client does not have an email address saved.', true);
    const subject = `Invoice ${invoice.invoice_number} from ${billingSettings.company_name || 'Trishul Capital'}`;
    const body = `Hello ${invoice.client_name},\n\nPlease find the invoice details below. Download the PDF from the Billing section and attach it to this draft before sending.\n\nInvoice: ${invoice.invoice_number}\nAccount: ${invoice.account_number || '—'}\nAmount: ${moneyInr(invoice.amount)}\nDue date: ${invoice.due_date}\n\nRegards,\n${billingSettings.company_name || 'Trishul Capital'}`;
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(invoice.client_email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener');
    setBillingMessage('Email draft opened. Download the invoice PDF and attach it yourself before sending.');
  }

  async function prepareWhatsApp(invoice) {
    const phone = String(invoice?.client_phone || '').replace(/\D/g, '');
    if (!phone) return setBillingMessage('This client does not have a WhatsApp number saved.', true);
    const text = `Hello ${invoice.client_name},\n\nInvoice ${invoice.invoice_number} for account ${invoice.account_number || '—'} is ready. Amount: ${moneyInr(invoice.amount)}. Due date: ${invoice.due_date}.\n\nPlease find the PDF attached.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    setBillingMessage('WhatsApp draft opened. Attach the downloaded invoice PDF yourself before sending.');
  }

  async function downloadBillingPdf(id, invoiceNumber) {
    try {
      const response = await fetch(`${apiBase}/api/admin/billing/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'PDF download failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${String(invoiceNumber).replace(/[\\/]/g, '-')}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  }

  async function previewBillingPdf(id) {
    try {
      const response = await fetch(`${apiBase}/api/admin/billing/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'PDF preview failed.');
      if (billingPdfPreviewUrl) URL.revokeObjectURL(billingPdfPreviewUrl);
      billingPdfPreviewUrl = URL.createObjectURL(await response.blob());
      document.getElementById('billingPdfFrame').src = billingPdfPreviewUrl;
      document.getElementById('billingPdfDialog').showModal();
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  }

  async function markInvoicePaid(id) {
    const invoice = invoices.find(item => Number(item.id) === Number(id));
    if (!invoice || invoice.payment_status === 'paid') return;
    if (!confirm(`Confirm you verified payment for ${invoice.invoice_number} (${moneyInr(invoice.amount)})?`)) return;
    const reference = prompt('Optional payment reference, transaction ID, or verification note:') || '';
    try {
      const result = await apiRequest(`/api/admin/billing/invoices/${id}/paid`, { method: 'POST', body: JSON.stringify({ payment_reference: reference.trim() }) });
      setBillingMessage(`Invoice ${result.invoice.invoice_number} marked as paid after manual verification.`);
      await loadBilling();
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  }

  async function removeInvoice(id) {
    const invoice = invoices.find(item => Number(item.id) === Number(id));
    if (!invoice || !confirm(`Move invoice ${invoice.invoice_number} to Permanent Delete? It will be hidden from the active invoice list.`)) return;
    try {
      await apiRequest(`/api/admin/billing/invoices/${id}`, { method: 'DELETE' });
      setBillingMessage(`Invoice ${invoice.invoice_number} moved to Permanent Delete.`);
      await loadBilling();
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  }

  async function permanentlyRemoveInvoice(id) {
    try {
      const deleted = await apiRequest('/api/admin/billing/deleted-invoices');
      const invoice = (deleted.invoices || []).find(item => Number(item.id) === Number(id));
      if (!invoice) return;
      if (!confirm(`PERMANENTLY delete invoice ${invoice.invoice_number} for ${invoice.client_name}? This cannot be undone.`)) return;
      if (!confirm(`Second confirmation: permanently remove invoice ${invoice.invoice_number} and its record?`)) return;
      await apiRequest(`/api/admin/billing/invoices/${id}/permanent`, { method: 'DELETE' });
      setBillingMessage(`Invoice ${invoice.invoice_number} permanently deleted.`);
      await loadDeletedInvoices();
      await loadBilling();
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  }

  async function loadDeletedInvoices() {
    try {
      const result = await apiRequest('/api/admin/billing/deleted-invoices');
      renderDeletedInvoices(result.invoices || []);
    } catch (error) {
      document.getElementById('permanentInvoiceRows').innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  function prepareServerInvoice(clientId, accountNumber, dueDate) {
    const clientIdValue = decodeURIComponent(clientId);
    const accountNumberValue = decodeURIComponent(accountNumber);
    const [year, month] = dueDate.split('-').map(Number);
    switchBillingView('invoices');
    clientSelect.value = clientIdValue;
    renderBillingClients();
    accountSelect.value = accountNumberValue;
    document.getElementById('billingPeriodType').value = 'monthly';
    document.getElementById('billingYear').value = String(year);
    monthSelect.value = String(month);
    updateWeekOptions();
    updateBillingPeriod();
    scheduledServerBillingDueDate = dueDate;
    document.getElementById('billingScheduledCycleText').textContent = `Scheduled server cycle for ${accountNumberValue}, due ${dueDate}. Enter the server cost and USD-to-INR rate; profit share and extra lines are optional.`;
    document.getElementById('billingScheduledCycleNote').classList.remove('hidden');
    document.getElementById('billingMaintenance').focus();
    document.getElementById('billingForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setBillingMessage('Review the account and due date, then enter the amounts to create this invoice manually.');
  }

  function clearScheduledCycle() {
    scheduledServerBillingDueDate = '';
    document.getElementById('billingScheduledCycleNote').classList.add('hidden');
    document.getElementById('billingScheduledCycleText').textContent = '';
  }

  function switchBillingView(view) {
    document.querySelectorAll('[data-billing-view]').forEach(section => section.classList.toggle('hidden', section.dataset.billingView !== view));
    document.querySelectorAll('[data-billing-view-button]').forEach(button => {
      const active = button.dataset.billingViewButton === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (view === 'audit') renderAuditRows();
  }

  document.getElementById('billingYear').value = String(new Date().getFullYear());
  monthSelect.value = String(new Date().getMonth() + 1);
  updateWeekOptions();
  updateBillingPeriod();
  document.getElementById('billingPeriodType').addEventListener('change', updateBillingPeriod);
  monthSelect.addEventListener('change', updateWeekOptions);
  document.getElementById('billingYear').addEventListener('change', updateWeekOptions);
  clientSelect.addEventListener('change', renderBillingClients);
  document.getElementById('billingPdfClose').addEventListener('click', () => document.getElementById('billingPdfDialog').close());
  document.getElementById('billingPdfDialog').addEventListener('close', () => {
    const frame = document.getElementById('billingPdfFrame');
    frame.removeAttribute('src');
    if (billingPdfPreviewUrl) URL.revokeObjectURL(billingPdfPreviewUrl);
    billingPdfPreviewUrl = '';
  });
  document.getElementById('billingRefresh').addEventListener('click', loadBilling);
  document.getElementById('billingAddLine').addEventListener('click', addBillingLine);
  document.getElementById('billingClearScheduledCycle').addEventListener('click', clearScheduledCycle);
  document.querySelectorAll('[data-billing-view-button]').forEach(button =>
    button.addEventListener('click', () => switchBillingView(button.dataset.billingViewButton))
  );
  fileLogo.addEventListener('change', () => convertUpload(fileLogo, 'logo_data_url', 'billingLogoPreview'));
  fileQr.addEventListener('change', () => convertUpload(fileQr, 'upi_qr_data_url', 'billingQrPreview'));
  document.getElementById('billingSettingsForm').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const result = await saveSettingsForm();
      billingSettings = result.settings;
      renderSettings();
      setBillingMessage('Invoice settings saved. New invoices will use these details.');
      await loadBilling();
    } catch (error) {
      setBillingMessage(error.message, true);
    }
  });

  document.getElementById('billingForm').addEventListener('submit', async event => {
    event.preventDefault();
    const client = registeredClients.find(item => item.client_id === clientSelect.value && !item.deleted_at);
    if (!client) return setBillingMessage('Choose an active registered client.', true);
    if (!billingAccounts.some(account => account.client_id.toUpperCase() === client.client_id.toUpperCase() && account.account_number === accountSelect.value)) {
      return setBillingMessage('Choose an account number linked to this client.', true);
    }
    const customRows = [...document.querySelectorAll('.billing-custom-line')];
    const customLines = customRows.map(row => ({
      description: row.querySelector('.billing-line-description').value.trim(),
      amount_usd: Number(row.querySelector('.billing-line-amount').value)
    }));
    if (customLines.some(line => !line.description || !Number.isFinite(line.amount_usd) || line.amount_usd <= 0)) {
      return setBillingMessage('Complete each custom line description and enter a positive USD amount, or remove the empty line.', true);
    }
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
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
      custom_line_items: customLines,
      server_billing_due_date: scheduledServerBillingDueDate || null
    };
    submit.disabled = true;
    try {
      const result = await apiRequest('/api/admin/billing/invoices', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      document.getElementById('billingYear').value = String(new Date().getFullYear());
      monthSelect.value = String(new Date().getMonth() + 1);
      document.getElementById('billingWithdrawalProfit').value = '0';
      document.getElementById('billingMaintenance').value = '0';
      document.getElementById('billingRate').value = '';
      document.getElementById('billingCustomLines').replaceChildren();
      clearScheduledCycle();
      updateWeekOptions();
      updateBillingPeriod();
      renderBillingClients();
      setBillingMessage(`Invoice ${result.invoice.invoice_number} created. No message was sent; download the PDF to share it manually.`);
      await loadBilling();
    } catch (error) {
      setBillingMessage(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  const originalLoadPermanentDelete = window.loadPermanentDelete;
  window.loadPermanentDelete = async () => {
    await originalLoadPermanentDelete();
    await loadDeletedInvoices();
  };
  window.refreshBillingAccounts = loadBilling;

  window.loadBilling = loadBilling;
  window.previewBillingPdf = previewBillingPdf;
  window.downloadBillingPdf = downloadBillingPdf;
  window.prepareBillingEmail = async id => prepareEmail(invoices.find(item => Number(item.id) === Number(id)));
  window.prepareBillingWhatsApp = async id => prepareWhatsApp(invoices.find(item => Number(item.id) === Number(id)));
  window.markBillingInvoicePaid = markInvoicePaid;
  window.deleteBillingInvoice = removeInvoice;
  window.permanentlyDeleteBillingInvoice = permanentlyRemoveInvoice;
  window.prepareServerBillingInvoice = prepareServerInvoice;
})();
