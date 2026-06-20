import type {
  CropImageNodeData,
  GeminiNodeData,
  RequestInputsNodeData,
  ResponseNodeData,
} from "@/lib/types";

const DEFAULT_SETTINGS = { temperature: 1, maxOutputTokens: 2048, topP: 0.95 };

/**
 * The exact sample workflow from the assignment spec: a product-description
 * pipeline that fans out from one image input into two crops + a copywriting
 * Gemini call, condenses that into a tweet hook, then combines the hook and
 * both crops into a final marketing post.
 */
export function buildSampleWorkflow() {
  const nodes = [
    {
      id: "request-inputs",
      type: "request-inputs",
      position: { x: 40, y: 320 },
      data: {
        kind: "request-inputs",
        fields: [
          {
            id: "field-text",
            name: "text_field",
            type: "text_field",
            value:
              "Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.",
          },
          {
            id: "field-image",
            name: "image_field",
            type: "image_field",
            value: "", // upload a product photo via the UI after loading this sample
          },
        ],
      } satisfies RequestInputsNodeData,
    },
    {
      id: "gemini-1",
      type: "gemini",
      position: { x: 400, y: 40 },
      data: {
        kind: "gemini",
        label: "Gemini 3.1 Pro",
        model: "gemini-3.1-pro",
        systemPrompt: "You are a marketing copywriter. Write a one-paragraph product description.",
        imageUrls: [],
        settings: DEFAULT_SETTINGS,
        runStatus: "idle",
      } satisfies GeminiNodeData,
    },
    {
      id: "gemini-2",
      type: "gemini",
      position: { x: 400, y: 320 },
      data: {
        kind: "gemini",
        label: "Gemini 3.1 Pro #2",
        model: "gemini-3.1-pro",
        systemPrompt: "Condense the following product description into a tweet-length hook (under 240 characters).",
        imageUrls: [],
        settings: DEFAULT_SETTINGS,
        runStatus: "idle",
      } satisfies GeminiNodeData,
    },
    {
      id: "crop-1",
      type: "crop-image",
      position: { x: 400, y: 600 },
      data: {
        kind: "crop-image",
        label: "Crop Image",
        xPercent: 20,
        yPercent: 20,
        widthPercent: 60,
        heightPercent: 60,
        runStatus: "idle",
      } satisfies CropImageNodeData,
    },
    {
      id: "crop-2",
      type: "crop-image",
      position: { x: 400, y: 860 },
      data: {
        kind: "crop-image",
        label: "Crop Image #2",
        xPercent: 0,
        yPercent: 0,
        widthPercent: 100,
        heightPercent: 50,
        runStatus: "idle",
      } satisfies CropImageNodeData,
    },
    {
      id: "gemini-final",
      type: "gemini",
      position: { x: 800, y: 320 },
      data: {
        kind: "gemini",
        label: "Gemini 3.1 Pro #3",
        model: "gemini-3.1-pro",
        systemPrompt:
          "You are a social media manager. Combine the tweet hook and the two product crops into a final marketing post.",
        imageUrls: [],
        settings: DEFAULT_SETTINGS,
        runStatus: "idle",
      } satisfies GeminiNodeData,
    },
    {
      id: "response",
      type: "response",
      position: { x: 1200, y: 320 },
      data: { kind: "response" } satisfies ResponseNodeData,
    },
  ];

  const edges = [
    edge("field-image-to-crop1", "request-inputs", "field-image", "crop-1", "input_image"),
    edge("field-image-to-crop2", "request-inputs", "field-image", "crop-2", "input_image"),
    edge("field-text-to-gemini1", "request-inputs", "field-text", "gemini-1", "prompt"),
    edge("gemini1-to-gemini2", "gemini-1", "response", "gemini-2", "prompt"),
    edge("crop1-to-final", "crop-1", "output_image", "gemini-final", "image_vision"),
    edge("crop2-to-final", "crop-2", "output_image", "gemini-final", "image_vision"),
    edge("gemini2-to-final", "gemini-2", "response", "gemini-final", "prompt"),
    edge("final-to-response", "gemini-final", "response", "response", "result"),
  ];

  return { nodes, edges };
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string) {
  return { id, source, sourceHandle, target, targetHandle, animated: false };
}