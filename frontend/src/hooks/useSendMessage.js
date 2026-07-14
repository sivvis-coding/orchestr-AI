import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../api";

/**
 * Query hook to fetch chat history for a project.
 */
export function useGetChatHistory(projectId, options = {}) {
  return useQuery({
    queryKey: ["chat", projectId, "history"],
    queryFn: () => chatApi.getHistory(projectId),
    enabled: !!projectId,
    ...options,
  });
}

/**
 * Mutation hook to send a chat message.
 *
 * Usage:
 *   const { mutate, isPending } = useSendMessage();
 *   mutate({ project_id: 1, message: "Hello!" });
 */
export function useSendMessage(options = {}) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...restOptions } = options;
  return useMutation({
    mutationFn: (data) => chatApi.sendMessage(data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["chat", variables.project_id, "history"],
      });
      callerOnSuccess?.(data, variables);
    },
    ...restOptions,
  });
}

/**
 * Mutation hook to clear chat history for a project.
 */
export function useClearHistory(options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId) => chatApi.clearHistory(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({
        queryKey: ["chat", projectId, "history"],
      });
    },
    ...options,
  });
}

/**
 * Mutation hook to fetch RAG debug info for a given query.
 * Call mutate({ projectId, query, minScore }) to retrieve chunks.
 */
export function useRagDebug(options = {}) {
  return useMutation({
    mutationFn: ({ projectId, query, minScore }) =>
      chatApi.ragDebug(projectId, query, 20, minScore),
    ...options,
  });
}
