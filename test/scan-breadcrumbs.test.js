import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  breadcrumb,
  readBreadcrumbSessions,
  startScanLog,
} from "../src/lib/scan-breadcrumbs.ts";

const STORAGE_KEY = "receipt-scan:log";
const store = new Map();

// The module reads `localStorage` lazily, so it only has to exist before the
// calls below rather than before the import.
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
};

/** Leaves the store holding one earlier page load. */
function seedPreviousLoad(id, entries) {
  store.set(STORAGE_KEY, JSON.stringify([{ id, entries }]));
}

function stepsOf(session) {
  return session.entries.map((entry) => entry.step);
}

beforeEach(() => {
  store.clear();
});

test("keeps one page load's steps in order", () => {
  startScanLog();
  breadcrumb("file:received", "bytes=1");

  const sessions = readBreadcrumbSessions();

  assert.equal(sessions.length, 1);
  assert.deepEqual(stepsOf(sessions[0]), ["scan:start", "file:received"]);
});

test("a reload's steps do not join the previous page load's", () => {
  // The reported shape of the crash: a run that stops mid-generation, then a
  // reload whose first recorded step is another model load.
  seedPreviousLoad(1, [
    { at: 2, step: "scan:start" },
    { at: 394, step: "worker:run:generate:begin" },
  ]);

  breadcrumb("worker:load:begin");

  const sessions = readBreadcrumbSessions();

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, 1);
  assert.deepEqual(stepsOf(sessions[0]), ["scan:start", "worker:run:generate:begin"]);
  assert.deepEqual(stepsOf(sessions[1]), ["worker:load:begin"]);
});

test("starting a scan leaves the previous page load intact", () => {
  seedPreviousLoad(1, [{ at: 394, step: "worker:run:generate:begin" }]);

  startScanLog();
  breadcrumb("file:received");

  const sessions = readBreadcrumbSessions();

  assert.deepEqual(stepsOf(sessions[0]), ["worker:run:generate:begin"]);
  assert.deepEqual(stepsOf(sessions[1]), ["scan:start", "file:received"]);
});

test("starting a second scan clears only this page load", () => {
  startScanLog();
  breadcrumb("file:received");
  startScanLog();
  breadcrumb("file:received", "bytes=2");

  const sessions = readBreadcrumbSessions();

  assert.equal(sessions.length, 1);
  assert.deepEqual(stepsOf(sessions[0]), ["scan:start", "file:received"]);
});

test("ignores a log written in the older format rather than misreading it", () => {
  // Before page loads were recorded the value was a bare list of steps, with
  // nothing to say which run they belonged to.
  store.set(STORAGE_KEY, JSON.stringify([{ at: 2, step: "scan:start" }]));

  assert.deepEqual(readBreadcrumbSessions(), []);

  breadcrumb("scan:start");

  const sessions = readBreadcrumbSessions();

  assert.equal(sessions.length, 1);
  assert.deepEqual(stepsOf(sessions[0]), ["scan:start"]);
});

test("drops the oldest page loads rather than growing without bound", () => {
  seedPreviousLoad(1, [{ at: 1, step: "scan:start" }]);

  for (const id of [2, 3, 4, 5]) {
    const stored = JSON.parse(store.get(STORAGE_KEY));
    stored.push({ id, entries: [{ at: 1, step: "scan:start" }] });
    store.set(STORAGE_KEY, JSON.stringify(stored));
  }

  breadcrumb("scan:start");

  const kept = readBreadcrumbSessions();

  assert.equal(kept.length, 3);
  assert.deepEqual(
    kept.map((session) => session.id),
    [4, 5, kept[2].id]
  );
  assert.deepEqual(stepsOf(kept[2]), ["scan:start"]);
});
