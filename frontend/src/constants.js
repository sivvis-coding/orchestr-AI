export const GEMINI_MODELS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

export const MODEL_LABELS = Object.fromEntries(
  GEMINI_MODELS.map(({ value, label }) => [value, label])
);
