import { createHmac, randomUUID } from 'node:crypto';
import {
  DEFAULT_MEETING_AVAILABILITY,
  addCalendarDays,
  buildAvailableMeetingSlots,
  isValidTimeZone,
  validateMeetingAvailability,
  zonedDateTimeToUtc,
  zonedParts
} from './meeting-utils.js';
import {
  MeetingApiError,
  buildGoogleAuthorizationUrl,
  createOAuthState,
  decryptRefreshToken,
  encryptRefreshToken,
  exchangeGoogleCode,
  getGoogleAccessToken,
  getGoogleIntegration,
  getGoogleUser,
  googleCalendarRequest,
  listGoogleCalendarEvents,
  revokeGoogleToken,
  sha256
} from './google-calendar.js';

const AVAILABILITY_KEY = 'meeting_availability';
const MAX_RANGE_DAYS = 44;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendError = (res, error) => {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  return res.status(status).json({
    message: error.expose ? error.message : 'Meeting request failed. Please try again.'
  });
};

function requestQuery(req, key) {
  const value = req.query?.[key];
  return typeof value === 'string' ? value : '';
}

function parseDateRange(req, timeZone, defaultDays = 6) {
  const today = zonedParts(new Date(), timeZone).date;
  const startDate = requestQuery(req, 'start_date') || today;
  const endDate = requestQuery(req, 'end_date') || addCalendarDays(startDate, defaultDays);
  const difference = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
  if (!Number.isInteger(difference) || difference < 0 || difference > MAX_RANGE_DAYS) {
    throw new MeetingApiError(`Choose a date range of ${MAX_RANGE_DAYS + 1} days or fewer.`);
  }
  const startAt = zonedDateTimeToUtc(startDate, '00:00', timeZone);
  const endAt = zonedDateTimeToUtc(addCalendarDays(endDate, 1), '00:00', timeZone);
  return { startDate, endDate, startAt, endAt };
}

async function getAvailability(supabase) {
  const { data, error } = await supabase.from('settings').select('value').eq('key', AVAILABILITY_KEY).maybeSingle();
  if (error) throw new MeetingApiError(`Could not load meeting availability: ${error.message}`, 500);
  if (!data?.value) return DEFAULT_MEETING_AVAILABILITY;
  try {
    return validateMeetingAvailability(JSON.parse(data.value));
  } catch {
    throw new MeetingApiError('Saved meeting availability is invalid. Update it in the admin Meetings panel.', 500);
  }
}

async function saveAvailability(supabase, input) {
  let availability;
  try {
    availability = validateMeetingAvailability(input);
  } catch (error) {
    throw new MeetingApiError(error.message);
  }
  const { error } = await supabase.from('settings').upsert({
    key: AVAILABILITY_KEY,
    value: JSON.stringify(availability)
  }, { onConflict: 'key' });
  if (error) throw new MeetingApiError(`Could not save meeting availability: ${error.message}`, 500);
  return availability;
}

async function getActiveBookings(supabase, startAt, endAt, excludeBookingId = '') {
  let query = supabase.from('meeting_bookings')
    .select('id,google_event_id,start_at,end_at,status')
    .in('status', ['pending', 'confirmed'])
    .lt('start_at', endAt.toISOString())
    .gt('end_at', startAt.toISOString());
  if (excludeBookingId) query = query.neq('id', excludeBookingId);
  const { data, error } = await query;
  if (error) throw new MeetingApiError(`Could not check existing meetings: ${error.message}`, 500);
  return data || [];
}

async function slotsForRange(supabase, availability, range, clientTimeZone, excludeEventId = '', excludeBookingId = '') {
  const accessToken = await getGoogleAccessToken(supabase);
  const bufferMs = availability.buffer_minutes * 60_000;
  const busyStart = new Date(range.startAt.getTime() - bufferMs);
  const busyEnd = new Date(range.endAt.getTime() + bufferMs);
  const [events, bookings] = await Promise.all([
    listGoogleCalendarEvents(accessToken, busyStart, busyEnd),
    getActiveBookings(supabase, busyStart, busyEnd, excludeBookingId)
  ]);
  return {
    accessToken,
    events,
    bookings,
    slots: buildAvailableMeetingSlots({
      startDate: range.startDate,
      endDate: range.endDate,
      availability,
      events,
      bookings,
      clientTimeZone,
      excludeEventId
    })
  };
}

