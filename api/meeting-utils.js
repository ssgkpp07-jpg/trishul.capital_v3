export const DEFAULT_MEETING_AVAILABILITY = {
  timezone: 'Asia/Kolkata',
  duration_minutes: 30,
  buffer_minutes: 15,
  weekly_hours: [
    { day: 1, enabled: true, start: '09:00', end: '17:00' },
    { day: 2, enabled: true, start: '09:00', end: '17:00' },
    { day: 3, enabled: true, start: '09:00', end: '17:00' },
    { day: 4, enabled: true, start: '09:00', end: '17:00' },
    { day: 5, enabled: true, start: '09:00', end: '15:00' },
    { day: 6, enabled: false, start: '09:00', end: '17:00' },
    { day: 0, enabled: false, start: '09:00', end: '17:00' }
  ]
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SLOT_STEP_MINUTES = 30;

export function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function validateMeetingAvailability(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Meeting availability settings are required.');
  if (!isValidTimeZone(input.timezone)) throw new Error('Choose a valid time zone.');
  const duration = Number(input.duration_minutes);
  if (![15, 30, 45, 60, 90, 120].includes(duration)) throw new Error('Meeting duration must be 15, 30, 45, 60, 90, or 120 minutes.');
  const buffer = Number(input.buffer_minutes);
  if (![0, 5, 10, 15, 30].includes(buffer)) throw new Error('Meeting buffer must be 0, 5, 10, 15, or 30 minutes.');
  if (!Array.isArray(input.weekly_hours) || input.weekly_hours.length !== 7) throw new Error('Availability must include all seven days of the week.');
  const days = new Set();
  const weeklyHours = input.weekly_hours.map(item => {
    const day = Number(item?.day);
    if (!Number.isInteger(day) || day < 0 || day > 6 || days.has(day)) throw new Error('Availability contains an invalid or repeated weekday.');
    days.add(day);
    if (typeof item.enabled !== 'boolean') throw new Error('Set each weekday to available or unavailable.');
    if (!TIME_PATTERN.test(item.start || '') || !TIME_PATTERN.test(item.end || '') || item.start >= item.end) {
      throw new Error('Choose valid start and end times for each available day.');
    }
    return { day, enabled: item.enabled, start: item.start, end: item.end };
  });
  return {
    timezone: input.timezone,
    duration_minutes: duration,
    buffer_minutes: buffer,
    weekly_hours: weeklyHours.sort((left, right) => left.day - right.day)
  };
}

function parseDate(value) {
  const match = DATE_PATTERN.exec(String(value || ''));
  if (!match) throw new Error('Choose a valid calendar date.');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Choose a valid calendar date.');
  }
  return { year, month, day };
}

export function addCalendarDays(value, days) {
  const { year, month, day } = parseDate(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

export function zonedDateTimeToUtc(dateValue, timeValue, timeZone) {
  const { year, month, day } = parseDate(dateValue);
  const timeMatch = TIME_PATTERN.exec(String(timeValue || ''));
  if (!timeMatch || !isValidTimeZone(timeZone)) throw new Error('Choose a valid date, time, and time zone.');
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const targetTimestamp = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetTimestamp;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const local = zonedParts(new Date(timestamp), timeZone);
    const representedTimestamp = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const nextTimestamp = targetTimestamp - (representedTimestamp - timestamp);
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }
  const resolved = zonedParts(new Date(timestamp), timeZone);
  if (resolved.date !== dateValue || resolved.time !== timeValue) {
    throw new Error('That local time does not exist in the selected time zone.');
  }
  return new Date(timestamp);
}

function eventRange(event, timeZone) {
  const startValue = event.start?.dateTime || event.start?.date;
  const endValue = event.end?.dateTime || event.end?.date;
  if (!startValue || !endValue) return null;
  const start = event.start.dateTime ? new Date(startValue) : zonedDateTimeToUtc(startValue, '00:00', timeZone);
  const end = event.end.dateTime ? new Date(endValue) : zonedDateTimeToUtc(endValue, '00:00', timeZone);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return { start: start.getTime(), end: end.getTime(), id: event.id };
}

export function buildAvailableMeetingSlots({
  startDate,
  endDate,
  availability,
  events = [],
  bookings = [],
  clientTimeZone = availability.timezone,
  now = new Date(),
  excludeEventId = ''
}) {
  parseDate(startDate);
  parseDate(endDate);
  if (startDate > endDate) throw new Error('The availability date range is invalid.');
  if (!isValidTimeZone(clientTimeZone)) throw new Error('Choose a valid time zone.');

  const eventRanges = events.map(event => eventRange(event, availability.timezone)).filter(Boolean);
  const bookingRanges = bookings
    .filter(booking => ['pending', 'confirmed'].includes(booking.status))
    .map(booking => ({
      start: new Date(booking.start_at).getTime(),
      end: new Date(booking.end_at).getTime(),
      id: booking.google_event_id
    }))
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end));
  const reservedRanges = [...eventRanges, ...bookingRanges];
  const bufferMs = availability.buffer_minutes * 60_000;
  const durationMs = availability.duration_minutes * 60_000;
  const lastHostDate = zonedParts(
    new Date(zonedDateTimeToUtc(endDate, '23:59', clientTimeZone).getTime() + 2 * 86_400_000),
    availability.timezone
  ).date;
  let hostDate = zonedParts(new Date(now.getTime() - 2 * 86_400_000), availability.timezone).date;
  const slotsByDate = new Map();

  while (hostDate <= lastHostDate) {
    const weekday = new Date(`${hostDate}T00:00:00.000Z`).getUTCDay();
    const rule = availability.weekly_hours.find(item => item.day === weekday);
    if (rule?.enabled) {
      const [startHour, startMinute] = rule.start.split(':').map(Number);
      const [endHour, endMinute] = rule.end.split(':').map(Number);
      const windowStart = startHour * 60 + startMinute;
      const windowEnd = endHour * 60 + endMinute;
      for (let minuteOfDay = windowStart; minuteOfDay + availability.duration_minutes <= windowEnd; minuteOfDay += SLOT_STEP_MINUTES) {
        const localStart = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
        const localEndMinutes = minuteOfDay + availability.duration_minutes;
        const localEnd = `${String(Math.floor(localEndMinutes / 60)).padStart(2, '0')}:${String(localEndMinutes % 60).padStart(2, '0')}`;
        let start;
        let end;
        try {
          start = zonedDateTimeToUtc(hostDate, localStart, availability.timezone);
          end = zonedDateTimeToUtc(hostDate, localEnd, availability.timezone);
        } catch {
          continue;
        }
        if (start <= now) continue;
        const clientDate = zonedParts(start, clientTimeZone).date;
        if (clientDate < startDate || clientDate > endDate) continue;
        const startMs = start.getTime();
        const endMs = end.getTime();
        const busy = reservedRanges.some(range => range.id !== excludeEventId
          && range.end > startMs - bufferMs && range.start < endMs + bufferMs);
        if (busy) continue;
        if (!slotsByDate.has(clientDate)) slotsByDate.set(clientDate, []);
        slotsByDate.get(clientDate).push({ start_at: start.toISOString(), end_at: end.toISOString() });
      }
    }
    hostDate = addCalendarDays(hostDate, 1);
  }

  return [...slotsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, slots]) => ({ date, slots }));
}
