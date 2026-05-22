export interface TtsResult {
  audioUrl: string;
}

export async function generateTtsAudio(_text: string): Promise<TtsResult> {
  throw new Error("TTS is planned for P1 and is not part of the P0 path.");
}
