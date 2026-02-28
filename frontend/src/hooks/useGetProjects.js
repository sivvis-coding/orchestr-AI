import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api";

/**
 * Query hook to fetch all projects.
 *
 * Usage:
 *   const { data: projects, isLoading, isError } = useGetProjects();
 */
export function useGetProjects(options = {}) {
  return useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.getAll,
    ...options,
  });
}

/**
 * Query hook to fetch a single project by id.
 */
export function useGetProject(id, options = {}) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: () => projectsApi.getOne(id),
    enabled: !!id,
    ...options,
  });
}
