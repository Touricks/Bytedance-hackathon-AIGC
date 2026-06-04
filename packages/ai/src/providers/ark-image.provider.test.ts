import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { __setProviderConcurrencyForTests } from "../concurrency/provider-concurrency.js";
import { generateImagesWithArk } from "./ark-image.provider.js";

const cfg = {
  task: "image" as const,
  provider: "ark-seedream",
  apiKey: "test-key",
  endpointId: "ep-image",
  baseURL: "https://ark.example/v3"
};

interface CapturedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

function makeFetch(response: Response, captured: CapturedCall[]) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    let body: Record<string, unknown> | undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = undefined;
      }
    }
    captured.push({ url, method: init?.method ?? "GET", body });
    return response.clone();
  };
}

afterEach(() => {
  __setProviderConcurrencyForTests("image", undefined);
});

describe("generateImagesWithArk", () => {
  it("POSTs to /images/generations and returns candidates from data[]", async () => {
    const captured: CapturedCall[] = [];
    const response = new Response(
      JSON.stringify({
        model: "doubao-seedream-4.0",
        created: 1700000000,
        data: [
          { url: "https://cdn.example/1.png", size: "1600x2848" },
          { url: "https://cdn.example/2.png", size: "1600x2848" },
          { url: "https://cdn.example/3.png", size: "1600x2848" }
        ],
        usage: { generated_images: 3, output_tokens: 1234, total_tokens: 1234 }
      }),
      { status: 200 }
    );
    const fetchImpl = makeFetch(response, captured);

    const result = await generateImagesWithArk(
      { prompt: "a cinematic close-up", count: 3, aspectRatio: "9:16" },
      cfg,
      { fetch: fetchImpl as typeof fetch }
    );

    assert.equal(result.provider, "ark-seedream");
    assert.equal(result.model, "ep-image");
    assert.deepEqual(
      result.candidates.map((c) => c.imageUrl),
      [
        "https://cdn.example/1.png",
        "https://cdn.example/2.png",
        "https://cdn.example/3.png"
      ]
    );
    assert.equal(result.candidateErrors.length, 0);
    assert.equal(result.usage?.generatedImages, 3);

    assert.equal(captured.length, 1);
    const call = captured[0]!;
    assert.equal(call.url, "https://ark.example/v3/images/generations");
    assert.equal(call.method, "POST");
    assert.equal(call.body?.model, "ep-image");
    assert.equal(call.body?.prompt, "a cinematic close-up");
    assert.equal(call.body?.size, "1600x2848");
    assert.equal(call.body?.response_format, "url");
    assert.equal(call.body?.sequential_image_generation, "auto");
    assert.deepEqual(call.body?.sequential_image_generation_options, { max_images: 3 });
  });

  it("omits sequential_image_generation when count is 1", async () => {
    const captured: CapturedCall[] = [];
    const response = new Response(
      JSON.stringify({ data: [{ url: "https://cdn.example/only.png" }] }),
      { status: 200 }
    );
    const fetchImpl = makeFetch(response, captured);

    const result = await generateImagesWithArk(
      { prompt: "single shot", count: 1, aspectRatio: "16:9" },
      cfg,
      { fetch: fetchImpl as typeof fetch }
    );

    assert.equal(result.candidates.length, 1);
    const call = captured[0]!;
    assert.equal(call.body?.size, "2848x1600");
    assert.equal(call.body?.sequential_image_generation, undefined);
    assert.equal(call.body?.sequential_image_generation_options, undefined);
  });

  it("passes a single reference image as a string and multiple as an array", async () => {
    const capturedSingle: CapturedCall[] = [];
    await generateImagesWithArk(
      {
        prompt: "p",
        count: 1,
        aspectRatio: "1:1",
        referenceImageUrls: ["https://r/1.png"]
      },
      cfg,
      {
        fetch: makeFetch(
          new Response(JSON.stringify({ data: [{ url: "https://cdn.example/x.png" }] }), {
            status: 200
          }),
          capturedSingle
        ) as typeof fetch
      }
    );
    assert.equal(capturedSingle[0]!.body?.image, "https://r/1.png");

    const capturedMulti: CapturedCall[] = [];
    await generateImagesWithArk(
      {
        prompt: "p",
        count: 1,
        aspectRatio: "1:1",
        referenceImageUrls: ["https://r/1.png", "https://r/2.png"]
      },
      cfg,
      {
        fetch: makeFetch(
          new Response(JSON.stringify({ data: [{ url: "https://cdn.example/y.png" }] }), {
            status: 200
          }),
          capturedMulti
        ) as typeof fetch
      }
    );
    assert.deepEqual(capturedMulti[0]!.body?.image, [
      "https://r/1.png",
      "https://r/2.png"
    ]);
  });

  it("collects per-item errors from data[] without throwing", async () => {
    const captured: CapturedCall[] = [];
    const response = new Response(
      JSON.stringify({
        data: [
          { url: "https://cdn.example/ok.png" },
          { error: { code: "ContentReviewFailed", message: "blocked" } }
        ]
      }),
      { status: 200 }
    );
    const fetchImpl = makeFetch(response, captured);

    const result = await generateImagesWithArk(
      { prompt: "p", count: 2, aspectRatio: "9:16" },
      cfg,
      { fetch: fetchImpl as typeof fetch }
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidateErrors.length, 1);
    assert.equal(result.candidateErrors[0]!.code, "ContentReviewFailed");
  });

  it("throws on non-2xx HTTP", async () => {
    const captured: CapturedCall[] = [];
    const response = new Response("Internal Server Error", { status: 500 });
    const fetchImpl = makeFetch(response, captured);

    await assert.rejects(
      () =>
        generateImagesWithArk({ prompt: "p", count: 1, aspectRatio: "9:16" }, cfg, {
          fetch: fetchImpl as typeof fetch
        }),
      /Ark image generation failed \(500\)/
    );
  });

  it("retries retryable HTTP failures before returning candidates", async () => {
    const captured: CapturedCall[] = [];
    let calls = 0;
    const fetchImpl = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      calls += 1;
      const url = typeof input === "string" ? input : input.toString();
      captured.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      if (calls === 1) {
        return new Response("temporarily unavailable", { status: 500 });
      }
      return new Response(
        JSON.stringify({ data: [{ url: "https://cdn.example/retry-ok.png" }] }),
        { status: 200 },
      );
    };

    const result = await generateImagesWithArk(
      { prompt: "retry me", count: 1, aspectRatio: "16:9" },
      cfg,
      {
        fetch: fetchImpl as typeof fetch,
        maxRetries: 2,
        retryBaseMs: 1,
        random: () => 0,
        sleep: async () => undefined,
      },
    );

    assert.equal(calls, 2);
    assert.equal(result.candidates[0]?.imageUrl, "https://cdn.example/retry-ok.png");
    assert.equal(captured[0]?.url, "https://ark.example/v3/images/generations");
  });

  it("preserves transport error cause details after retry exhaustion", async () => {
    const err = new Error("fetch failed", {
      cause: { code: "ECONNRESET", message: "socket reset" },
    });
    let calls = 0;
    const fetchImpl = async (): Promise<Response> => {
      calls += 1;
      throw err;
    };

    await assert.rejects(
      () =>
        generateImagesWithArk(
          { prompt: "p", count: 1, aspectRatio: "9:16" },
          cfg,
          {
            fetch: fetchImpl as typeof fetch,
            maxRetries: 1,
            retryBaseMs: 1,
            random: () => 0,
            sleep: async () => undefined,
          },
        ),
      /ARK_IMAGE_TRANSPORT_ERROR: fetch failed .*cause.code=ECONNRESET/,
    );
    assert.equal(calls, 2);
  });

  it("aborts image provider requests that exceed the configured timeout", async () => {
    const fetchImpl = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    await assert.rejects(
      () =>
        generateImagesWithArk(
          { prompt: "p", count: 1, aspectRatio: "9:16" },
          cfg,
          {
            fetch: fetchImpl as typeof fetch,
            requestTimeoutMs: 1,
            maxRetries: 0,
          },
        ),
      /ARK_IMAGE_TRANSPORT_ERROR: request timed out after 1ms/,
    );
  });

  it("throws when the body returns a top-level error", async () => {
    const captured: CapturedCall[] = [];
    const response = new Response(
      JSON.stringify({ error: { code: "InvalidRequest", message: "bad prompt" } }),
      { status: 200 }
    );
    const fetchImpl = makeFetch(response, captured);

    await assert.rejects(
      () =>
        generateImagesWithArk({ prompt: "p", count: 1, aspectRatio: "9:16" }, cfg, {
          fetch: fetchImpl as typeof fetch
        }),
      /bad prompt/
    );
  });

  it("caps concurrent image provider calls", async () => {
    __setProviderConcurrencyForTests("image", 2);
    let active = 0;
    let maxInFlight = 0;

    const fetchImpl = async (): Promise<Response> => {
      active += 1;
      maxInFlight = Math.max(maxInFlight, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return new Response(
        JSON.stringify({ data: [{ url: "https://cdn.example/x.png" }] }),
        { status: 200 }
      );
    };

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        generateImagesWithArk(
          { prompt: `p${index}`, count: 1, aspectRatio: "9:16" },
          cfg,
          { fetch: fetchImpl as typeof fetch }
        )
      )
    );

    assert.equal(maxInFlight, 2);
  });
});