function parseRequestedSlot(input, availability) {
  const start = new Date(input?.start_at);
  const end = new Date(input?.end_at);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    throw new MeetingApiError('Choose a valid meeting time.');
  }
  if (end.getTime() - start.getTime() !== availability.duration_minutes * 60_000) {
    throw new MeetingApiError('The selected meeting duration does not match the availability settings.');
  }
  return { startAt: start, endAt: end };
}

function getMatchingSlot(slots, startAt, endAt) {
  return slots.some(day => day.slots.some(slot =>
    new Date(slot.start_at).getTime() === startAt.getTime()
    && new Date(slot.end_at).getTime() === endAt.getTime()
  ));
}

function attendeeDetails(input) {
  const name = typeof input?.attendee_name === 'string' ? input.attendee_name.trim() : '';
  const email = typeof input?.attendee_email === 'string' ? input.attendee_email.trim().toLowerCase() : '';
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const notes = typeof input?.notes === 'string' ? input.notes.trim() : '';
  if (!name || name.length > 120) throw new MeetingApiError('Enter your name (up to 120 characters).');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new MeetingApiError('Enter a valid email address.');
  if (!title || title.length > 160) throw new MeetingApiError('Enter a meeting title (up to 160 characters).');
  if (notes.length > 2000) throw new MeetingApiError('Meeting notes must be 2,000 characters or fewer.');
  return { name, email, title, notes };
}

function googleDateTime(date, timeZone) {
  return { dateTime: date.toISOString(), timeZone };
}

async function waitForMeetLink(accessToken, event) {
  let current = event;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const video = current.conferenceData?.entryPoints?.find(entry => entry.entryPointType === 'video');
    const meetUrl = video?.uri || current.hangoutLink;
    if (meetUrl) return { event: current, meetUrl };
    if (attempt < 7) {
      await new Promise(resolve => setTimeout(resolve, 500));
      current = await googleCalendarRequest(accessToken, `/calendars/primary/events/${encodeURIComponent(event.id)}`);
    }
  }
  throw new MeetingApiError('Google created the calendar event but did not provide a Meet link. Try again or check the connected calendar settings.', 502);
}

async function markBookingFailed(supabase, bookingId) {
  const { error } = await supabase.from('meeting_bookings')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', bookingId);
  if (error) console.error('Could not mark failed meeting booking:', error);
}

async function createGoogleEvent(accessToken, booking, timeZone) {
  const query = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'all' });
  const event = await googleCalendarRequest(accessToken, `/calendars/primary/events?${query}`, {
    method: 'POST',
    body: {
      summary: booking.title,
      description: booking.notes || undefined,
      start: googleDateTime(booking.startAt, timeZone),
      end: googleDateTime(booking.endAt, timeZone),
      attendees: [{ email: booking.email, displayName: booking.name }],
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    }
  });
  try {
    return await waitForMeetLink(accessToken, event);
  } catch (error) {
    error.eventId = event.id;
    throw error;
  }
}

async function reserveBooking(supabase, booking, timeZone) {
  const { data, error } = await supabase.rpc('reserve_meeting_booking', {
    p_title: booking.title,
    p_attendee_name: booking.name,
    p_attendee_email: booking.email,
    p_notes: booking.notes,
    p_start_at: booking.startAt.toISOString(),
    p_end_at: booking.endAt.toISOString(),
    p_timezone: timeZone,
    p_buffer_minutes: booking.bufferMinutes
  });
  if (error) {
    if (error.code === '23P01') throw new MeetingApiError('That time was just booked. Refresh and choose another slot.', 409);
    throw new MeetingApiError(`Could not reserve the meeting time: ${error.message}`, 500);
  }
  return data;
}

