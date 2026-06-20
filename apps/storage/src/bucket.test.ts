import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { deleteObjects, deleteObjectsUnderPrefix, getObjectStream } from "./bucket.js";

type SentCommand = { name: string; input: Record<string, unknown> };

function fakeClient(options?: {
  listPages?: Array<{ keys: string[]; next?: string }>;
  deleteResponse?: (input: Record<string, unknown>) => unknown;
}) {
  const sent: SentCommand[] = [];
  let pageIndex = 0;
  const client = {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      if (command instanceof ListObjectsV2Command) {
        const pages = options?.listPages ?? [{ keys: [] as string[] }];
        const page = pages[pageIndex] ?? { keys: [] as string[] };
        pageIndex += 1;
        return {
          Contents: page.keys.map((Key) => ({ Key })),
          NextContinuationToken: page.next,
        };
      }
      if (command instanceof DeleteObjectsCommand) {
        return options?.deleteResponse ? options.deleteResponse(command.input) : {};
      }
      if (command instanceof GetObjectCommand) {
        return { Body: Readable.from([Buffer.from("ok")]) };
      }
      throw new Error(`unexpected command ${command.constructor.name}`);
    },
  };
  return { client: client as unknown as S3Client, sent };
}

function deletedKeys(sent: SentCommand[]): string[] {
  return sent
    .filter((c) => c.name === "DeleteObjectsCommand")
    .flatMap((c) => {
      const del = c.input.Delete as { Objects: Array<{ Key: string }> };
      return del.Objects.map((o) => o.Key);
    });
}

describe("deleteObjects", () => {
  it("sends nothing for an empty key list", async () => {
    const { client, sent } = fakeClient();
    await deleteObjects({ client, bucket: "b", keys: [] });
    assert.equal(sent.length, 0);
  });

  it("deletes <=1000 keys in a single quiet batch", async () => {
    const { client, sent } = fakeClient();
    await deleteObjects({ client, bucket: "b", keys: ["k1", "k2", "k3"] });
    assert.equal(sent.length, 1);
    const cmd = sent[0]!;
    assert.equal(cmd.name, "DeleteObjectsCommand");
    const del = cmd.input.Delete as { Objects: Array<{ Key: string }>; Quiet: boolean };
    assert.deepEqual(del.Objects, [{ Key: "k1" }, { Key: "k2" }, { Key: "k3" }]);
    assert.equal(del.Quiet, true);
    assert.equal(cmd.input.Bucket, "b");
  });

  it("chunks more than 1000 keys into batches of at most 1000", async () => {
    const { client, sent } = fakeClient();
    const keys = Array.from({ length: 2300 }, (_, i) => `k${i}`);
    await deleteObjects({ client, bucket: "b", keys });
    assert.equal(sent.length, 3);
    const sizes = sent.map((c) => (c.input.Delete as { Objects: unknown[] }).Objects.length);
    assert.deepEqual(sizes, [1000, 1000, 300]);
    assert.deepEqual(deletedKeys(sent).sort(), [...keys].sort());
  });

  it("throws an aggregated error naming failed keys", async () => {
    const { client } = fakeClient({
      deleteResponse: () => ({ Errors: [{ Key: "k2", Code: "AccessDenied", Message: "nope" }] }),
    });
    await assert.rejects(
      deleteObjects({ client, bucket: "b", keys: ["k1", "k2", "k3"] }),
      /k2/,
    );
  });
});

describe("deleteObjectsUnderPrefix", () => {
  it("lists (paginated) then batch-deletes every key without any HEAD", async () => {
    const { client, sent } = fakeClient({
      listPages: [
        { keys: ["p/a", "p/b"], next: "tok" },
        { keys: ["p/c"] },
      ],
    });
    await deleteObjectsUnderPrefix({ client, bucket: "b", prefix: "p/" });
    assert.ok(!sent.some((c) => c.name === "HeadObjectCommand"), "must not HEAD objects");
    assert.deepEqual(deletedKeys(sent).sort(), ["p/a", "p/b", "p/c"]);
  });

  it("deletes nothing when the prefix is empty", async () => {
    const { client, sent } = fakeClient({ listPages: [{ keys: [] }] });
    await deleteObjectsUnderPrefix({ client, bucket: "b", prefix: "p/" });
    assert.ok(!sent.some((c) => c.name === "DeleteObjectsCommand"));
  });
});

describe("getObjectStream", () => {
  it("passes byte ranges through to S3 GetObject", async () => {
    const { client, sent } = fakeClient();
    const stream = await getObjectStream({
      client,
      bucket: "b",
      key: "video.mp4",
      range: "bytes=10-20",
    });
    for await (const chunk of stream) {
      assert.ok(chunk);
      // drain the stream
    }

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.name, "GetObjectCommand");
    assert.equal(sent[0]?.input.Bucket, "b");
    assert.equal(sent[0]?.input.Key, "video.mp4");
    assert.equal(sent[0]?.input.Range, "bytes=10-20");
  });
});
