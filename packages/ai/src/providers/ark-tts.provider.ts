import type { FileTraceLogger } from "../trace/trace-log.js";

export interface TtsProviderConfig {
  provider: "ark-tts";
  apiKey: string;
  endpointId: string;
  baseURL: string;
}

export type TtsVoice =
  | "zh_female_qingxin"
  | "zh_male_chunhou"
  | "zh_female_meisu"
  | "zh_male_jingying"
  | "BV700_V2_streaming";

export interface ArkTtsRequest {
  text: string;
  voice?: TtsVoice;
  responseFormat?: "mp3" | "wav" | "pcm";
  speed?: number;
}

export interface ArkTtsResult {
  provider: "ark-tts";
  audioBuffer: Buffer;
  format: "mp3" | "wav" | "pcm";
  byteLength: number;
}

export async function generateTtsWithArk(
  request: ArkTtsRequest,
  config: TtsProviderConfig,
  options: { traceLogger?: Pick<FileTraceLogger, "append"> } = {},
): Promise<ArkTtsResult> {
  const format = request.responseFormat ?? "mp3";
  const voice = request.voice ?? "zh_female_qingxin";
  const speed = request.speed ?? 1.0;

  await options.traceLogger?.append({
    kind: "tts.request",
    pipeline: "tts",
    status: "ok",
    provider: config.provider,
    model: config.endpointId,
    contractId: "tts_v1",
    contractVersion: "v1",
    meta: { textLength: request.text.length, voice, format },
  });

  const url = `${config.baseURL.replace(/\/$/, "")}/audio/speech`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.endpointId,
      input: request.text,
      voice,
      response_format: format,
      speed,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Ark TTS request failed: HTTP ${response.status} — ${errText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  await options.traceLogger?.append({
    kind: "tts.completed",
    pipeline: "tts",
    status: "ok",
    provider: config.provider,
    model: config.endpointId,
    contractId: "tts_v1",
    contractVersion: "v1",
    meta: { byteLength: audioBuffer.byteLength, format },
  });

  return {
    provider: "ark-tts",
    audioBuffer,
    format,
    byteLength: audioBuffer.byteLength,
  };
}
