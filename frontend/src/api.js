import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export const projectsApi = {
  getAll: () => api.get("/projects/").then((r) => r.data),
  getOne: (id) => api.get(`/projects/${id}`).then((r) => r.data),
  create: (data) => api.post("/projects/", data).then((r) => r.data),
  update: (id, data) => api.put(`/projects/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/projects/${id}`),
};

export const documentsApi = {
  list: (projectId) =>
    api.get(`/projects/${projectId}/documents`).then((r) => r.data),
  upload: (projectId, file) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post(`/projects/${projectId}/documents`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  remove: (projectId, docId) =>
    api.delete(`/projects/${projectId}/documents/${docId}`),
};

export const authApi = {
  validateKey: (data) =>
    api.post("/auth/validate-key", data).then((r) => r.data),
};

export const chatApi = {
  sendMessage: (data) => api.post("/chat/", data).then((r) => r.data),
  getHistory: (projectId) =>
    api.get(`/chat/${projectId}/history`).then((r) => r.data),
  clearHistory: (projectId) => api.delete(`/chat/${projectId}/history`),
};

export default api;
