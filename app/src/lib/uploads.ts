/** Shared by the upload route and the form: what customers may upload and how much. */
export const MAX_UPLOADS = 6;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const imageTypeOf = (key: string) =>
  ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" })[key.split(".").pop()?.toLowerCase() ?? ""] ?? "image/jpeg";
