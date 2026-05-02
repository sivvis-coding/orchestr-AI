import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsApi } from "../api";

export function useGetDocuments(projectId, options = {}) {
  return useQuery({
    queryKey: ["documents", projectId],
    queryFn: () => documentsApi.list(projectId),
    enabled: !!projectId,
    ...options,
  });
}

export function useUploadDocument(projectId, options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, csvConfig = null }) =>
      documentsApi.upload(projectId, file, csvConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
    ...options,
  });
}

export function useCsvColumns(projectId) {
  return useMutation({
    mutationFn: (file) => documentsApi.getCsvColumns(projectId, file),
  });
}

export function useDeleteDocument(projectId, options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId) => documentsApi.remove(projectId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
    ...options,
  });
}

export function useReindexDocuments(projectId, options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => documentsApi.reindex(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
    ...options,
  });
}
