export const GEMINI_MODELS = [
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-3.0-flash", label: "Gemini 3 Flash" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
];

export const MODEL_LABELS = Object.fromEntries(
  GEMINI_MODELS.map(({ value, label }) => [value, label]),
);
