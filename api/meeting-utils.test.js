import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MEETING_AVAILABILITY,
  buildAvailableMeetingSlots,
  validateMeetingAvailability,
  zonedDateTimeToUtc
} from './meeting-utils.js';

const monday = '2026-06-22';
const beforeMonday = new Date('2026-06-19T00:00:00.000Z');

test('converts wall-clock times to UTC using the selected time zone', () => {
  assert.equal(zonedDateTimeToUtc(monday, '09:00', 'Asia/Kolkata').toISOString(), '2026-06-22T03:30:00.000Z');
  assert.equal(zonedDateTimeToUtc(monday, '09:00', 'America/New_York').toISOString(), '2026-06-22T13:00:00.000Z');
});

test('rejects invalid calendar dates, zones, and nonexistent daylight-saving times', () => {
  assert.throws(() => zonedDateTimeToUtc('2026-02-30', '09:00', 'UTC'), /valid calendar date/);
  assert.throws(() => zonedDateTimeToUtc(monday, '09:00', 'Not/A_Timezone'), /valid date, time, and time zone/);
  assert.throws(() => zonedDateTimeToUtc('2026-03-08', '02:30', 'America/New_York'), /does not exist/);
});

test('validates seven unique weekday rules and accepted meeting settings', () => {
  assert.equal(validateMeetingAvailability(DEFAULT_MEETING_AVAILABILITY).weekly_hours.length, 7);
  assert.throws(() => validateMeetingAvailability({
    ...DEFAULT_MEETING_AVAILABILITY,
    weekly_hours: DEFAULT_MEETING_AVAILABILITY.weekly_hours.slice(1)
  }), /all seven days/);
  assert.throws(() => validateMeetingAvailability({
    ...DEFAULT_MEETING_AVAILABILITY,
    duration_minutes: 20
  }), /duration must be/);
});

test('generates slots only inside the weekly window and avoids busy events plus buffers', () => {
  const slots = buildAvailableMeetingSlots({
    startDate: monday,
    endDate: monday,
    availability: DEFAULT_MEETING_AVAILABILITY,
    now: beforeMonday,
    events: [{
      id: 'existing',
      start: { dateTime: '2026-06-22T10:00:00+05:30' },
      end: { dateTime: '2026-06-22T10:30:00+05:30' }
    }]
  });
  const times = slots[0].slots.map(slot => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(slot.start_at)));
  assert.equal(times.length, 13);
  assert.ok(times.includes('09:00'));
  assert.ok(!times.includes('09:30'));
  assert.ok(!times.includes('10:00'));
  assert.ok(!times.includes('10:30'));
  assert.ok(times.includes('11:00'));
  assert.ok(times.includes('16:30'));
  assert.ok(!times.includes('17:00'));
});

test('rescheduling ignores the current Google event and booking reservation', () => {
  const event = {
    id: 'current-event',
    start: { dateTime: '2026-06-22T09:00:00+05:30' },
    end: { dateTime: '2026-06-22T09:30:00+05:30' }
  };
  const slots = buildAvailableMeetingSlots({
    startDate: monday,
    endDate: monday,
    availability: DEFAULT_MEETING_AVAILABILITY,
    now: beforeMonday,
    events: [event],
    bookings: [{
      google_event_id: 'current-event',
      start_at: '2026-06-22T03:30:00.000Z',
      end_at: '2026-06-22T04:00:00.000Z',
      status: 'confirmed'
    }],
    excludeEventId: 'current-event'
  });
  assert.equal(slots[0].slots[0].start_at, '2026-06-22T03:30:00.000Z');
});

test('groups slots by the client time zone when it differs from the host', () => {
  const slots = buildAvailableMeetingSlots({
    startDate: '2026-06-21',
    endDate: '2026-06-21',
    availability: DEFAULT_MEETING_AVAILABILITY,
    clientTimeZone: 'America/Los_Angeles',
    now: beforeMonday
  });
  assert.equal(slots[0].date, '2026-06-21');
  assert.equal(slots[0].slots[0].start_at, '2026-06-22T03:30:00.000Z');
});
