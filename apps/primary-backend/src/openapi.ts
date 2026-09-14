export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "FlowForge API",
    version: "1.0.0",
    description:
      "Authentication, connector catalog, and workflow lifecycle API.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [
    { name: "Authentication" },
    { name: "Workflows" },
    { name: "Connectors" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "flowforge_access" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error", "requestId"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
          },
          requestId: { type: "string" },
        },
      },
      WorkflowActionInput: {
        type: "object",
        required: ["availableActionId", "actionMetadata"],
        properties: {
          availableActionId: { type: "string" },
          actionMetadata: { type: "object", additionalProperties: true },
        },
      },
      WorkflowInput: {
        type: "object",
        required: ["availableTriggerId", "actions"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: ["string", "null"], maxLength: 1000 },
          availableTriggerId: { type: "string" },
          triggerMetadata: { type: "object", additionalProperties: true },
          actions: {
            type: "array",
            minItems: 1,
            maxItems: 25,
            items: { $ref: "#/components/schemas/WorkflowActionInput" },
          },
        },
      },
    },
  },
  paths: {
    "/user/signup": {
      post: { tags: ["Authentication"], summary: "Create an account" },
    },
    "/user/signin": {
      post: { tags: ["Authentication"], summary: "Create a session" },
    },
    "/user/refresh": {
      post: { tags: ["Authentication"], summary: "Rotate a session" },
    },
    "/user/logout": {
      post: { tags: ["Authentication"], summary: "Revoke a session" },
    },
    "/zap": {
      get: {
        tags: ["Workflows"],
        summary: "List workflows",
        security: [{ cookieAuth: [] }],
      },
      post: {
        tags: ["Workflows"],
        summary: "Create a draft workflow",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WorkflowInput" },
            },
          },
        },
      },
    },
    "/zap/{zapId}": {
      get: {
        tags: ["Workflows"],
        summary: "Get a workflow",
        security: [{ cookieAuth: [] }],
      },
      patch: {
        tags: ["Workflows"],
        summary: "Edit a workflow draft",
        security: [{ cookieAuth: [] }],
      },
      delete: {
        tags: ["Workflows"],
        summary: "Delete a workflow",
        security: [{ cookieAuth: [] }],
      },
    },
    "/zap/{zapId}/publish": {
      post: {
        tags: ["Workflows"],
        summary: "Publish an immutable version",
        security: [{ cookieAuth: [] }],
      },
    },
    "/zap/{zapId}/pause": {
      post: {
        tags: ["Workflows"],
        summary: "Pause a workflow",
        security: [{ cookieAuth: [] }],
      },
    },
    "/zap/{zapId}/resume": {
      post: {
        tags: ["Workflows"],
        summary: "Resume a workflow",
        security: [{ cookieAuth: [] }],
      },
    },
    "/zap/{zapId}/archive": {
      post: {
        tags: ["Workflows"],
        summary: "Archive a workflow",
        security: [{ cookieAuth: [] }],
      },
    },
    "/zap/{zapId}/duplicate": {
      post: {
        tags: ["Workflows"],
        summary: "Duplicate as a draft",
        security: [{ cookieAuth: [] }],
      },
    },
    "/zap/{zapId}/versions": {
      get: {
        tags: ["Workflows"],
        summary: "List immutable versions",
        security: [{ cookieAuth: [] }],
      },
    },
    "/trigger/available": {
      get: {
        tags: ["Connectors"],
        summary: "List trigger connectors",
        security: [{ cookieAuth: [] }],
      },
    },
    "/action/available": {
      get: {
        tags: ["Connectors"],
        summary: "List action connectors",
        security: [{ cookieAuth: [] }],
      },
    },
  },
} as const;
