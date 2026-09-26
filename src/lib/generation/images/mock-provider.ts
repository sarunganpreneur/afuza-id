import type { ImageGenerationProviderV1, ImageGenerationResultV1 } from "./contracts";

export class MockImageGenerationProviderV1 implements ImageGenerationProviderV1 {
  constructor(private readonly result: ImageGenerationResultV1 = {
    bytes: new Uint8Array([0, 1, 2, 3]),
    mimeType: "image/webp",
    width: 1024,
    height: 1024,
  }) {}

  async generateImage(): Promise<ImageGenerationResultV1> {
    return { ...this.result, bytes: new Uint8Array(this.result.bytes) };
  }
}
