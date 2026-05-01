import { describe, expect, it } from "vitest";
import { DogpileError, type ModelRequest } from "../index.js";
import {
  classifyHostLocality,
  createOpenAICompatibleProvider,
  type OpenAICompatibleFetch
} from "./openai-compatible.js";

const request: ModelRequest = {
  temperature: 0.2,
  metadata: {
    protocol: "sequential"
  },
  messages: [
    {
      role: "system",
      content: "You are a planner."
    },
    {
      role: "user",
      content: "Draft a release plan."
    }
  ]
};

describe("classifyHostLocality", () => {
  it.each<[string, "local" | "remote"]>([
    ["localhost", "local"],
    ["LOCALHOST", "local"],
    ["mybox.local", "local"],
    ["SERVICE.LOCAL", "local"],
    ["127.0.0.1", "local"],
    ["127.255.255.254", "local"],
    ["10.0.0.1", "local"],
    ["10.255.255.255", "local"],
    ["172.16.5.3", "local"],
    ["172.31.0.1", "local"],
    ["172.32.0.1", "remote"],
    ["172.15.0.1", "remote"],
    ["192.168.1.100", "local"],
    ["169.254.1.1", "local"],
    ["::1", "local"],
    ["[::1]", "local"],
    ["fc00::1", "local"],
    ["fd12:3456::1", "local"],
    ["fe80::1", "local"],
    ["api.openai.com", "remote"],
    ["127.0.0.1.example.com", "remote"],
    ["8.8.8.8", "remote"],
    ["2001:db8::1", "remote"]
  ])("classifies %s as %s", (host, expected) => {
    expect(classifyHostLocality(host)).toBe(expected);
  });
});

describe("createOpenAICompatibleProvider", () => {
  it("maps Dogpile model requests to direct OpenAI-compatible chat completions", async () => {
    const calls: Array<{ readonly input: RequestInfo | URL; readonly init: RequestInit | undefined }> = [];
    const fetch: OpenAICompatibleFetch = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({
        id: "chatcmpl-direct",
        object: "chat.completion",
        created: 1_776_000_000,
        model: "gpt-4.1-mini",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "direct provider answer"
            }
          }
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18
        }
      });
    };
    const provider = createOpenAICompatibleProvider({
      id: "direct-openai",
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      baseURL: "https://api.openai.test/v1",
      fetch,
      maxOutputTokens: 128,
      extraBody: {
        reasoning_effort: "low"
      },
      costEstimator({ usage }) {
        return usage ? usage.totalTokens / 1_000_000 : undefined;
      }
    });

    const response = await provider.generate(request);

    expect(response).toEqual({
      text: "direct provider answer",
      finishReason: "stop",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18
      },
      costUsd: 0.000018,
      metadata: {
        openAICompatible: {
          id: "chatcmpl-direct",
          object: "chat.completion",
          created: 1_776_000_000,
          model: "gpt-4.1-mini",
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18
          }
        }
      }
    });
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe("https://api.openai.test/v1/chat/completions");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer test-key");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      reasoning_effort: "low",
      model: "gpt-4.1-mini",
      messages: request.messages,
      temperature: 0.2,
      max_tokens: 128
    });
  });

  it("normalizes provider HTTP failures to stable DogpileError codes", async () => {
    const provider = createOpenAICompatibleProvider({
      model: "gpt-4.1-mini",
      fetch: async () =>
        jsonResponse(
          {
            error: {
              message: "quota exceeded"
            }
          },
          {
            status: 429,
            statusText: "Too Many Requests"
          }
        )
    });

    await expect(provider.generate(request)).rejects.toMatchObject({
      name: "DogpileError",
      code: "provider-rate-limited",
      message: "quota exceeded",
      providerId: "openai-compatible:gpt-4.1-mini",
      retryable: true,
      detail: {
        statusCode: 429,
        statusText: "Too Many Requests"
      }
    });
  });

  it("normalizes fetch transport failures to stable DogpileError codes", async () => {
    const transportError = new TypeError("fetch failed");
    const provider = createOpenAICompatibleProvider({
      model: "gpt-4.1-mini",
      fetch: async () => {
        throw transportError;
      }
    });

    await expect(provider.generate(request)).rejects.toMatchObject({
      name: "DogpileError",
      code: "provider-error",
      message: "fetch failed",
      providerId: "openai-compatible:gpt-4.1-mini",
      retryable: true,
      cause: transportError,
      detail: {
        name: "TypeError"
      }
    });
  });

  it("validates adapter options before returning a provider", () => {
    expect(() => createOpenAICompatibleProvider({ model: "" })).toThrow(DogpileError);
    expect(() =>
      createOpenAICompatibleProvider({
        model: "gpt-4.1-mini",
        maxOutputTokens: 0
      })
    ).toThrow(DogpileError);
  });

  it("auto-detects metadata.locality='local' for loopback baseURL", () => {
    const provider = createOpenAICompatibleProvider({
      model: "gpt-4.1-mini",
      baseURL: "http://localhost:11434/v1",
      fetch: async () => jsonResponse({})
    });

    expect(provider.metadata?.locality).toBe("local");
  });

  it("auto-detects metadata.locality='remote' for public baseURL", () => {
    const provider = createOpenAICompatibleProvider({
      model: "gpt-4.1-mini",
      baseURL: "https://api.openai.com/v1",
      fetch: async () => jsonResponse({})
    });

    expect(provider.metadata?.locality).toBe("remote");
  });

  it("defaults metadata.locality to remote for the default public baseURL", () => {
    const provider = createOpenAICompatibleProvider({
      model: "gpt-4.1-mini",
      fetch: async () => jsonResponse({})
    });

    expect(provider.metadata?.locality).toBe("remote");
  });

  it("explicit locality='local' overrides remote auto-detect", () => {
    const provider = createOpenAICompatibleProvider({
      model: "gpt-4.1-mini",
      baseURL: "https://example.com/v1",
      locality: "local",
      fetch: async () => jsonResponse({})
    });

    expect(provider.metadata?.locality).toBe("local");
  });

  it("throws when locality='remote' is set on a detected-local host", () => {
    expect(() =>
      createOpenAICompatibleProvider({
        model: "gpt-4.1-mini",
        baseURL: "http://localhost:11434/v1",
        locality: "remote",
        fetch: async () => jsonResponse({})
      })
    ).toThrowError(
      expect.objectContaining({
        code: "invalid-configuration",
        detail: expect.objectContaining({
          path: "locality",
          reason: "remote-override-on-local-host",
          host: "localhost"
        })
      })
    );
  });

  it("throws DogpileError on invalid locality string at construct time", () => {
    expect(() =>
      createOpenAICompatibleProvider({
        model: "gpt-4.1-mini",
        locality: "INVALID" as "local",
        fetch: async () => jsonResponse({})
      })
    ).toThrowError(
      expect.objectContaining({
        code: "invalid-configuration",
        detail: expect.objectContaining({
          path: "locality"
        })
      })
    );
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}
