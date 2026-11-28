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
    @media(max-width:850px){.meetings-grid{grid-template-columns:1fr}}
    @media(max-width:600px){.meetings-week-row{grid-template-columns:1fr 1fr 1fr}.meetings-week-row .meetings-day{grid-column:1/-1}.meetings-event{flex-direction:column}.meetings-event .meetings-actions{justify-content:flex-start}.meetings-form-grid{grid-template-columns:1fr}}
  `;
  document.head.append(styles);

  const panel = document.createElement('section');
  panel.id = 'meetingsPanel';
  panel.className = 'hidden';
  panel.innerHTML = `
    <div class="bar"><div><h2>Meetings &amp; availability</h2><p class="muted">Manage your Google Calendar connection, weekly availability, scheduled meetings, and time off.</p></div></div>
    <div id="meetingsMessage" class="notice meetings-notice hidden" role="status"></div>
    <section class="meetings-card">
      <div class="meetings-connect"><div><h3>Google Calendar</h3><p id="meetingsConnectionStatus" class="muted">Checking connection…</p></div>
        <div class="meetings-actions"><button type="button" id="meetingsConnect">Connect Google Calendar</button><button type="button" id="meetingsDisconnect" class="danger hidden">Disconnect</button></div>
      </div>
      <p class="muted">Google sends calendar invitations and creates a Google Meet link for each confirmed booking.</p>
    </section>
    <div class="meetings-grid" style="margin-top:14px">
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
    <section class="meetings-card" style="margin-top:14px">
      <div class="meetings-toolbar"><div><h3>Calendar</h3><p id="meetingsCalendarRange" class="muted"></p></div>
        <div class="meetings-actions"><button type="button" id="meetingsPrevious">Previous 7 days</button><button type="button" id="meetingsToday">Today</button><button type="button" id="meetingsNext">Next 7 days</button><button type="button" id="meetingsRefresh">Refresh</button></div>
      </div>
      <div class="meetings-actions"><button type="button" id="meetingsSchedule">Schedule a meeting</button></div>
      <div id="meetingsCalendar" class="meetings-list" style="margin-top:12px"></div>
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
  navButton.addEventListener('click', () => window.showAdminPanel('meetingsPanel', navButton, 'Meetings'));
  const portfolioButton = [...nav.querySelectorAll('button')].find(button => button.textContent.trim() === 'Portfolio');
  (portfolioButton || nav.lastElementChild).after(navButton);

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
  const todayHostDate = () => dateParts(new Date(), availability?.timezone || 'Asia/Kolkata');
  const formatDate = dateValue => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${dateValue}T12:00:00Z`));
  const formatTime = (dateValue, timeZone) => new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(dateValue));
  const message = (text, isError = false) => {
    $('meetingsMessage').textContent = text;
    $('meetingsMessage').classList.toggle('hidden', !text);
    $('meetingsMessage').classList.toggle('permanent-warning', isError);
  };
  let availability = defaultAvailability;
  let calendarWeekStart = '';
  let calendarData = null;
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
    const connection = await apiRequest('/api/admin/meetings/google-calendar');
    $('meetingsConnectionStatus').textContent = connection.connected
      ? `Connected as ${connection.email}`
      : 'Not connected. Connect the Google account that owns the calendar.';
    $('meetingsConnect').classList.toggle('hidden', connection.connected);
    $('meetingsDisconnect').classList.toggle('hidden', !connection.connected);
  }

  async function loadAvailability() {
    const result = await apiRequest('/api/admin/meetings/availability');
    renderAvailability(result.availability);
  }

  function calendarEvents(data) {
    const bookingByEventId = new Map((data.bookings || []).filter(item => item.google_event_id).map(item => [item.google_event_id, item]));
    const records = (data.bookings || [])
      .filter(booking => ['pending', 'confirmed'].includes(booking.status))
      .map(booking => ({
        type: 'booking',
        id: booking.id,
        eventId: booking.google_event_id,
        title: booking.title,
        detail: `${booking.attendee_name} · ${booking.attendee_email}`,
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
    const timezone = data.timezone;
    const events = calendarEvents(data);
    const grouped = new Map();
    for (let offset = 0; offset < 7; offset += 1) grouped.set(addDays(calendarWeekStart, offset), []);
    for (const event of events) {
      const date = dateParts(new Date(event.start), timezone);
      if (grouped.has(date)) grouped.get(date).push(event);
    }
    $('meetingsCalendarRange').textContent = `${formatDate(calendarWeekStart)} – ${formatDate(addDays(calendarWeekStart, 6))} · ${timezone}`;
    $('meetingsCalendar').innerHTML = [...grouped.entries()].map(([date, items]) => `
      <section class="meetings-event" style="display:block">
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
    $('meetingsCalendar').querySelectorAll('[data-reschedule]').forEach(button => button.addEventListener('click', () => {
      const booking = data.bookings.find(item => String(item.id) === button.dataset.reschedule);
      if (booking) loadWeekForBooking(booking).catch(error => message(error.message, true));
    }));
    $('meetingsCalendar').querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', () => cancelMeeting(button.dataset.cancel)));
  }

  async function loadCalendar() {
    const endDate = addDays(calendarWeekStart, 6);
    const query = new URLSearchParams({ start_date: calendarWeekStart, end_date: endDate });
    const data = await apiRequest(`/api/admin/meetings/calendar?${query}`);
    renderCalendar(data);
  }

  async function loadMeetings() {
    message(callbackNotice?.text || '', callbackNotice?.error || false);
    try {
      if (!calendarWeekStart) calendarWeekStart = todayHostDate();
      await Promise.all([loadConnection(), loadAvailability()]);
      await loadCalendar();
    } catch (error) {
      message(error.message, true);
      $('meetingsCalendar').innerHTML = '<p class="muted">Connect Google Calendar and refresh to load meetings.</p>';
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
    calendarWeekStart = date;
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
      message('Weekly availability saved.');
    } catch (error) {
      message(error.message, true);
    }
  });
  $('meetingsPrevious').addEventListener('click', async () => {
    calendarWeekStart = addDays(calendarWeekStart, -7);
    try { await loadCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsNext').addEventListener('click', async () => {
    calendarWeekStart = addDays(calendarWeekStart, 7);
    try { await loadCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsToday').addEventListener('click', async () => {
    calendarWeekStart = todayHostDate();
    try { await loadCalendar(); } catch (error) { message(error.message, true); }
  });
  $('meetingsRefresh').addEventListener('click', loadMeetings);
  $('meetingsSchedule').addEventListener('click', () => openBookingDialog('create').catch(error => message(error.message, true)));
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
      await loadCalendar();
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
