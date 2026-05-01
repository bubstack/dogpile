import type {
  AgentSpec,
  ConfiguredModelProvider,
  ModelRequest,
  ModelResponse,
  RuntimeToolExecutionRequest,
  ReplayTraceProviderCall,
  RunEvent
} from "../types.js";
import { throwIfAborted } from "./cancellation.js";

interface GenerateModelTurnOptions {
  readonly model: ConfiguredModelProvider;
  readonly request: ModelRequest;
  readonly runId: string;
  readonly agent: AgentSpec;
  readonly input: string;
  readonly emit: (event: RunEvent) => void;
  readonly callId: string;
  readonly onProviderCall?: (call: ReplayTraceProviderCall) => void;
}

type ModelUsage = NonNullable<ModelResponse["usage"]>;

export async function generateModelTurn(options: GenerateModelTurnOptions): Promise<ModelResponse> {
  const startedAt = new Date().toISOString();
  const modelId = options.model.modelId ?? options.model.id;
  const traceRequest = requestForTrace(options.request);
  let response: ModelResponse;

  throwIfAborted(options.request.signal, options.model.id);

  options.emit({
    type: "model-request",
    runId: options.runId,
    callId: options.callId,
    providerId: options.model.id,
    modelId,
    startedAt,
    agentId: options.agent.id,
    role: options.agent.role,
    request: traceRequest
  });

  if (!options.model.stream) {
    response = await options.model.generate(options.request);
    throwIfAborted(options.request.signal, options.model.id);
    recordProviderCall(response, startedAt, modelId, traceRequest, options);
    return response;
  }

  let text = "";
  let chunkIndex = 0;
  let usage: ModelUsage | undefined;
  let costUsd: number | undefined;
  let finishReason: ModelResponse["finishReason"] | undefined;
  let toolRequests: readonly RuntimeToolExecutionRequest[] | undefined;
  let metadata: ModelResponse["metadata"] | undefined;

  for await (const chunk of options.model.stream(options.request)) {
    throwIfAborted(options.request.signal, options.model.id);
    text += chunk.text;

    options.emit({
      type: "model-output-chunk",
      runId: options.runId,
      at: new Date().toISOString(),
      agentId: options.agent.id,
      role: options.agent.role,
      input: options.input,
      chunkIndex,
      text: chunk.text,
      output: text
    });
    chunkIndex += 1;

    if (chunk.usage) {
      usage = chunk.usage;
    }
    if (chunk.costUsd !== undefined) {
      costUsd = chunk.costUsd;
    }
    if (chunk.finishReason !== undefined) {
      finishReason = chunk.finishReason;
    }
    if (chunk.toolRequests !== undefined) {
      toolRequests = chunk.toolRequests;
    }
    if (chunk.metadata !== undefined) {
      metadata = chunk.metadata;
    }
  }

  response = {
    text,
    ...(finishReason !== undefined ? { finishReason } : {}),
    ...(toolRequests && toolRequests.length > 0 ? { toolRequests } : {}),
    ...(usage ? { usage } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(metadata !== undefined ? { metadata } : {})
  };
  throwIfAborted(options.request.signal, options.model.id);
  recordProviderCall(response, startedAt, modelId, traceRequest, options);
  return response;
}

function recordProviderCall(
  response: ModelResponse,
  startedAt: string,
  modelId: string,
  request: ModelRequest,
  options: GenerateModelTurnOptions
): void {
  const completedAt = new Date().toISOString();

  options.emit({
    type: "model-response",
    runId: options.runId,
    callId: options.callId,
    providerId: options.model.id,
    modelId,
    startedAt,
    completedAt,
    agentId: options.agent.id,
    role: options.agent.role,
    response
  });

  options.onProviderCall?.({
    kind: "replay-trace-provider-call",
    callId: options.callId,
    providerId: options.model.id,
    modelId,
    startedAt,
    completedAt,
    agentId: options.agent.id,
    role: options.agent.role,
    request,
    response
  });
}

function requestForTrace(request: ModelRequest): ModelRequest {
  return {
    messages: request.messages.map((message) => ({ ...message })),
    temperature: request.temperature,
    metadata: JSON.parse(JSON.stringify(request.metadata)) as ModelRequest["metadata"]
  };
}
