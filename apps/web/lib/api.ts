import axios from "axios";
import { BACKEND_URL } from "../app/config";

export const api = axios.create({ baseURL: BACKEND_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("token");
    if (token) config.headers.Authorization = token;
  }
  return config;
});

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || "We could not reach the server. Please try again.";
  }
  return "Something went wrong. Please try again.";
}