async function confirmBooking(supabase, bookingId, event, meetUrl) {
  const { data, error } = await supabase.from('meeting_bookings')
    .update({
      google_event_id: event.id,
      meet_url: meetUrl,
      status: 'confirmed',
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .select('id,title,attendee_name,attendee_email,start_at,end_at,timezone,meet_url,status')
    .single();
  if (error) throw new MeetingApiError(`Could not confirm the meeting booking: ${error.message}`, 500);
  return data;
}

async function cleanupGoogleEvent(accessToken, eventId) {
  try {
    const query = new URLSearchParams({ sendUpdates: 'all' });
    await googleCalendarRequest(accessToken, `/calendars/primary/events/${encodeURIComponent(eventId)}?${query}`, { method: 'DELETE' });
  } catch (error) {
    console.error('Could not remove incomplete Google Calendar event:', error);
  }
}

async function consumeRateLimit(supabase, req, purpose, limit, windowMinutes) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = String(req.headers['x-real-ip'] || (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'unknown'))
    .split(',')[0].trim();
  const hmacKey = process.env.MEETING_RATE_LIMIT_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!hmacKey) throw new MeetingApiError('Meeting rate-limit configuration is missing.', 503);
  const ipHash = createHmac('sha256', hmacKey).update(`${purpose}:${ip}`).digest('hex');
  const { data, error } = await supabase.rpc('consume_meeting_booking_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: limit,
    p_window_minutes: windowMinutes
  });
  if (error) throw new MeetingApiError(`Could not check booking rate limit: ${error.message}`, 500);
  if (data !== true) {
    const message = purpose === 'booking'
      ? 'Too many booking attempts. Please try again in about an hour.'
      : 'Too many availability checks. Please wait a few minutes and try again.';
    throw new MeetingApiError(message, 429);
  }
}

async function publicAvailability(req, res, supabase) {
  await consumeRateLimit(supabase, req, 'availability', 60, 10);
  const availability = await getAvailability(supabase);
  const clientTimeZone = requestQuery(req, 'time_zone') || availability.timezone;
  if (!isValidTimeZone(clientTimeZone)) throw new MeetingApiError('Choose a valid time zone.');
  const range = parseDateRange(req, clientTimeZone, 13);
  const result = await slotsForRange(supabase, availability, range, clientTimeZone);
  return res.status(200).json({
    timezone: clientTimeZone,
    host_timezone: availability.timezone,
    duration_minutes: availability.duration_minutes,
    slots: result.slots
  });
}

async function createPublicBooking(req, res, supabase) {
  await consumeRateLimit(supabase, req, 'booking', 5, 60);
  const availability = await getAvailability(supabase);
  const details = attendeeDetails(req.body || {});
  const { startAt, endAt } = parseRequestedSlot(req.body || {}, availability);
  const clientTimeZone = requestQuery(req, 'time_zone')
    || (typeof req.body?.time_zone === 'string' ? req.body.time_zone : availability.timezone);
  if (!isValidTimeZone(clientTimeZone)) throw new MeetingApiError('Choose a valid time zone.');
  const localStartDate = zonedParts(startAt, clientTimeZone).date;
  const range = parseDateRange({ query: { start_date: localStartDate, end_date: localStartDate } }, clientTimeZone);
  const { accessToken, slots } = await slotsForRange(supabase, availability, range, clientTimeZone);
  if (!getMatchingSlot(slots, startAt, endAt)) {
    throw new MeetingApiError('That meeting time is no longer available. Refresh and choose another slot.', 409);
  }

  const booking = { ...details, startAt, endAt, bufferMinutes: availability.buffer_minutes };
  const bookingId = await reserveBooking(supabase, booking, availability.timezone);
  let createdEvent;
  try {
    const { event, meetUrl } = await createGoogleEvent(accessToken, booking, availability.timezone);
    createdEvent = event;
    const confirmed = await confirmBooking(supabase, bookingId, event, meetUrl);
    return res.status(201).json({
      booking: {
        id: confirmed.id,
        title: confirmed.title,
        attendee_name: confirmed.attendee_name,
        attendee_email: confirmed.attendee_email,
        start_at: confirmed.start_at,
        end_at: confirmed.end_at,
        timezone: confirmed.timezone,
        meet_url: confirmed.meet_url
      }
    });
  } catch (error) {
    if (createdEvent?.id || error.eventId) await cleanupGoogleEvent(accessToken, createdEvent?.id || error.eventId);
    await markBookingFailed(supabase, bookingId);
    throw error;
  }
}

