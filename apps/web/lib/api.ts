import axios from "axios";

export const api = axios.create({
  // Keep authentication requests on the page's origin. Next.js proxies /api
  // server-side, so HttpOnly session cookies remain first-party regardless of
  // whether the site is opened through localhost, an IP address, or a domain.
  withCredentials: true,
});

let refreshRequest: Promise<void> | undefined;

function refreshSession() {
  refreshRequest ??= api
    .post("/api/v1/user/refresh")
    .then(() => undefined)
    .finally(() => {
      refreshRequest = undefined;
    });
  return refreshRequest;
}

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
      await refreshSession();
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
