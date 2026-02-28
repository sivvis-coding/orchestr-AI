import { useMutation } from "@tanstack/react-query";
import { authApi } from "../api";

/**
 * Mutation hook to validate a Gemini API key.
 *
 * Usage:
 *   const { mutate, isPending, data, isError } = useValidateKey();
 *   mutate({ api_key: "...", model: "gemini-2.5-flash" });
 */
export function useValidateKey(options = {}) {
  return useMutation({
    mutationFn: ({ api_key, model }) =>
      authApi.validateKey({ api_key, model }),
    ...options,
  });
}
