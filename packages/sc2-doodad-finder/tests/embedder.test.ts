// What the Finder says when the embeddings model can't load (src/embedder.ts).
import { describe, expect, it } from "vitest";

import { missingRuntime } from "../src/embedder.ts";

const loadFailure = new Error(
  "The specified module could not be found.\r\n\\\\?\\C:\\cache\\_npx\\1\\node_modules\\onnxruntime-node\\bin\\napi-v6\\win32\\arm64\\onnxruntime_binding.node",
);

describe("missingRuntime", () => {
  it("names the Visual C++ Redistributable for this architecture when ONNX Runtime can't load on Windows", () => {
    const error = missingRuntime(loadFailure, "win32", "arm64");
    expect(error?.message).toContain("Microsoft Visual C++ Redistributable");
    expect(error?.message).toContain("https://aka.ms/vs/17/release/vc_redist.arm64.exe");
    expect(error?.cause).toBe(loadFailure);
    expect(missingRuntime(loadFailure, "win32", "x64")?.message).toContain("vc_redist.x64.exe");
  });

  it("leaves other failures, and other platforms, as they are", () => {
    expect(missingRuntime(loadFailure, "darwin", "arm64")).toBeUndefined();
    expect(missingRuntime(new Error("fetch failed"), "win32", "x64")).toBeUndefined();
  });
});
