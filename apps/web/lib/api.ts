import axios from "axios";
import { BACKEND_URL } from "../app/config";

export const api = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config as typeof error.config & {
      _retried?: boolean;
    };
    if (
      error.response?.status === 401 &&
      request &&
      !request._retried &&
      !String(request.url).includes("/user/refresh") &&
      !String(request.url).includes("/user/signin")
    ) {
      request._retried = true;
      await api.post("/api/v1/user/refresh");
      return api.request(request);
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      "We could not reach the server. Please try again."
    );
  }
  return "Something went wrong. Please try again.";
}
