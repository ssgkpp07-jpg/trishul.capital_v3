import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMeetingRequest } from './meetings.js';

function responseStub() {
  return {
    statusCode: 0,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('admin meeting routes reject requests without an authenticated admin subject', async () => {
  const response = responseStub();
  await handleMeetingRequest(
    { method: 'GET' },
    response,
    {},
    '/api/admin/meetings/availability'
  );
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { message: 'Unauthorized' });
});

test('meeting handler leaves unrelated API routes to the main API router', async () => {
  const result = await handleMeetingRequest(
    { method: 'GET' },
    responseStub(),
    {},
    '/api/health'
  );
  assert.equal(result, false);
});
