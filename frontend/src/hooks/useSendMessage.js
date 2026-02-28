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
  return useMutation({
    mutationFn: (data) => chatApi.sendMessage(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["chat", variables.project_id, "history"],
      });
    },
    ...options,
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
