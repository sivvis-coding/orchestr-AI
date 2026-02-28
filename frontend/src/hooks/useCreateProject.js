import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api";

/**
 * Mutation hook to create a new project.
 */
export function useCreateProject(options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    ...options,
  });
}

/**
 * Mutation hook to update an existing project.
 */
export function useUpdateProject(options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => projectsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
    },
    ...options,
  });
}

/**
 * Mutation hook to delete a project.
 */
export function useDeleteProject(options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => projectsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    ...options,
  });
}
