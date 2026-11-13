// What the Finder says when the embeddings model can't load (src/embedder.ts).
import { describe, expect, it } from "vitest";

import { missingRuntime, modelLoadError } from "../src/embedder.ts";

const loadFailure = new Error(
  "The specified module could not be found.\r\n\\\\?\\C:\\cache\\_npx\\1\\node_modules\\onnxruntime-node\\bin\\napi-v6\\win32\\arm64\\onnxruntime_binding.node",
);
const noRuntime = () => false;

describe("missingRuntime", () => {
  it("names the Visual C++ Redistributable for this architecture when ONNX Runtime can't load on Windows without it", () => {
    const error = missingRuntime(loadFailure, { platform: "win32", arch: "arm64", hasRuntime: noRuntime });
    expect(error?.message).toContain("Microsoft Visual C++ Redistributable");
    expect(error?.message).toContain("https://aka.ms/vs/17/release/vc_redist.arm64.exe");
    // What ONNX Runtime said, too: the bin prints the message alone, not its cause.
    expect(error?.message).toContain("(ONNX Runtime said: The specified module could not be found.)");
    expect(error?.cause).toBe(loadFailure);
    expect(missingRuntime(loadFailure, { platform: "win32", arch: "x64", hasRuntime: noRuntime })?.message).toContain("vc_redist.x64.exe");
  });

  it("doesn't blame the runtime when its DLLs are there, as when onnxruntime.dll itself is missing", () => {
    expect(missingRuntime(loadFailure, { platform: "win32", arch: "x64", hasRuntime: () => true })).toBeUndefined();
  });

  it("blames the connection only for a failed download, and the cache for anything else", () => {
    const offline = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    expect(modelLoadError("Xenova/gte-small", offline, "/cache/models").message).toBe(
      "The embeddings model (Xenova/gte-small) couldn't download: fetch failed. Check the connection and start again: it downloads once.",
    );
    expect(modelLoadError("Xenova/gte-small", new Error("Protobuf parsing failed."), "/cache/models").message).toBe(
      "The embeddings model (Xenova/gte-small) couldn't load: Protobuf parsing failed. If it keeps failing, delete its cache folder, /cache/models, and start again to download it afresh.",
    );
  });

  it("leaves other failures, and other platforms, as they are", () => {
    expect(missingRuntime(loadFailure, { platform: "darwin", arch: "arm64", hasRuntime: noRuntime })).toBeUndefined();
    expect(missingRuntime(new Error("fetch failed"), { platform: "win32", arch: "x64", hasRuntime: noRuntime })).toBeUndefined();
  });
});
