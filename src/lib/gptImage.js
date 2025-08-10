/**
 * generateImageFromPrompt
 * - Uses an image generation endpoint to return a data URL (PNG by default).
 * - Defaults to OpenAI Images API if VITE_GPT_IMAGE_ENDPOINT is not provided.
 *
 * SECURITY NOTE: Calling vendor APIs from the browser will expose your key to users.
 * For production, proxy this call through your backend. For hackathon/demo, this is acceptable.
 */
export async function generateImageFromPrompt(prompt, { width = 1280, height = 720 } = {}) {
  const endpoint =
    import.meta.env.VITE_GPT_IMAGE_ENDPOINT || "https://api.openai.com/v1/images/generations";

  const apiKey =
    import.meta.env.VITE_GPT5_API_KEY || import.meta.env.VITE_OPENAI_API_KEY || "";

  const model = import.meta.env.VITE_GPT_IMAGE_MODEL || "gpt-image-1";

  // OpenAI Images API supports fixed sizes (e.g., 256x256, 512x512, 1024x1024).
  // We'll request 1024x1024 and fit/cover it onto the sprite canvas later.
  const size = "1024x1024";

  const isOpenAI = endpoint.includes("openai.com");

  const headers = { "Content-Type": "application/json" };
  if (isOpenAI && apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = isOpenAI
    ? {
        model,
        prompt,
        size,
        response_format: "b64_json"
      }
    : {
        // Generic payload for custom endpoints. Adjust your backend to accept these.
        prompt,
        width,
        height,
        response_format: "b64_json"
      };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Try common response shapes
  const b64 =
    data?.data?.[0]?.b64_json ||
    data?.b64_json ||
    (typeof data?.image === "string" ? data.image.replace(/^data:.*;base64,/, "") : null);

  if (!b64) throw new Error("No image data returned by the image API");

  const mime = "image/png";
  return b64.startsWith("data:")
    ? b64
    : `data:${mime};base64,${b64}`;
}
