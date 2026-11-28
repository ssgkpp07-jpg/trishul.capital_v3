(() => {
  const nav = document.getElementById('adminNavigation');
  const app = document.getElementById('app');
  if (!nav || !app) return;

  const styles = document.createElement('style');
  styles.textContent = `
    #meetingsPanel{padding:0}
    .meetings-toolbar,.meetings-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .meetings-toolbar{justify-content:space-between;margin:16px 0}
    .meetings-toolbar button,.meetings-actions button{width:auto;margin:0}
    .meetings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .meetings-card{padding:16px;border:1px solid #252e3a;border-radius:9px;background:#11161f}
    .meetings-card h3{margin:0 0 10px;color:#efc24c}
    .meetings-card p{color:#91a0b7}
    .meetings-connect{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .meetings-connect button,.meetings-actions .meetings-danger{width:auto}
    .meetings-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}
    .meetings-form-grid label,.meetings-week-row label{display:block;color:#aab7ca;font-size:12px}
    .meetings-form-grid input,.meetings-form-grid select,.meetings-form-grid textarea{width:100%;margin:5px 0;padding:10px}
    .meetings-week{display:grid;gap:7px}
    .meetings-week-row{display:grid;grid-template-columns:minmax(90px,1fr) 1.4fr 1fr 1fr;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #252e3a}
    .meetings-week-row input[type=checkbox]{width:auto;margin:0}
    .meetings-week-row .meetings-day{display:flex;align-items:center;gap:8px}
    .meetings-week-row input[type=time]{width:100%;margin:0;padding:8px}
    .meetings-subnav{display:flex;gap:8px;flex-wrap:nowrap;overflow-x:auto;margin:18px 0;border-bottom:1px solid #29313d}
    .meetings-subnav button{width:auto;flex:0 0 auto;white-space:nowrap;margin:0;padding:12px 16px;background:transparent;color:#aab7ca;border:0;border-bottom:2px solid transparent;border-radius:0}
    .meetings-subnav button[aria-selected=true]{color:#f0c95e;border-bottom-color:#d8b143}
    .meetings-view.hidden{display:none}
    .meetings-calendar-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:14px;align-items:start}
    .meetings-calendar-sidebar,.meetings-calendar-card,.meetings-agenda-card{padding:14px;border:1px solid #252e3a;border-radius:9px;background:#11161f}
    .meetings-mini-month-head{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:12px}
    .meetings-mini-month-head strong{font-size:13px}
    .meetings-mini-month-head button{width:28px;padding:4px;background:transparent;color:#efc24c}
    .meetings-mini-weekdays,.meetings-mini-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;text-align:center}
    .meetings-mini-weekdays{margin-bottom:5px;color:#8995a8;font-size:10px}
    .meetings-mini-days button{aspect-ratio:1;min-width:0;margin:0;padding:0;border:1px solid transparent;border-radius:5px;background:transparent;color:#cbd2dc;font-size:11px}
    .meetings-mini-days button:hover,.meetings-mini-days button.in-selected-week{border-color:#514522;background:#211b0d}
    .meetings-mini-days button.is-today{border-color:#f0c95e;background:#34280c;color:#fff4c2;box-shadow:0 0 7px #f4d47b99,0 0 15px #d6ad4355}
    .meetings-mini-days button:focus-visible{outline:2px solid #d8b143;outline-offset:1px}
    .meetings-calendar-legend{display:grid;gap:8px;margin-top:12px;color:#aab7ca;font-size:11px}
    .meetings-legend-dot{display:inline-block;width:9px;height:9px;margin-right:7px;border-radius:2px;background:#9f7a29}
    .meetings-legend-dot.event{background:#d6ad43}
    .meetings-calendar-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
    .meetings-calendar-toolbar h3{margin:0;font-size:14px}
    .meetings-calendar-toolbar .meetings-actions{justify-content:flex-end}
    .meetings-calendar-toolbar .meetings-actions button{padding:7px 9px;font-size:11px}
    .meetings-calendar-scroll{max-height:min(70vh,720px);overflow:auto}
    .meetings-calendar-grid{min-width:680px}
    .meetings-week-head{display:grid;grid-template-columns:52px repeat(7,minmax(0,1fr));border-bottom:1px solid #303746}
    .meetings-week-day{text-align:center;padding:8px 2px;color:#9da9b9;font-size:10px}
    .meetings-week-day strong{display:grid;place-items:center;width:30px;height:30px;margin:5px auto 0;border-radius:50%;color:#e5eaf2;font-size:14px}
    .meetings-week-day strong.is-today{background:#d8b143;color:#16120a;box-shadow:0 0 10px #f4d47b88}
    .meetings-week-body{display:grid;grid-template-columns:52px 1fr}
    .meetings-time-labels{display:grid;grid-template-rows:repeat(12,48px);color:#8e9bad;font-size:10px;text-align:right;padding-right:7px}
    .meetings-time-labels span{transform:translateY(-7px)}
    .meetings-week-columns{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
    .meetings-week-column{position:relative;height:576px;border-left:1px solid #252e3a;background:repeating-linear-gradient(to bottom,transparent 0,transparent 47px,#28313d 47px,#28313d 48px)}
    .meetings-availability-block{position:absolute;left:3px;right:3px;padding:5px 4px;overflow:hidden;border-left:2px solid #b78d38;border-radius:3px;background:#9f7a292b;color:#dfc578;font-size:10px;line-height:1.35}
    .meetings-calendar-event{position:absolute;z-index:1;left:3px;right:3px;overflow:hidden;padding:5px;border-left:3px solid #f4d47b;border-radius:3px;background:#66501fcc;color:#fff0b0;font-size:10px;line-height:1.35}
    .meetings-calendar-event.external{border-left-color:#61b8dc;background:#126084cc;color:#e3f6ff}
    .meetings-calendar-footnote{margin:9px 0 0;color:#8290a3;font-size:11px}
    .meetings-agenda-card{margin-top:14px}
    .meetings-agenda-card h3{margin:0 0 10px;color:#efc24c}
    .meetings-agenda-day{padding:11px 0;border-top:1px solid #252e3a}
    .meetings-agenda-day>strong{color:#efc24c}
    .meetings-connection-status{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    .meetings-connection-status strong{color:#dce5f1}
    .meetings-connection-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#32d583;box-shadow:0 0 5px #32d583,0 0 12px #32d58399;animation:meetings-connected-pulse 1.8s ease-in-out infinite}
    @keyframes meetings-connected-pulse{0%,100%{box-shadow:0 0 4px #32d58399,0 0 9px #32d58355}50%{box-shadow:0 0 8px #32d583,0 0 17px #32d583bb}}
    @media(prefers-reduced-motion:reduce){.meetings-connection-dot{animation:none}}
    .meetings-list{display:grid;gap:8px}
    .meetings-event{display:flex;justify-content:space-between;gap:12px;padding:12px;border:1px solid #252e3a;border-radius:7px;background:#0d1219}
    .meetings-event p{margin:4px 0;color:#91a0b7}
    .meetings-event strong{color:#e5eaf2}
    .meetings-event .meetings-actions{justify-content:flex-end;align-items:flex-start}
    .meetings-event .meetings-actions button{padding:7px 10px;font-size:11px}
    .meetings-notice{margin:10px 0}
    .meetings-dialog{width:min(650px,calc(100vw - 28px));max-height:90vh;overflow:auto;padding:22px;background:#11161f;color:#e5eaf2;border:1px solid #424b59;border-radius:10px}
    .meetings-dialog::backdrop{background:#000c}
    .meetings-dialog h2{margin:0}
    .meetings-dialog label{display:block;margin:10px 0 4px;color:#aab7ca;font-size:12px}
    .meetings-dialog input,.meetings-dialog select,.meetings-dialog textarea{width:100%;margin:0;padding:10px}
    .meetings-dialog textarea{min-height:90px}
    .meetings-dialog .meetings-actions{justify-content:flex-end;margin-top:16px}
    .meetings-dialog .meetings-actions button{width:auto}
    .meetings-dialog .meetings-error{color:#ffb4a9}
    @media(max-width:1000px){.meetings-calendar-layout{grid-template-columns:1fr}.meetings-calendar-sidebar{max-width:280px}}
    @media(max-width:850px){.meetings-grid{grid-template-columns:1fr}}
    @media(max-width:600px){.meetings-week-row{grid-template-columns:1fr 1fr 1fr}.meetings-week-row .meetings-day{grid-column:1/-1}.meetings-event{flex-direction:column}.meetings-event .meetings-actions{justify-content:flex-start}.meetings-form-grid{grid-template-columns:1fr}.meetings-calendar-toolbar{align-items:flex-start;flex-direction:column}.meetings-calendar-toolbar .meetings-actions{justify-content:flex-start}.meetings-calendar-sidebar{max-width:none}}
  `;
  document.head.append(styles);

  const panel = document.createElement('section');
  panel.id = 'meetingsPanel';
  panel.className = 'hidden';
  panel.innerHTML = `
    <div class="bar"><div><h2>Meetings &amp; availability</h2><p class="muted">Manage your Google Calendar connection, weekly availability, scheduled meetings, and time off.</p></div></div>
    <section class="meetings-card">
      <div class="meetings-connect"><div><h3>Google Calendar</h3><p id="meetingsConnectionStatus" class="muted">Checking connection…</p></div>
        <div class="meetings-actions"><button type="button" id="meetingsConnect">Connect Google Calendar</button><button type="button" id="meetingsDisconnect" class="danger hidden">Disconnect</button></div>
      </div>
      <p class="muted">Google sends calendar invitations and creates a Google Meet link for each confirmed booking.</p>
    </section>
    <nav class="meetings-subnav" role="tablist" aria-label="Meetings pages">
      <button type="button" role="tab" id="meetingsCalendarTab" aria-selected="true" aria-controls="meetingsCalendarView" data-meetings-tab="calendar">Calendar</button>
      <button type="button" role="tab" id="meetingsAvailabilityTab" aria-selected="false" aria-controls="meetingsAvailabilityView" data-meetings-tab="availability">Weekly availability</button>
    </nav>
    <div id="meetingsMessage" class="notice meetings-notice hidden" role="status"></div>
    <section id="meetingsCalendarView" class="meetings-view" role="tabpanel" aria-labelledby="meetingsCalendarTab">
      <div class="meetings-toolbar">
        <div><h3>Calendar</h3><p id="meetingsCalendarRange" class="muted"></p></div>
        <div class="meetings-actions"><button type="button" id="meetingsPrevious" aria-label="Previous week">Previous</button><button type="button" id="meetingsToday">Today</button><button type="button" id="meetingsNext" aria-label="Next week">Next</button><button type="button" id="meetingsRefresh">Refresh</button><button type="button" id="meetingsSchedule" disabled>Schedule a meeting</button></div>
      </div>
      <div class="meetings-calendar-layout">
        <aside class="meetings-calendar-sidebar" aria-label="Calendar month and legend">
          <div class="meetings-mini-month-head"><button type="button" id="meetingsPreviousMonth" aria-label="Previous month">‹</button><strong id="meetingsMiniMonthTitle"></strong><button type="button" id="meetingsNextMonth" aria-label="Next month">›</button></div>
          <div class="meetings-mini-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
          <div id="meetingsMiniCalendar" class="meetings-mini-days"></div>
          <div class="meetings-calendar-legend"><span><i class="meetings-legend-dot"></i>Weekly availability</span><span><i class="meetings-legend-dot event"></i>Calendar event</span></div>
        </aside>
        <section class="meetings-calendar-card" aria-label="Weekly calendar">
          <div class="meetings-calendar-toolbar"><h3 id="meetingsWeekTitle">Week</h3><div class="meetings-actions"><button type="button" id="meetingsBlockTimeOff" class="portfolio-action">Block time off</button></div></div>
          <div id="meetingsCalendar" aria-live="polite"></div>
        </section>
      </div>
      <section class="meetings-agenda-card">
        <h3>Events this week</h3>
        <div id="meetingsAgenda" class="meetings-list"></div>
      </section>
    </section>
    <section id="meetingsAvailabilityView" class="meetings-view hidden" role="tabpanel" aria-labelledby="meetingsAvailabilityTab">
      <div class="meetings-grid">
        <section class="meetings-card">
          <h3>Weekly availability</h3>
          <div class="meetings-form-grid">
            <label>Host time zone<select id="meetingsTimezone"></select></label>
            <label>Meeting length<select id="meetingsDuration"><option>15</option><option>30</option><option>45</option><option>60</option><option>90</option><option>120</option></select></label>
            <label>Buffer between meetings<select id="meetingsBuffer"><option>0</option><option>5</option><option>10</option><option>15</option><option>30</option></select></label>
          </div>
          <div id="meetingsWeeklyHours" class="meetings-week"></div>
          <div class="meetings-actions"><button type="button" id="meetingsSaveAvailability">Save availability</button></div>
        </section>
        <section class="meetings-card">
          <h3>Block time off</h3><p>Time-off entries appear busy on Google Calendar and hide overlapping booking slots.</p>
          <form id="meetingsTimeOffForm">
            <label>Title<input name="title" maxlength="120" value="Unavailable"></label>
            <div class="meetings-form-grid"><label>Start date<input name="start_date" type="date" required></label><label>Start time<input name="start_time" type="time" required></label>
              <label>End date<input name="end_date" type="date" required></label><label>End time<input name="end_time" type="time" required></label></div>
            <div class="meetings-actions"><button type="submit">Block time</button></div>
          </form>
        </section>
      </div>
    </section>
    <dialog id="meetingsBookingDialog" class="meetings-dialog">
      <form id="meetingsBookingForm">
        <h2 id="meetingsDialogTitle">Schedule a meeting</h2>
        <p id="meetingsDialogHelp" class="muted"></p>
        <div id="meetingsAttendeeFields">
          <label>Meeting title<input name="title" maxlength="160" required></label>
          <div class="meetings-form-grid"><label>Attendee name<input name="attendee_name" maxlength="120" required></label><label>Attendee email<input name="attendee_email" type="email" maxlength="254" required></label></div>
          <label>Notes<textarea name="notes" maxlength="2000"></textarea></label>
        </div>
        <div class="meetings-form-grid"><label>Date<input name="date" type="date" required></label><label>Available time<select name="slot" required></select></label></div>
        <p id="meetingsDialogError" class="meetings-error hidden" role="alert"></p>
        <div class="meetings-actions"><button type="button" id="meetingsDialogCancel" class="portfolio-action">Cancel</button><button type="submit" id="meetingsDialogSubmit">Schedule meeting</button></div>
      </form>
    </dialog>
  `;
  const billingPanel = document.getElementById('billingPanel');
  app.insertBefore(panel, billingPanel || document.getElementById('permanentDeletePanel'));

  const navButton = document.createElement('button');
  navButton.type = 'button';
  navButton.textContent = 'Meetings';
  navButton.dataset.navIcon = 'calendar';
  navButton.addEventListener('click', () => window.showAdminPanel('meetingsPanel', navButton, 'Meetings'));
  const portfolioButton = [...nav.querySelectorAll('button')].find(button => button.textContent.trim() === 'Portfolio');
  const billingButton = nav.querySelector('[data-nav-icon="billing"]');
  (billingButton || portfolioButton || nav.lastElementChild).after(navButton);

  const originalShowAdminPanel = window.showAdminPanel;
  window.showAdminPanel = (id, button, title) => {
    if (id !== 'meetingsPanel') panel.classList.add('hidden');
    if (id === 'meetingsPanel') {
      for (const element of app.children) {
        if (element.id && element.id !== 'meetingsPanel' && element.id !== 'adminNavigation' && element.id !== 'adminMenuToggle') {
          element.classList.add('hidden');
        }
      }
      panel.classList.remove('hidden');
      nav.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
      document.getElementById('adminCurrentPage').textContent = title;
      nav.classList.remove('mobile-open');
      document.getElementById('adminMenuToggle').setAttribute('aria-expanded', 'false');
      document.getElementById('adminMenuToggle').setAttribute('aria-label', 'Open admin menu');
      loadMeetings();
      return;
    }
    return originalShowAdminPanel(id, button, title);
  };

  const apiBase = (window.TRISHUL_API_URL || '').replace(/\/$/, '');
  const apiRequest = async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem('trishul_admin_token') || ''}`,
        ...(options.headers || {})
      }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Meeting request failed.');
    return result;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const $ = id => document.getElementById(id);
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const defaultAvailability = {
    timezone: 'Asia/Kolkata',
    duration_minutes: 30,
    buffer_minutes: 15,
    weekly_hours: [
      { day: 0, enabled: false, start: '09:00', end: '17:00' },
      { day: 1, enabled: true, start: '09:00', end: '17:00' },
      { day: 2, enabled: true, start: '09:00', end: '17:00' },
      { day: 3, enabled: true, start: '09:00', end: '17:00' },
      { day: 4, enabled: true, start: '09:00', end: '17:00' },
      { day: 5, enabled: true, start: '09:00', end: '15:00' },
      { day: 6, enabled: false, start: '09:00', end: '17:00' }
    ]
  };
  const timezoneNames = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Kolkata', 'UTC'];
  const timezoneSelect = $('meetingsTimezone');
  [...new Set([...timezoneNames, 'Asia/Kolkata', 'UTC', Intl.DateTimeFormat().resolvedOptions().timeZone])]
    .sort()
    .forEach(timeZone => timezoneSelect.add(new Option(timeZone, timeZone)));
  $('meetingsWeeklyHours').innerHTML = DAY_NAMES.map((dayName, day) => `
    <div class="meetings-week-row" data-day="${day}">
      <label class="meetings-day"><input type="checkbox" data-week-enabled>${dayName}</label>
      <span class="muted">Available</span>
      <label>From<input type="time" data-week-start></label>
      <label>Until<input type="time" data-week-end></label>
    </div>`).join('');

  const dateParts = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  };
  const addDays = (dateValue, count) => {
    const date = new Date(`${dateValue}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  };
  const startOfWeek = dateValue => addDays(dateValue, -new Date(`${dateValue}T12:00:00Z`).getUTCDay());
  const shiftMonth = (dateValue, amount) => {
    const date = new Date(`${dateValue}T12:00:00Z`);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + amount);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    return date.toISOString().slice(0, 10);
  };
  const todayHostDate = () => dateParts(new Date(), availability?.timezone || 'Asia/Kolkata');
  const formatDate = dateValue => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${dateValue}T12:00:00Z`));
  const formatTime = (dateValue, timeZone) => new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(dateValue));
  const minutesInTimezone = (dateValue, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(dateValue));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Number(values.hour) * 60 + Number(values.minute);
  };
  const message = (text, isError = false) => {
    $('meetingsMessage').textContent = text;
    $('meetingsMessage').classList.toggle('hidden', !text);
    $('meetingsMessage').classList.toggle('permanent-warning', isError);
  };
  let availability = defaultAvailability;
  let calendarWeekStart = '';
  let calendarData = null;
  let calendarConnected = false;
  let dialogMode = 'create';
  let reschedulingBookingId = '';
  let dialogSlotRequest = 0;
  let callbackNotice = null;

  function renderAvailability(value) {
    availability = value;
    timezoneSelect.value = value.timezone;
    $('meetingsDuration').value = String(value.duration_minutes);
    $('meetingsBuffer').value = String(value.buffer_minutes);
    for (const row of $('meetingsWeeklyHours').querySelectorAll('[data-day]')) {
      const rule = value.weekly_hours.find(item => item.day === Number(row.dataset.day));
      row.querySelector('[data-week-enabled]').checked = Boolean(rule?.enabled);
      row.querySelector('[data-week-start]').value = rule?.start || '09:00';
      row.querySelector('[data-week-end]').value = rule?.end || '17:00';
    }
  }

  function readAvailability() {
    return {
      timezone: timezoneSelect.value,
      duration_minutes: Number($('meetingsDuration').value),
      buffer_minutes: Number($('meetingsBuffer').value),
      weekly_hours: [...$('meetingsWeeklyHours').querySelectorAll('[data-day]')].map(row => ({
        day: Number(row.dataset.day),
        enabled: row.querySelector('[data-week-enabled]').checked,
        start: row.querySelector('[data-week-start]').value,
        end: row.querySelector('[data-week-end]').value
      }))
    };
  }

  async function loadConnection() {
    calendarConnected = false;
    $('meetingsSchedule').disabled = true;
    const connection = await apiRequest('/api/admin/meetings/google-calendar');
    calendarConnected = Boolean(connection.connected);
    $('meetingsConnectionStatus').classList.toggle('meetings-connection-status', calendarConnected);
    $('meetingsConnectionStatus').innerHTML = calendarConnected
      ? `Connected as <strong>${escapeHtml(connection.email)}</strong><span class="meetings-connection-dot" title="Google Calendar connected" aria-label="Connected"></span>`
      : 'Not connected. Connect the Google account that owns the calendar.';
    $('meetingsConnect').classList.toggle('hidden', connection.connected);
    $('meetingsDisconnect').classList.toggle('hidden', !connection.connected);
    $('meetingsSchedule').disabled = !calendarConnected;
    $('meetingsSchedule').title = calendarConnected ? '' : 'Connect Google Calendar before scheduling.';
    return connection;
  }

  async function loadAvailability() {
    const result = await apiRequest('/api/admin/meetings/availability');
    renderAvailability(result.availability);
    return result.availability;
  }

  function calendarEvents(data) {
    const bookingByEventId = new Map((data.bookings || []).filter(item => item.google_event_id).map(item => [item.google_event_id, item]));
    const records = (data.bookings || [])
      .filter(booking => ['pending', 'confirmed'].includes(booking.status))
      .map(booking => ({
        type: 'booking',
        id: booking.id,
        eventId: booking.google_event_id,
        title: booking.attendee_name || booking.title,
        detail: booking.attendee_email,
        start: booking.start_at,
        end: booking.end_at,
        meetUrl: booking.meet_url,
        booking
      }));
    for (const event of data.events || []) {
      if (bookingByEventId.has(event.id)) continue;
      const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00.000Z` : '');
      const end = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00.000Z` : '');
      if (start && end) records.push({
        type: 'event',
        id: event.id,
        title: event.summary,
        detail: 'Google Calendar event',
        start,
        end,
        meetUrl: event.meet_url
      });
    }
    return records.sort((left, right) => new Date(left.start) - new Date(right.start));
  }

  function renderCalendar(data) {
    calendarData = data;
    const timezone = data.timezone || availability.timezone;
    const events = calendarEvents(data);
    const grouped = new Map();
    for (let offset = 0; offset < 7; offset += 1) grouped.set(addDays(calendarWeekStart, offset), []);
    for (const event of events) {
      const date = dateParts(new Date(event.start), timezone);
      if (grouped.has(date)) grouped.get(date).push(event);
    }
    const weekEnd = addDays(calendarWeekStart, 6);
    $('meetingsCalendarRange').textContent = `${formatDate(calendarWeekStart)} – ${formatDate(weekEnd)} · ${timezone}`;
    $('meetingsWeekTitle').textContent = `${formatDate(calendarWeekStart)} – ${formatDate(weekEnd)}`;

    const monthDate = new Date(`${calendarWeekStart}T12:00:00Z`);
    const year = monthDate.getUTCFullYear();
    const month = monthDate.getUTCMonth();
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    $('meetingsMiniMonthTitle').textContent = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(monthDate);
    const miniDays = [
      ...Array.from({ length: firstWeekday }, () => '<span aria-hidden="true"></span>'),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const dateValue = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateValue === todayHostDate();
        const inSelectedWeek = dateValue >= calendarWeekStart && dateValue <= weekEnd;
        const label = escapeHtml(formatDate(dateValue));
        return `<button type="button" data-calendar-date="${dateValue}" aria-label="${label}" aria-pressed="${inSelectedWeek}"${isToday ? ' aria-current="date"' : ''} class="${isToday ? 'is-today ' : ''}${inSelectedWeek ? 'in-selected-week' : ''}">${day}</button>`;
      })
    ];
    while (miniDays.length % 7) miniDays.push('<span aria-hidden="true"></span>');
    $('meetingsMiniCalendar').innerHTML = miniDays.join('');
    $('meetingsMiniCalendar').querySelectorAll('[data-calendar-date]').forEach(button => button.addEventListener('click', () => {
      calendarWeekStart = startOfWeek(button.dataset.calendarDate);
      updateCalendar().catch(error => message(error.message, true));
    }));

    const startHour = 7;
    const endHour = 19;
    const hourHeight = 48;
    const dayDates = Array.from({ length: 7 }, (_, offset) => addDays(calendarWeekStart, offset));
    const weekHeader = dayDates.map(dateValue => {
      const dayIndex = new Date(`${dateValue}T12:00:00Z`).getUTCDay();
      const dayNumber = Number(dateValue.slice(-2));
      const isToday = dateValue === todayHostDate();
      return `<div class="meetings-week-day">${DAY_NAMES[dayIndex].slice(0, 3).toUpperCase()}<strong class="${isToday ? 'is-today' : ''}">${dayNumber}</strong></div>`;
    }).join('');
    const timeLabels = Array.from({ length: endHour - startHour }, (_, offset) => {
      const hour = startHour + offset;
      const labelHour = hour % 12 || 12;
      return `<span>${labelHour} ${hour < 12 ? 'AM' : 'PM'}</span>`;
    }).join('');
    const weekColumns = dayDates.map(dateValue => {
      const weekday = new Date(`${dateValue}T12:00:00Z`).getUTCDay();
      const rule = availability.weekly_hours?.find(item => item.day === weekday);
      let availabilityBlock = '';
      if (rule?.enabled) {
        const [startHourValue, startMinuteValue] = rule.start.split(':').map(Number);
        const [endHourValue, endMinuteValue] = rule.end.split(':').map(Number);
        const start = startHourValue * 60 + startMinuteValue;
        const end = endHourValue * 60 + endMinuteValue;
        const visibleStart = Math.max(start, startHour * 60);
        const visibleEnd = Math.min(end, endHour * 60);
        if (visibleEnd > visibleStart) {
          const top = ((visibleStart - startHour * 60) / 60) * hourHeight;
          const height = ((visibleEnd - visibleStart) / 60) * hourHeight;
          availabilityBlock = `<div class="meetings-availability-block" style="top:${top}px;height:${height}px">Available<br>${escapeHtml(rule.start)}–${escapeHtml(rule.end)}</div>`;
        }
      }
      const eventBlocks = (grouped.get(dateValue) || []).map(event => {
        const startDate = dateParts(new Date(event.start), timezone);
        const endDate = dateParts(new Date(event.end), timezone);
        const start = minutesInTimezone(event.start, timezone);
        const end = endDate === startDate ? minutesInTimezone(event.end, timezone) : 24 * 60;
        const visibleStart = Math.max(start, startHour * 60);
        const visibleEnd = Math.min(Math.max(end, start + 15), endHour * 60);
        if (visibleEnd <= visibleStart) return '';
        const top = ((visibleStart - startHour * 60) / 60) * hourHeight;
        const height = Math.max(26, ((visibleEnd - visibleStart) / 60) * hourHeight);
        const type = event.type === 'booking' ? 'booking' : 'external';
        return `<article class="meetings-calendar-event ${type}" style="top:${top}px;height:${height}px" title="${escapeHtml(event.title)}"><strong>${escapeHtml(event.title || 'Calendar event')}</strong><br>${escapeHtml(formatTime(event.start, timezone))}</article>`;
      }).join('');
      return `<div class="meetings-week-column" data-week-date="${dateValue}">${availabilityBlock}${eventBlocks}</div>`;
    }).join('');
    $('meetingsCalendar').innerHTML = `
      <div class="meetings-calendar-scroll">
        <div class="meetings-calendar-grid">
          <div class="meetings-week-head"><span></span>${weekHeader}</div>
          <div class="meetings-week-body">
            <div class="meetings-time-labels">${timeLabels}</div>
            <div class="meetings-week-columns">${weekColumns}</div>
          </div>
        </div>
      </div>
      <p class="meetings-calendar-footnote">${calendarConnected ? 'Times shown in ' + escapeHtml(timezone) + '.' : 'Connect Google Calendar to load live events. Availability shown is your saved weekly schedule.'}</p>`;

    $('meetingsAgenda').innerHTML = [...grouped.entries()].map(([date, items]) => `
      <section class="meetings-agenda-day">
        <strong>${escapeHtml(formatDate(date))}</strong>
        <div class="meetings-list" style="margin-top:8px">
          ${items.length ? items.map(event => `
            <article class="meetings-event">
              <div><strong>${escapeHtml(formatTime(event.start, timezone))}–${escapeHtml(formatTime(event.end, timezone))} · ${escapeHtml(event.title)}</strong>
                <p>${escapeHtml(event.detail)}</p>
                ${event.meetUrl ? `<p><a href="${escapeHtml(event.meetUrl)}" target="_blank" rel="noopener">Google Meet link</a></p>` : ''}
              </div>
              ${event.type === 'booking' ? `<div class="meetings-actions">
                <button type="button" data-reschedule="${escapeHtml(event.id)}">Reschedule</button>
                <button type="button" class="danger meetings-danger" data-cancel="${escapeHtml(event.id)}">Cancel</button>
              </div>` : ''}
            </article>`).join('') : '<p class="muted">No meetings or calendar events.</p>'}
        </div>
      </section>`).join('');
    $('meetingsAgenda').querySelectorAll('[data-reschedule]').forEach(button => button.addEventListener('click', () => {
      const booking = (data.bookings || []).find(item => String(item.id) === button.dataset.reschedule);
      if (booking) loadWeekForBooking(booking).catch(error => message(error.message, true));
    }));
    $('meetingsAgenda').querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', () => cancelMeeting(button.dataset.cancel)));
  }

  async function loadCalendar() {
    const endDate = addDays(calendarWeekStart, 6);
    const query = new URLSearchParams({ start_date: calendarWeekStart, end_date: endDate });
    const data = await apiRequest(`/api/admin/meetings/calendar?${query}`);
    renderCalendar(data);
  }

  async function updateCalendar() {
    if (calendarConnected) return loadCalendar();
    renderCalendar({ bookings: [], events: [], timezone: availability.timezone });
  }

  async function loadMeetings() {
    message(callbackNotice?.text || '', callbackNotice?.error || false);
    if (!calendarWeekStart) calendarWeekStart = startOfWeek(todayHostDate());
    renderCalendar({ bookings: [], events: [], timezone: availability.timezone });
    try {
      const [connection] = await Promise.all([loadConnection(), loadAvailability()]);
      if (connection.connected) {
        await loadCalendar();
      } else {
        renderCalendar({ bookings: [], events: [], timezone: availability.timezone });
      }
    } catch (error) {
      message(error.message, true);
    }
  }

  async function populateSlotOptions(selectedStart = '') {
    const requestId = ++dialogSlotRequest;
    $('meetingsDialogError').classList.add('hidden');
    const date = $('meetingsBookingForm').elements.date.value;
    const select = $('meetingsBookingForm').elements.slot;
    select.innerHTML = '<option value="">Loading available times…</option>';
    select.disabled = true;
    const query = new URLSearchParams({ start_date: date, end_date: date, time_zone: availability.timezone });
    let result;
    try {
      result = await apiRequest(`/api/public/meetings/availability?${query}`);
    } catch (error) {
      if (requestId !== dialogSlotRequest) return;
      throw error;
    }
    if (requestId !== dialogSlotRequest) return;
    const slots = result.slots.find(item => item.date === date)?.slots || [];
    select.innerHTML = slots.map(slot => {
      const label = `${formatTime(slot.start_at, availability.timezone)} – ${formatTime(slot.end_at, availability.timezone)}`;
      return `<option value="${escapeHtml(slot.start_at)}" data-end="${escapeHtml(slot.end_at)}">${escapeHtml(label)}</option>`;
    }).join('') || '<option value="">No available times</option>';
    select.disabled = !slots.length;
    if (selectedStart) {
      const selectedTime = new Date(selectedStart).getTime();
      const match = [...select.options].find(option => new Date(option.value).getTime() === selectedTime);
      if (match) select.value = match.value;
    }
  }

  async function openBookingDialog(mode, booking = null) {
    if (!calendarData) return;
    dialogMode = mode;
    reschedulingBookingId = booking ? String(booking.id) : '';
    const form = $('meetingsBookingForm');
    const dialog = $('meetingsBookingDialog');
    $('meetingsDialogError').classList.add('hidden');
    $('meetingsDialogTitle').textContent = mode === 'reschedule' ? 'Reschedule meeting' : 'Schedule a meeting';
    $('meetingsDialogHelp').textContent = `Times shown in ${availability.timezone}. Guests receive an updated calendar invitation.`;
    $('meetingsAttendeeFields').classList.toggle('hidden', mode === 'reschedule');
    $('meetingsAttendeeFields').querySelectorAll('input,textarea').forEach(input => {
      input.disabled = mode === 'reschedule';
    });
    $('meetingsDialogSubmit').textContent = mode === 'reschedule' ? 'Save new time' : 'Schedule meeting';
    const dateInput = form.elements.date;
    dateInput.min = todayHostDate();
    dateInput.max = addDays(todayHostDate(), 44);
    const selectedDate = booking ? dateParts(new Date(booking.start_at), availability.timezone) : '';
    dateInput.value = selectedDate && selectedDate >= dateInput.min ? selectedDate : dateInput.min;
    if (mode === 'create') {
      form.reset();
      $('meetingsAttendeeFields').classList.remove('hidden');
      dateInput.min = todayHostDate();
      dateInput.max = addDays(todayHostDate(), 44);
      dateInput.value = dateInput.min;
      form.elements.title.value = 'Consultation meeting';
    }
    dialog.showModal();
    try {
      await populateSlotOptions(booking?.start_at || '');
    } catch (error) {
      $('meetingsDialogError').textContent = error.message;
      $('meetingsDialogError').classList.remove('hidden');
    }
  }

  async function loadWeekForBooking(booking) {
    const date = dateParts(new Date(booking.start_at), availability.timezone);
    calendarWeekStart = startOfWeek(date);
    await loadCalendar();
    await openBookingDialog('reschedule', booking);
  }

  async function cancelMeeting(id) {
    if (!window.confirm('Cancel this meeting and send an update to the guest?')) return;
    try {
      await apiRequest(`/api/admin/meetings/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      message('Meeting cancelled and the calendar invitation was updated.');
      await loadCalendar();
    } catch (error) {
      message(error.message, true);
    }
  }

  $('meetingsConnect').addEventListener('click', async () => {
    try {
      const result = await apiRequest('/api/admin/meetings/google-calendar/connect', { method: 'POST' });
      window.location.assign(result.authorization_url);
    } catch (error) {
      message(error.message, true);
    }
  });
  $('meetingsDisconnect').addEventListener('click', async () => {
    if (!window.confirm('Disconnect this Google Calendar? Existing events will remain in Google Calendar.')) return;
    try {
      const result = await apiRequest('/api/admin/meetings/google-calendar', { method: 'DELETE' });
      await loadConnection();
      await updateCalendar();
      message(result.warning ? `Disconnected locally. Google reported: ${result.warning}` : 'Google Calendar disconnected.');
    } catch (error) {
      message(error.message, true);
    }
  });
  $('meetingsSaveAvailability').addEventListener('click', async () => {
    try {
      const result = await apiRequest('/api/admin/meetings/availability', {
        method: 'PUT',
        body: JSON.stringify({ availability: readAvailability() })
      });
      renderAvailability(result.availability);
      if (calendarData) renderCalendar(calendarData);
      message('Weekly availability saved.');
    } catch (error) {
      message(error.message, true);
    }
  });
  $('meetingsPrevious').addEventListener('click', async () => {
    calendarWeekStart = addDays(calendarWeekStart, -7);
    try { await updateCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsNext').addEventListener('click', async () => {
    calendarWeekStart = addDays(calendarWeekStart, 7);
    try { await updateCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsToday').addEventListener('click', async () => {
    calendarWeekStart = startOfWeek(todayHostDate());
    try { await updateCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsPreviousMonth').addEventListener('click', async () => {
    calendarWeekStart = startOfWeek(shiftMonth(calendarWeekStart, -1));
    try { await updateCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsNextMonth').addEventListener('click', async () => {
    calendarWeekStart = startOfWeek(shiftMonth(calendarWeekStart, 1));
    try { await updateCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsRefresh').addEventListener('click', loadMeetings);
  $('meetingsSchedule').addEventListener('click', () => openBookingDialog('create').catch(error => message(error.message, true)));
  const setMeetingsTab = tabName => {
    const showAvailability = tabName === 'availability';
    $('meetingsCalendarTab').setAttribute('aria-selected', String(!showAvailability));
    $('meetingsAvailabilityTab').setAttribute('aria-selected', String(showAvailability));
    $('meetingsCalendarView').classList.toggle('hidden', showAvailability);
    $('meetingsAvailabilityView').classList.toggle('hidden', !showAvailability);
  };
  document.querySelectorAll('[data-meetings-tab]').forEach(button => {
    button.addEventListener('click', () => setMeetingsTab(button.dataset.meetingsTab));
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const nextTab = button.dataset.meetingsTab === 'calendar' ? 'availability' : 'calendar';
      setMeetingsTab(nextTab);
      $(`meetings${nextTab === 'calendar' ? 'Calendar' : 'Availability'}Tab`).focus();
    });
  });
  $('meetingsBlockTimeOff').addEventListener('click', () => {
    setMeetingsTab('availability');
    $('meetingsTimeOffForm').elements.start_date.focus();
  });
  $('meetingsDialogCancel').addEventListener('click', () => $('meetingsBookingDialog').close());
  $('meetingsBookingForm').elements.date.addEventListener('change', () => {
    populateSlotOptions().catch(error => {
      $('meetingsDialogError').textContent = error.message;
      $('meetingsDialogError').classList.remove('hidden');
    });
  });
  $('meetingsBookingForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const selected = form.elements.slot.selectedOptions[0];
    if (!selected?.value) {
      $('meetingsDialogError').textContent = 'Choose an available time.';
      $('meetingsDialogError').classList.remove('hidden');
      return;
    }
    const body = {
      start_at: selected.value,
      end_at: selected.dataset.end
    };
    if (dialogMode === 'create') {
      body.title = form.elements.title.value;
      body.attendee_name = form.elements.attendee_name.value;
      body.attendee_email = form.elements.attendee_email.value;
      body.notes = form.elements.notes.value;
    }
    try {
      await apiRequest(dialogMode === 'reschedule'
        ? `/api/admin/meetings/bookings/${encodeURIComponent(reschedulingBookingId)}`
        : '/api/admin/meetings/bookings', {
        method: dialogMode === 'reschedule' ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });
      $('meetingsBookingDialog').close();
      message(dialogMode === 'reschedule' ? 'Meeting rescheduled and invitation updated.' : 'Meeting scheduled and invitation sent.');
      await loadCalendar();
    } catch (error) {
      $('meetingsDialogError').textContent = error.message;
      $('meetingsDialogError').classList.remove('hidden');
    }
  });
  $('meetingsTimeOffForm').addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiRequest('/api/admin/meetings/time-off', { method: 'POST', body: JSON.stringify(values) });
      event.currentTarget.reset();
      message('Time off added to Google Calendar.');
      await updateCalendar();
    } catch (error) {
      message(error.message, true);
    }
  });

  const callbackStatus = new URLSearchParams(window.location.search).get('google_calendar');
  if (callbackStatus) {
    const statusMessages = {
      connected: 'Google Calendar connected successfully.',
      denied: 'Google Calendar access was not approved.',
      invalid_state: 'Google Calendar authorization expired or could not be verified. Connect again.',
      connection_failed: 'Google Calendar connection failed. Check the Vercel OAuth settings and try again.'
    };
    callbackNotice = {
      text: statusMessages[callbackStatus] || 'Google Calendar connection needs attention.',
      error: callbackStatus !== 'connected'
    };
    message(callbackNotice.text, callbackNotice.error);
    const url = new URL(window.location.href);
    url.searchParams.delete('google_calendar');
    window.history.replaceState({}, '', url);
  }
  window.loadMeetings = loadMeetings;
})();
