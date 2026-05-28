import { spawn } from "node:child_process";

export async function which(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("which", [bin]);
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.on("close", (code) => resolve(code === 0 ? out.trim() : null));
    child.on("error", () => resolve(null));
  });
}

export async function assertFfmpegAvailable() {
  const path = await which("ffmpeg");
  if (!path) {
    throw new Error(
      "ffmpeg not found on PATH. Install via `brew install ffmpeg` (macOS) or `apt-get install ffmpeg` (Debian).",
    );
  }
}

export async function runFfmpeg(
  args: string[],
  onStderr?: (chunk: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    child.stderr.on("data", (b) => {
      const s = b.toString();
      stderr += s;
      onStderr?.(s);
    });
    child.on("close", (code) =>
      code === 0
        ? resolve(stderr)
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 400)}`)),
    );
  });
}

export async function ffprobe(
  filePath: string,
): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "default=nw=1:nk=1",
      filePath,
    ]);
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (err += b.toString()));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err}`));
      const lines = out.trim().split("\n");
      resolve({
        width: Number(lines[0]),
        height: Number(lines[1]),
        durationSec: Math.round(Number(lines[2])),
      });
    });
  });
}
