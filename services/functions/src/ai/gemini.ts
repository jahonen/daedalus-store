import { GoogleGenAI } from "@google/genai";
import { IMAGE_MODEL, TEXT_MODEL } from "./models.js";

const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "daedalus-store";

// Hoist clients per location so we don't rebuild on every call.
const clients = new Map<string, GoogleGenAI>();
function client(location: string): GoogleGenAI {
  let ai = clients.get(location);
  if (!ai) {
    ai = new GoogleGenAI({ vertexai: true, project, location });
    clients.set(location, ai);
  }
  return ai;
}

/** Generate text/JSON with the configured Gemini text model. */
export async function generateText(opts: {
  systemInstruction?: string;
  prompt: string;
  responseJsonSchema?: Record<string, unknown>;
  temperature?: number;
}): Promise<string> {
  const ai = client(TEXT_MODEL.location);
  const response = await ai.models.generateContent({
    model: TEXT_MODEL.id,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    config: {
      systemInstruction: opts.systemInstruction,
      temperature: opts.temperature ?? 0.7,
      ...(opts.responseJsonSchema
        ? {
            responseMimeType: "application/json",
            responseJsonSchema: opts.responseJsonSchema,
          }
        : {}),
    },
  });
  const text = response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

/** Generate an image; returns PNG/JPEG bytes. */
export async function generateImage(prompt: string): Promise<Buffer> {
  const ai = client(IMAGE_MODEL.location);
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL.id,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseModalities: ["IMAGE"] },
  });
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Image model returned no image data");
}
