import { z } from "zod";

const template = z.string().trim().min(1).max(100_000);
const connectionId = z.string().uuid();
const optionalConnectionId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  connectionId.optional(),
);

export type ConnectorField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "connection";
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
};

export type ConnectorContract = {
  key: string;
  version: number;
  name: string;
  description: string;
  image: string;
  authType: "NONE" | "OPTIONAL_CONNECTION" | "OAUTH2";
  oauthProvider?: "slack" | "google-sheets";
  fields: ConnectorField[];
  schema: z.ZodType<Record<string, unknown>>;
};

export const connectorRegistry: ConnectorContract[] = [
  {
    key: "email",
    version: 1,
    name: "Email",
    description: "Send an email through Mailpit or a reusable SMTP connection.",
    image: "email",
    authType: "OPTIONAL_CONNECTION",
    fields: [
      { key: "connectionId", label: "SMTP connection", type: "connection" },
      {
        key: "email",
        label: "To",
        type: "text",
        required: true,
        placeholder: "{customer.email}",
      },
      {
        key: "subject",
        label: "Subject",
        type: "text",
        placeholder: "FlowForge workflow notification",
      },
      {
        key: "body",
        label: "Message",
        type: "textarea",
        required: true,
        placeholder: "Hi {customer.name}",
      },
    ],
    schema: z
      .object({
        connectionId: optionalConnectionId,
        email: template,
        subject: template.optional(),
        body: template,
      })
      .passthrough(),
  },
  {
    key: "solana",
    version: 1,
    name: "Solana",
    description: "Transfer SOL from the account's encrypted devnet wallet.",
    image: "solana",
    authType: "NONE",
    fields: [
      {
        key: "address",
        label: "Wallet address",
        type: "text",
        required: true,
        placeholder: "{wallet.address}",
      },
      {
        key: "amount",
        label: "Amount in SOL",
        type: "text",
        required: true,
        placeholder: "{payment.amount}",
      },
    ],
    schema: z.object({ address: template, amount: template }).passthrough(),
  },
  {
    key: "http",
    version: 1,
    name: "HTTP Request",
    description:
      "Call an external HTTPS API with optional reusable authentication.",
    image: "http",
    authType: "OPTIONAL_CONNECTION",
    fields: [
      { key: "connectionId", label: "HTTP connection", type: "connection" },
      {
        key: "method",
        label: "Method",
        type: "select",
        required: true,
        options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({
          label: value,
          value,
        })),
      },
      {
        key: "url",
        label: "HTTPS URL",
        type: "text",
        required: true,
        placeholder: "https://api.example.com/items",
      },
      {
        key: "headers",
        label: "Headers (JSON)",
        type: "textarea",
        placeholder: '{"content-type":"application/json"}',
      },
      {
        key: "body",
        label: "Body",
        type: "textarea",
        placeholder: '{"name":"{customer.name}"}',
      },
    ],
    schema: z
      .object({
        connectionId: optionalConnectionId,
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        url: template,
        headers: z.string().max(20_000).optional(),
        body: z.string().max(100_000).optional(),
      })
      .passthrough(),
  },
  {
    key: "slack",
    version: 1,
    name: "Slack",
    description: "Post a message with a connected Slack workspace.",
    image: "slack",
    authType: "OAUTH2",
    oauthProvider: "slack",
    fields: [
      {
        key: "connectionId",
        label: "Slack connection",
        type: "connection",
        required: true,
      },
      {
        key: "channel",
        label: "Channel ID",
        type: "text",
        required: true,
        placeholder: "C0123456789",
      },
      {
        key: "text",
        label: "Message",
        type: "textarea",
        required: true,
        placeholder: "New order from {customer.name}",
      },
    ],
    schema: z
      .object({ connectionId, channel: template, text: template })
      .passthrough(),
  },
  {
    key: "google-sheets",
    version: 1,
    name: "Google Sheets",
    description: "Append a row to a spreadsheet using Google OAuth.",
    image: "google-sheets",
    authType: "OAUTH2",
    oauthProvider: "google-sheets",
    fields: [
      {
        key: "connectionId",
        label: "Google connection",
        type: "connection",
        required: true,
      },
      {
        key: "spreadsheetId",
        label: "Spreadsheet ID",
        type: "text",
        required: true,
        placeholder: "1AbC...",
      },
      {
        key: "range",
        label: "Range",
        type: "text",
        required: true,
        placeholder: "Sheet1!A:Z",
      },
      {
        key: "values",
        label: "Row values (JSON array)",
        type: "textarea",
        required: true,
        placeholder: '["{customer.name}","{customer.email}"]',
      },
    ],
    schema: z
      .object({
        connectionId,
        spreadsheetId: template,
        range: template,
        values: template,
      })
      .passthrough(),
  },
];

export function connectorContract(key: string) {
  return connectorRegistry.find((connector) => connector.key === key);
}

export function publicConnectorContract(connector: ConnectorContract) {
  return {
    id: connector.key,
    key: connector.key,
    version: connector.version,
    name: connector.name,
    description: connector.description,
    image: connector.image,
    authType: connector.authType,
    oauthProvider: connector.oauthProvider,
    fields: connector.fields,
  };
}
