import { execFile as nodeExecFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

export type WorkspaceDirectorySelectMethod =
  | "macos"
  | "windows"
  | "linux"
  | "unsupported";

export interface WorkspaceDirectorySelectResponse {
  directory: string | null;
  cancelled: boolean;
  method: WorkspaceDirectorySelectMethod;
}

type ExecFileCallback = (
  error: Error | null,
  stdout: string | Buffer,
  stderr: string | Buffer
) => void;

type ExecFile = (
  file: string,
  args: string[],
  callback: ExecFileCallback
) => void;

interface ExecFileError extends Error {
  code?: string | number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

interface PickerOptions {
  platform?: NodeJS.Platform;
  execFile?: ExecFile;
  realpathImpl?: (input: string) => Promise<string>;
}

function execFileText(
  execFile: ExecFile,
  file: string,
  args: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        const execError = error as ExecFileError;
        execError.stdout = stdout;
        execError.stderr = stderr;
        reject(execError);
        return;
      }
      resolve(String(stdout));
    });
  });
}

function isCommandMissing(error: unknown) {
  return Boolean(
    error && typeof error === "object" && (error as ExecFileError).code === "ENOENT"
  );
}

function isCancelLike(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const execError = error as ExecFileError;
  const output = `${String(execError.stdout ?? "")}\n${String(
    execError.stderr ?? ""
  )}`.toLowerCase();
  return execError.code === 1 || execError.code === -128 || output.includes("cancel");
}

async function normalizeSelectedPath(
  rawPath: string,
  realpathImpl: (input: string) => Promise<string>
) {
  const selected = rawPath.trim();
  if (!selected || selected === "__CANCELLED__") {
    return null;
  }
  return realpathImpl(path.resolve(selected));
}

function unsupported(): WorkspaceDirectorySelectResponse {
  return { directory: null, cancelled: false, method: "unsupported" };
}

function cancelled(
  method: WorkspaceDirectorySelectMethod
): WorkspaceDirectorySelectResponse {
  return { directory: null, cancelled: true, method };
}

async function selectMacosDirectory(
  execFile: ExecFile,
  realpathImpl: (input: string) => Promise<string>
): Promise<WorkspaceDirectorySelectResponse> {
  try {
    const stdout = await execFileText(execFile, "osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "选择 DaiReel 工作目录")'
    ]);
    return {
      directory: await normalizeSelectedPath(stdout, realpathImpl),
      cancelled: false,
      method: "macos"
    };
  } catch (error) {
    if (isCommandMissing(error)) {
      return unsupported();
    }
    if (isCancelLike(error)) {
      return cancelled("macos");
    }
    throw error;
  }
}

async function selectWindowsDirectory(
  execFile: ExecFile,
  realpathImpl: (input: string) => Promise<string>
): Promise<WorkspaceDirectorySelectResponse> {
  const script = [
    "$shell = New-Object -ComObject Shell.Application",
    "$folder = $shell.BrowseForFolder(0, '选择 DaiReel 工作目录', 0)",
    "if ($folder -eq $null) { Write-Output '__CANCELLED__' }",
    "else { Write-Output $folder.Self.Path }"
  ].join("; ");
  try {
    const stdout = await execFileText(execFile, "powershell.exe", [
      "-NoProfile",
      "-Command",
      script
    ]);
    const directory = await normalizeSelectedPath(stdout, realpathImpl);
    return directory
      ? { directory, cancelled: false, method: "windows" }
      : cancelled("windows");
  } catch (error) {
    if (isCommandMissing(error)) {
      return unsupported();
    }
    if (isCancelLike(error)) {
      return cancelled("windows");
    }
    throw error;
  }
}

async function selectLinuxDirectory(
  execFile: ExecFile,
  realpathImpl: (input: string) => Promise<string>
): Promise<WorkspaceDirectorySelectResponse> {
  for (const candidate of [
    ["zenity", "--file-selection", "--directory", "--title=选择 DaiReel 工作目录"],
    ["kdialog", "--getexistingdirectory", "."]
  ] as const) {
    const [command, ...args] = candidate;
    try {
      const stdout = await execFileText(execFile, command, args);
      return {
        directory: await normalizeSelectedPath(stdout, realpathImpl),
        cancelled: false,
        method: "linux"
      };
    } catch (error) {
      if (isCommandMissing(error)) {
        continue;
      }
      if (isCancelLike(error)) {
        return cancelled("linux");
      }
      throw error;
    }
  }
  return unsupported();
}

export async function selectWorkspaceDirectory(
  options: PickerOptions = {}
): Promise<WorkspaceDirectorySelectResponse> {
  const platform = options.platform ?? process.platform;
  const execFile = options.execFile ?? nodeExecFile;
  const realpathImpl = options.realpathImpl ?? realpath;

  if (platform === "darwin") {
    return selectMacosDirectory(execFile, realpathImpl);
  }
  if (platform === "win32") {
    return selectWindowsDirectory(execFile, realpathImpl);
  }
  if (platform === "linux") {
    return selectLinuxDirectory(execFile, realpathImpl);
  }
  return unsupported();
}