async function adminCalendar(req, res, supabase) {
  const availability = await getAvailability(supabase);
  const range = parseDateRange(req, availability.timezone);
  const accessToken = await getGoogleAccessToken(supabase);
  const bufferMs = availability.buffer_minutes * 60_000;
  const busyStart = new Date(range.startAt.getTime() - bufferMs);
  const busyEnd = new Date(range.endAt.getTime() + bufferMs);
  const [events, bookings] = await Promise.all([
    listGoogleCalendarEvents(accessToken, busyStart, busyEnd),
    getActiveBookings(supabase, busyStart, busyEnd)
  ]);
  const slots = buildAvailableMeetingSlots({
    startDate: range.startDate,
    endDate: range.endDate,
    availability,
    events,
    bookings,
    clientTimeZone: availability.timezone
  });
  const { data: meetingBookings, error } = await supabase.from('meeting_bookings')
    .select('id,google_event_id,title,attendee_name,attendee_email,notes,start_at,end_at,timezone,meet_url,status')
    .lt('start_at', range.endAt.toISOString())
    .gt('end_at', range.startAt.toISOString())
    .order('start_at');
  if (error) throw new MeetingApiError(`Could not load meeting bookings: ${error.message}`, 500);
  return res.status(200).json({
    timezone: availability.timezone,
    availability,
    events: events.map(event => ({
      id: event.id,
      summary: event.summary || '(No title)',
      start: event.start,
      end: event.end,
      html_link: event.htmlLink || '',
      meet_url: event.hangoutLink || event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === 'video')?.uri || ''
    })),
    bookings: meetingBookings || [],
    busy_bookings: bookings,
    slots
  });
}

async function createAdminBooking(req, res, supabase) {
  const availability = await getAvailability(supabase);
  const details = attendeeDetails(req.body || {});
  const { startAt, endAt } = parseRequestedSlot(req.body || {}, availability);
  const localStartDate = zonedParts(startAt, availability.timezone).date;
  const range = parseDateRange({ query: { start_date: localStartDate, end_date: localStartDate } }, availability.timezone);
  const { accessToken, slots } = await slotsForRange(supabase, availability, range, availability.timezone);
  if (!getMatchingSlot(slots, startAt, endAt)) {
    throw new MeetingApiError('That meeting time is no longer available. Refresh the calendar and choose another slot.', 409);
  }
  const booking = { ...details, startAt, endAt, bufferMinutes: availability.buffer_minutes };
  const bookingId = await reserveBooking(supabase, booking, availability.timezone);
  let createdEvent;
  try {
    const { event, meetUrl } = await createGoogleEvent(accessToken, booking, availability.timezone);
    createdEvent = event;
    const confirmed = await confirmBooking(supabase, bookingId, event, meetUrl);
    return res.status(201).json({ booking: confirmed });
  } catch (error) {
    if (createdEvent?.id || error.eventId) await cleanupGoogleEvent(accessToken, createdEvent?.id || error.eventId);
    await markBookingFailed(supabase, bookingId);
    throw error;
  }
}

