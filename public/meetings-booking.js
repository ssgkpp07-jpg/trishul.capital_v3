(() => {
  const $ = id => document.getElementById(id);
  const apiBase = (window.TRISHUL_API_URL || '').replace(/\/$/, '');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const timezoneSelect = $('bookingTimezone');
  const timezoneNames = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['Asia/Kolkata', 'UTC'];
  [...new Set([...timezoneNames, zone, 'Asia/Kolkata', 'UTC'])].sort().forEach(timeZone => {
    timezoneSelect.add(new Option(timeZone, timeZone, timeZone === zone, timeZone === zone));
  });

  const localDate = date => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezoneSelect.value, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  };
  const showMessage = (text, type = '') => {
    const message = $('bookingMessage');
    message.textContent = text;
    message.classList.toggle('hidden', !text);
    message.classList.toggle('error', type === 'error');
    message.classList.toggle('success', type === 'success');
  };
  let selectedSlot = null;
  let loadingSlots = false;
  let slotRequestId = 0;

  async function loadSlots() {
    const requestId = ++slotRequestId;
    const date = $('bookingDate').value;
    selectedSlot = null;
    $('selectedStart').value = '';
    $('selectedEnd').value = '';
    $('submitBooking').disabled = true;
    $('submitBooking').textContent = 'Choose a time to continue';
    $('availableSlots').replaceChildren();
    showMessage('');
    if (!date) return;
    loadingSlots = true;
    $('slotStatus').textContent = 'Loading available times…';
    try {
      const query = new URLSearchParams({ start_date: date, end_date: date, time_zone: timezoneSelect.value });
      const response = await fetch(`${apiBase}/api/public/meetings/availability?${query}`);
      const result = await response.json().catch(() => ({}));
      if (requestId !== slotRequestId) return;
      if (!response.ok) throw new Error(result.message || 'Could not load available times.');
      const day = result.slots.find(item => item.date === date);
      if (!day?.slots?.length) {
        $('slotStatus').textContent = 'No times are available on this date. Please choose another date.';
        return;
      }
      $('slotStatus').textContent = `Available times · ${result.duration_minutes} minutes · ${result.timezone}`;
      const buttons = day.slots.map(slot => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'slot';
        button.textContent = new Intl.DateTimeFormat(undefined, { timeZone: timezoneSelect.value, hour: 'numeric', minute: '2-digit' }).format(new Date(slot.start_at));
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          selectedSlot = slot;
          $('selectedStart').value = slot.start_at;
          $('selectedEnd').value = slot.end_at;
          $('availableSlots').querySelectorAll('.slot').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
          $('submitBooking').disabled = false;
          $('submitBooking').textContent = 'Confirm meeting';
        });
        return button;
      });
      $('availableSlots').replaceChildren(...buttons);
    } catch (error) {
      if (requestId !== slotRequestId) return;
      $('slotStatus').textContent = 'Available times could not be loaded.';
      showMessage(error.message, 'error');
    } finally {
      if (requestId === slotRequestId) loadingSlots = false;
    }
  }

  function setDateBounds(preferredDate = $('bookingDate').value) {
    const today = localDate(new Date());
    const lastDate = (() => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 44);
      return date.toISOString().slice(0, 10);
    })();
    $('bookingDate').min = today;
    $('bookingDate').max = lastDate;
    $('bookingDate').value = preferredDate >= today && preferredDate <= lastDate ? preferredDate : today;
  }
  setDateBounds('');
  $('bookingDate').addEventListener('change', loadSlots);
  timezoneSelect.addEventListener('change', () => {
    setDateBounds($('bookingDate').value);
    loadSlots();
  });
  loadSlots();

  $('bookingForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedSlot || loadingSlots) {
      showMessage('Choose an available meeting time first.', 'error');
      return;
    }
    const submit = $('submitBooking');
    submit.disabled = true;
    submit.textContent = 'Scheduling…';
    showMessage('');
    try {
      const response = await fetch(`${apiBase}/api/public/meetings/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: $('meetingTitle').value,
          attendee_name: $('attendeeName').value,
          attendee_email: $('attendeeEmail').value,
          notes: $('meetingNotes').value,
          time_zone: timezoneSelect.value,
          start_at: selectedSlot.start_at,
          end_at: selectedSlot.end_at
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(result.message || 'Could not schedule the meeting.');
        error.status = response.status;
        throw error;
      }
      const booking = result.booking;
      $('bookingForm').classList.add('hidden');
      $('bookingConfirmation').classList.remove('hidden');
      $('bookingConfirmation').innerHTML = `
        <div class="notice success"><strong>Meeting confirmed.</strong><br>
          ${escapeHtml(booking.title)}<br>
          ${escapeHtml(new Intl.DateTimeFormat(undefined, { timeZone: booking.timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(booking.start_at)))}<br>
          Invitation sent to ${escapeHtml(booking.attendee_email)}.
          ${booking.meet_url ? `<p><a href="${escapeHtml(booking.meet_url)}" target="_blank" rel="noopener">Open Google Meet</a></p>` : ''}
        </div>`;
    } catch (error) {
      if (error.status === 409) await loadSlots();
      showMessage(error.message, 'error');
      submit.disabled = false;
      submit.textContent = 'Confirm meeting';
    }
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }
})();
