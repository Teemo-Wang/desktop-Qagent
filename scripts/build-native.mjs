import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "native/macos-hotkey.swift");
const output = resolve(projectRoot, "build/cursorlens-hotkey");

if (process.platform !== "darwin") {
  console.log("Native macOS hotkey helper skipped on this platform.");
  process.exit(0);
}

mkdirSync(dirname(output), { recursive: true });

const needsBuild =
  !existsSync(output) || statSync(source).mtimeMs > statSync(output).mtimeMs;

if (needsBuild) {
  console.log("Building the macOS long-press hotkey helper…");
  execFileSync(
    "xcrun",
    [
      "swiftc",
      source,
      "-o",
      output,
      "-framework",
      "AppKit",
      "-framework",
      "CoreGraphics"
    ],
    { stdio: "inherit" }
  );
}

chmodSync(output, 0o755);
