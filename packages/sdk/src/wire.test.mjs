// The wire fixtures: the tests that pin the sidecar protocol's line format.
//
// The wire format is a contract with a program on the other side of a pipe.
// These tests run the client's pure protocol helpers against byte-exact
// fixtures, so an accidental change to the envelope — a renamed field, a
// dropped newline, a reply split differently across chunks — fails here
// instead of in front of a UI that has just stopped understanding the
// sidecar.

import assert from "node:assert/strict";
import { test } from "node:test";

import { SidecarClientError, buildRequest, splitLines } from "./client.ts";

test("a request is one compact json object and one newline", () => {
  assert.equal(
    buildRequest(1, "list", {}),
    '{"id":1,"command":"list","params":{}}\n',
  );
});

test("a request keeps the params verbatim", () => {
  assert.equal(
    buildRequest(7, "set-override", { id: "work-1a2b", property: "screen.width", value: 1920 }),
    '{"id":7,"command":"set-override","params":{"id":"work-1a2b","property":"screen.width","value":1920}}\n',
  );
});

test("a reply split across chunks waits for the rest", () => {
  const first = splitLines("", '{"id":1,"ok":tr');
  assert.deepEqual(first.lines, []);
  assert.equal(first.rest, '{"id":1,"ok":tr');

  const second = splitLines(first.rest, 'ue,"result":{}}\n{"id":2,');
  assert.deepEqual(second.lines, ['{"id":1,"ok":true,"result":{}}']);
  assert.equal(second.rest, '{"id":2,');
});

test("a trailing newline is not a reply", () => {
  const { lines, rest } = splitLines("", '{"id":1,"ok":true}\n');
  assert.deepEqual(lines, ['{"id":1,"ok":true}']);
  assert.equal(rest, "");
});

test("several replies in one chunk all come through, in order", () => {
  const payload = '{"id":1,"ok":true}\n{"id":2,"ok":false}\n{"id":3,"ok":true}\n';
  const { lines, rest } = splitLines("", payload);
  assert.deepEqual(lines, ['{"id":1,"ok":true}', '{"id":2,"ok":false}', '{"id":3,"ok":true}']);
  assert.equal(rest, "");
});

test("the error shape carries the kind and the retry flag the ui branches on", () => {
  const error = new SidecarClientError({
    kind: "conflict",
    message: "the geo gate refused this launch",
    retryable: false,
  });
  assert.ok(error instanceof Error);
  assert.equal(error.name, "SidecarClientError");
  assert.equal(error.kind, "conflict");
  assert.equal(error.retryable, false);
  assert.equal(error.message, "the geo gate refused this launch");
});
