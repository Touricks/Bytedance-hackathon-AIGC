import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReviewStateUrl,
  readReviewStateFromSearch
} from "./reviewState.js";

describe("review state URL helpers", () => {
  it("reads stable script and job ids from the browser query string", () => {
    assert.deepEqual(readReviewStateFromSearch("?scriptId=script-1&jobId=job-1"), {
      scriptId: "script-1",
      jobId: "job-1"
    });
  });

  it("writes stable script and job ids without losing the current path", () => {
    assert.equal(
      buildReviewStateUrl("http://localhost:5173/?foo=ignored", {
        scriptId: "script-2",
        jobId: "job-2"
      }),
      "http://localhost:5173/?scriptId=script-2&jobId=job-2"
    );
  });
});