async function rescheduleBooking(req, res, supabase, bookingId) {
  const { data: booking, error } = await supabase.from('meeting_bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .maybeSingle();
  if (error) throw new MeetingApiError(`Could not load the meeting: ${error.message}`, 500);
  if (!booking) throw new MeetingApiError('Meeting was not found or is no longer active.', 404);
  const availability = await getAvailability(supabase);
  const { startAt, endAt } = parseRequestedSlot(req.body || {}, availability);
  const localStartDate = zonedParts(startAt, availability.timezone).date;
  const range = parseDateRange({ query: { start_date: localStartDate, end_date: localStartDate } }, availability.timezone);
  const { accessToken, slots } = await slotsForRange(
    supabase,
    availability,
    range,
    availability.timezone,
    booking.google_event_id,
    String(booking.id)
  );
  if (!getMatchingSlot(slots, startAt, endAt)) {
    throw new MeetingApiError('That meeting time is no longer available. Refresh the calendar and choose another slot.', 409);
  }

  const { data: previous, error: reserveError } = await supabase.rpc('reserve_meeting_reschedule', {
    p_booking_id: booking.id,
    p_start_at: startAt.toISOString(),
    p_end_at: endAt.toISOString(),
    p_buffer_minutes: availability.buffer_minutes
  });
  if (reserveError) {
    if (reserveError.code === '23P01') throw new MeetingApiError('That time was just booked. Refresh and choose another slot.', 409);
    throw new MeetingApiError(`Could not reserve the new meeting time: ${reserveError.message}`, 500);
  }
  const restoreBookingRecord = async (startAtValue, endAtValue) => {
    const { error } = await supabase.from('meeting_bookings')
      .update({
        start_at: startAtValue,
        end_at: endAtValue,
        status: 'confirmed',
        updated_at: new Date().toISOString()
      })
      .eq('id', booking.id);
    if (error) console.error('Could not restore meeting booking after failed reschedule:', error);
    return error;
  };
  const previousStartAt = previous?.start_at || booking.start_at;
  const previousEndAt = previous?.end_at || booking.end_at;
  const restoreGoogleEvent = async () => {
    const query = new URLSearchParams({ sendUpdates: 'all' });
    await googleCalendarRequest(accessToken, `/calendars/primary/events/${encodeURIComponent(booking.google_event_id)}?${query}`, {
      method: 'PATCH',
      body: {
        start: { dateTime: booking.start_at, timeZone: booking.timezone },
        end: { dateTime: booking.end_at, timeZone: booking.timezone }
      }
    });
  };
  let event;
  try {
    const query = new URLSearchParams({ sendUpdates: 'all' });
    event = await googleCalendarRequest(accessToken, `/calendars/primary/events/${encodeURIComponent(booking.google_event_id)}?${query}`, {
      method: 'PATCH',
      body: {
        start: googleDateTime(startAt, availability.timezone),
        end: googleDateTime(endAt, availability.timezone)
      }
    });
  } catch (error) {
    await restoreBookingRecord(previousStartAt, previousEndAt);
    throw error;
  }
  if (!event?.id) {
    await restoreBookingRecord(previousStartAt, previousEndAt);
    throw new MeetingApiError('Google did not confirm the rescheduled calendar event.', 502);
  }

  const { data, error: updateError } = await supabase.from('meeting_bookings')
    .update({ start_at: startAt.toISOString(), end_at: endAt.toISOString(), status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', booking.id)
    .select('id,title,attendee_name,attendee_email,start_at,end_at,timezone,meet_url,status')
    .single();
  if (updateError) {
    try {
      await restoreGoogleEvent();
    } catch (restoreError) {
      console.error('Could not restore Google Calendar event after meeting save failed:', restoreError);
      const { error: syncError } = await supabase.from('meeting_bookings')
        .update({
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', booking.id);
      if (syncError) console.error('Could not synchronize booking with updated Google Calendar event:', syncError);
      throw new MeetingApiError('Google Calendar was updated, but the booking could not be fully synchronized. Refresh the calendar and check the event time.', 500);
    }
    await restoreBookingRecord(previousStartAt, previousEndAt);
    throw new MeetingApiError(`Could not save the rescheduled meeting: ${updateError.message}`, 500);
  }
  return res.status(200).json({ booking: data });
}

async function cancelBooking(req, res, supabase, bookingId) {
  const { data: booking, error } = await supabase.from('meeting_bookings')
    .select('id,google_event_id,status')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw new MeetingApiError(`Could not load the meeting: ${error.message}`, 500);
  if (!booking) throw new MeetingApiError('Meeting was not found.', 404);
  if (booking.status === 'cancelled') return res.status(200).json({ ok: true, already_cancelled: true });
  if (booking.status !== 'confirmed' || !booking.google_event_id) {
    throw new MeetingApiError('Only confirmed meetings can be cancelled.', 409);
  }

  const accessToken = await getGoogleAccessToken(supabase);
  try {
    const query = new URLSearchParams({ sendUpdates: 'all' });
    await googleCalendarRequest(accessToken, `/calendars/primary/events/${encodeURIComponent(booking.google_event_id)}?${query}`, { method: 'DELETE' });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
  const { error: updateError } = await supabase.from('meeting_bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', booking.id);
  if (updateError) throw new MeetingApiError(`Google event was cancelled, but the booking record could not be updated: ${updateError.message}`, 500);
  return res.status(200).json({ ok: true });
}

async function createTimeOff(req, res, supabase) {
  const availability = await getAvailability(supabase);
  let startAt;
  let endAt;
  try {
    startAt = zonedDateTimeToUtc(req.body?.start_date, req.body?.start_time, availability.timezone);
    endAt = zonedDateTimeToUtc(req.body?.end_date, req.body?.end_time, availability.timezone);
  } catch {
    throw new MeetingApiError('Choose valid local start and end times in the host time zone.');
  }
  const summary = typeof req.body?.title === 'string' ? req.body.title.trim() : 'Unavailable';
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
    throw new MeetingApiError('Choose a valid start and end time for time off.');
  }
  if (!summary || summary.length > 120) throw new MeetingApiError('Enter a time-off title (up to 120 characters).');
  const accessToken = await getGoogleAccessToken(supabase);
  const query = new URLSearchParams({ sendUpdates: 'all' });
  const event = await googleCalendarRequest(accessToken, `/calendars/primary/events?${query}`, {
    method: 'POST',
    body: {
      summary,
      start: googleDateTime(startAt, availability.timezone),
      end: googleDateTime(endAt, availability.timezone),
      transparency: 'opaque'
    }
  });
  return res.status(201).json({
    event: {
      id: event.id,
      summary: event.summary,
      start: event.start,
      end: event.end
    }
  });
}

async function connectGoogleCalendar(req, res, supabase, adminSubject) {
  if (!adminSubject) throw new MeetingApiError('Unauthorized', 401);
  const { error: expiredStateError } = await supabase.from('google_calendar_oauth_states')
    .delete()
    .lt('expires_at', new Date().toISOString());
  if (expiredStateError) {
    throw new MeetingApiError(`Could not clean up expired Google authorization states: ${expiredStateError.message}`, 500);
  }
  const oauth = createOAuthState();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await supabase.from('google_calendar_oauth_states').insert({
    state_hash: oauth.stateHash,
    admin_subject: adminSubject,
    code_verifier: oauth.codeVerifier,
    expires_at: expiresAt
  });
  if (error) throw new MeetingApiError(`Could not start Google Calendar connection: ${error.message}`, 500);
  return res.status(200).json({ authorization_url: buildGoogleAuthorizationUrl(oauth) });
}

function redirectToAdmin(res, status) {
  res.setHeader('Location', `/admin/login?google_calendar=${status}`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(302).end();
}

async function googleCalendarCallback(req, res, supabase) {
  const code = requestQuery(req, 'code');
  const state = requestQuery(req, 'state');
  const errorCode = requestQuery(req, 'error');
  if (errorCode) return redirectToAdmin(res, 'denied');
  if (!code || !state) return redirectToAdmin(res, 'invalid_state');

  const { data: stateRecord, error } = await supabase.from('google_calendar_oauth_states')
    .delete()
    .eq('state_hash', sha256(state))
    .gt('expires_at', new Date().toISOString())
    .select('admin_subject,code_verifier')
    .maybeSingle();
  if (error) throw new MeetingApiError(`Could not verify Google Calendar authorization: ${error.message}`, 500);
  if (!stateRecord) return redirectToAdmin(res, 'invalid_state');

  try {
    const tokens = await exchangeGoogleCode(code, stateRecord.code_verifier);
    const grantedScopes = String(tokens.scope || '').split(' ').filter(Boolean);
    if (!grantedScopes.some(scope => [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar'
    ].includes(scope))) {
      throw new MeetingApiError('Google Calendar event access was not approved. Reconnect and allow Calendar access.', 502);
    }
    const user = await getGoogleUser(tokens.access_token);
    const existing = await getGoogleIntegration(supabase);
    const refreshToken = tokens.refresh_token
      || (existing?.connected_email?.toLowerCase() === user.email.toLowerCase()
        ? decryptRefreshToken(existing.refresh_token_encrypted)
        : '');
    if (!refreshToken) throw new MeetingApiError('Google did not provide a refresh token. Remove this app from your Google Account and connect again.', 502);
    const { error: saveError } = await supabase.from('google_calendar_integrations').upsert({
      id: 'primary',
      connected_email: user.email,
      refresh_token_encrypted: encryptRefreshToken(refreshToken),
      scopes: grantedScopes,
      connected_at: existing?.connected_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (saveError) throw new MeetingApiError(`Could not save Google Calendar connection: ${saveError.message}`, 500);
    return redirectToAdmin(res, 'connected');
  } catch (callbackError) {
    console.error('Google Calendar authorization failed:', callbackError);
    return redirectToAdmin(res, 'connection_failed');
  }
}

async function disconnectGoogleCalendar(req, res, supabase) {
  const integration = await getGoogleIntegration(supabase);
  if (!integration) return res.status(200).json({ connected: false });
  let warning = '';
  try {
    await revokeGoogleToken(decryptRefreshToken(integration.refresh_token_encrypted));
  } catch (error) {
    warning = error.message;
  }
  const { error } = await supabase.from('google_calendar_integrations').delete().eq('id', 'primary');
  if (error) throw new MeetingApiError(`Could not remove Google Calendar connection: ${error.message}`, 500);
  return res.status(200).json({ connected: false, warning });
}

export async function handleMeetingRequest(req, res, supabase, path, adminSubject = '') {
  try {
    if (req.method === 'GET' && path === '/api/google-calendar/callback') {
      return await googleCalendarCallback(req, res, supabase);
    }
    if (req.method === 'GET' && path === '/api/public/meetings/availability') {
      return await publicAvailability(req, res, supabase);
    }
    if (req.method === 'POST' && path === '/api/public/meetings/bookings') {
      return await createPublicBooking(req, res, supabase);
    }
    if (path.startsWith('/api/admin/meetings/')) {
      if (!adminSubject) return res.status(401).json({ message: 'Unauthorized' });
      if (req.method === 'GET' && path === '/api/admin/meetings/google-calendar') {
        const integration = await getGoogleIntegration(supabase);
        return res.status(200).json({
          connected: Boolean(integration),
          email: integration?.connected_email || '',
          connected_at: integration?.connected_at || ''
        });
      }
      if (req.method === 'POST' && path === '/api/admin/meetings/google-calendar/connect') {
        return await connectGoogleCalendar(req, res, supabase, adminSubject);
      }
      if (req.method === 'DELETE' && path === '/api/admin/meetings/google-calendar') {
        return await disconnectGoogleCalendar(req, res, supabase);
      }
      if (req.method === 'GET' && path === '/api/admin/meetings/availability') {
        return res.status(200).json({ availability: await getAvailability(supabase) });
      }
      if (req.method === 'PUT' && path === '/api/admin/meetings/availability') {
        const availability = await saveAvailability(supabase, req.body?.availability);
        return res.status(200).json({ availability });
      }
      if (req.method === 'GET' && path === '/api/admin/meetings/calendar') {
        return await adminCalendar(req, res, supabase);
      }
      if (req.method === 'POST' && path === '/api/admin/meetings/bookings') {
        return await createAdminBooking(req, res, supabase);
      }
      if (req.method === 'POST' && path === '/api/admin/meetings/time-off') {
        return await createTimeOff(req, res, supabase);
      }
      const bookingMatch = /^\/api\/admin\/meetings\/bookings\/(\d+)$/.exec(path);
      if (bookingMatch && req.method === 'PATCH') {
        return await rescheduleBooking(req, res, supabase, bookingMatch[1]);
      }
      if (bookingMatch && req.method === 'DELETE') {
        return await cancelBooking(req, res, supabase, bookingMatch[1]);
      }
    }
    return false;
  } catch (error) {
    console.error('Meeting API error:', error);
    return sendError(res, error);
  }
}
