import { createAfuzaGenerationHttpClient } from "../src/lib/generation/http-adapter";
import { createAfuzaContentHttpCommitter } from "../src/lib/generation/content/http-commit";
import { createAfuzaGeneratedImageHttpStorageV1 } from "../src/lib/generation/images/http-storage";
import { createOpenAiImageGenerationProvider } from "../src/lib/generation/images/openai";
import { createOpenAiGenerationProvider } from "../src/lib/generation/openai";
import { runGenerationOnce } from "../src/lib/generation/worker";

const once = process.argv.includes("--once");
const generationAdapterBaseUrl =
  process.env.AFUZA_GENERATION_ADAPTER_BASE_URL ?? "http://127.0.0.1:4100";
const adapterUrl =
  process.env.AFUZA_CONTENT_ADAPTER_URL ??
  `${generationAdapterBaseUrl.replace(/\/+$/, "")}/api/internal/generation/content/commit`;
const workerSecret = process.env.WORKER_SHARED_SECRET;

if (!once) {
  console.error("Generation worker requires --once in V1; refusing continuous execution.");
  process.exit(2);
}

if (!workerSecret) {
  console.error("Generation worker requires WORKER_SHARED_SECRET.");
  process.exit(2);
}

const generationClient = createAfuzaGenerationHttpClient({
  baseUrl: generationAdapterBaseUrl,
  workerSecret,
});

const imageStorage = createAfuzaGeneratedImageHttpStorageV1({
  baseUrl: generationAdapterBaseUrl,
  workerSecret,
});

const commitContent = createAfuzaContentHttpCommitter({
  url: adapterUrl,
  workerSecret,
});

runGenerationOnce({
  client: generationClient,
  provider: createOpenAiGenerationProvider(),
  imageProvider: createOpenAiImageGenerationProvider(),
  imageStorage,
  commitContent,
  log: (event, fields) => console.log(JSON.stringify({ event, ...fields })),
}).then((result) => {
  console.log(JSON.stringify(result));
  process.exitCode = result.kind === "failed" ? 1 : 0;
}).catch((error) => {
  console.error(JSON.stringify({ event: "generation_worker_failed", error: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});