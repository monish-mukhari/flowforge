export function parse(text: string, values: unknown) {
  if (typeof text !== "string") throw new Error("Template must be a string");
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("Template values must be an object");
  return text.replace(
    /\{([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\}/g,
    (_match, path: string) => {
      let current: unknown = values;
      for (const key of path.split(".")) {
        if (
          !current ||
          typeof current !== "object" ||
          Array.isArray(current) ||
          !Object.prototype.hasOwnProperty.call(current, key)
        )
          throw new Error(`Template value not found: ${path}`);
        current = (current as Record<string, unknown>)[key];
      }
      if (["string", "number", "boolean"].includes(typeof current))
        return String(current);
      throw new Error(`Template value must be scalar: ${path}`);
    },
  );
}
