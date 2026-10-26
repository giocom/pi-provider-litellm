import { describe, expect, it } from "vitest";
import extension from "../src/index.js";
import type { LiteLLMModelConfig } from "../src/types.js";

type TestProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
  models?: LiteLLMModelConfig[];
};

type TestPi = {
  providers: Array<{ name: string; config: TestProviderConfig }>;
  commands: Map<string, unknown>;
  handlers: Map<string, Array<(event: any, ctx?: any) => Promise<any> | any>>;
  tools: Array<unknown>;
  registerProvider(name: string, config: TestProviderConfig): void;
  registerCommand(name: string, command: unknown): void;
  registerTool(tool: unknown): void;
  on(event: string, handler: (event: any, ctx?: any) => Promise<any> | any): void;
  getThinkingLevel(): string;
};

function createTestPi(thinkingLevel = "off"): TestPi {
  const level = thinkingLevel;
  return {
    providers: [],
    commands: new Map(),
    handlers: new Map(),
    tools: [],
    registerProvider(name: string, config: TestProviderConfig) {
      this.providers.push({ name, config });
    },
    registerCommand(name: string, command: unknown) {
      this.commands.set(name, command);
    },
    registerTool(tool: unknown) {
      this.tools.push(tool);
    },
    on(event: string, handler: (event: any, ctx?: any) => Promise<any> | any) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    },
    getThinkingLevel() {
      return level;
    },
  };
}

function createModelConfig(overrides: Partial<LiteLLMModelConfig> & { id: string }): LiteLLMModelConfig {
  return {
    name: overrides.id,
    reasoning: overrides.supports_reasoning ?? false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    ...overrides,
  };
}

describe("reasoning effort mode mapping", () => {
  describe("rounding: up (default)", () => {
    const testCases: Array<{
      level: string;
      expectedEffort: "low" | "medium" | "xhigh" | "none";
      expectedBudget: number;
      expectedReasoning: boolean;
      expectedEnableThinking: boolean;
    }> = [
      {
        level: "minimal",
        expectedEffort: "low",
        expectedBudget: 512,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "low",
        expectedEffort: "low",
        expectedBudget: 512,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "medium",
        expectedEffort: "medium",
        expectedBudget: 2048,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "high",
        expectedEffort: "medium",
        expectedBudget: 2048,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "xhigh",
        expectedEffort: "xhigh",
        expectedBudget: 8192,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "max",
        expectedEffort: "xhigh",
        expectedBudget: 8192,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "off",
        expectedEffort: "none",
        expectedBudget: 0,
        expectedReasoning: false,
        expectedEnableThinking: false,
      },
      {
        level: "none",
        expectedEffort: "none",
        expectedBudget: 0,
        expectedReasoning: false,
        expectedEnableThinking: false,
      },
    ];

    for (const tc of testCases) {
      it(`maps thinking level "${tc.level}" to reasoning_effort "${tc.expectedEffort}" with budget ${tc.expectedBudget}`, async () => {
        const pi = createTestPi(tc.level);
        await extension(pi as any);

        const beforeRequest = pi.handlers.get("before_provider_request")?.[0];

        const model = createModelConfig({
          id: "test-reasoning-model-up",
          supports_reasoning: true,
          reasoning_effort_levels: ["low", "medium", "xhigh", "none"],
          reasoning_effort_rounding: "up",
        });

        pi.registerProvider("litellm", {
          baseUrl: "http://127.0.0.1:4000/v1",
          models: [model],
        });

        const payload: Record<string, unknown> = { messages: [] };
        beforeRequest?.({ payload }, { model: { provider: "litellm", ...model } });

        expect(payload.extra_body).toEqual({
          reasoning_effort: tc.expectedEffort,
          thinking_budget_tokens: tc.expectedBudget,
          reasoning: tc.expectedReasoning,
          chat_template_kwargs: {
            enable_thinking: tc.expectedEnableThinking,
          },
        });
      });
    }
  });

  describe("rounding: down", () => {
    const testCases: Array<{
      level: string;
      expectedEffort: "low" | "medium" | "xhigh" | "none";
      expectedBudget: number;
      expectedReasoning: boolean;
      expectedEnableThinking: boolean;
    }> = [
      {
        level: "minimal",
        expectedEffort: "low",
        expectedBudget: 512,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "low",
        expectedEffort: "low",
        expectedBudget: 512,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "medium",
        expectedEffort: "low",
        expectedBudget: 512,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "high",
        expectedEffort: "medium",
        expectedBudget: 2048,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "xhigh",
        expectedEffort: "medium",
        expectedBudget: 2048,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "mx",
        expectedEffort: "xhigh",
        expectedBudget: 8192,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "max",
        expectedEffort: "xhigh",
        expectedBudget: 8192,
        expectedReasoning: true,
        expectedEnableThinking: true,
      },
      {
        level: "off",
        expectedEffort: "none",
        expectedBudget: 0,
        expectedReasoning: false,
        expectedEnableThinking: false,
      },
      {
        level: "none",
        expectedEffort: "none",
        expectedBudget: 0,
        expectedReasoning: false,
        expectedEnableThinking: false,
      },
    ];

    for (const tc of testCases) {
      it(`maps thinking level "${tc.level}" to reasoning_effort "${tc.expectedEffort}" with budget ${tc.expectedBudget} when rounding down`, async () => {
        const pi = createTestPi(tc.level);
        await extension(pi as any);

        const beforeRequest = pi.handlers.get("before_provider_request")?.[0];

        const model = createModelConfig({
          id: "test-reasoning-model-down",
          supports_reasoning: true,
          reasoning_effort_levels: ["low", "medium", "xhigh", "none"],
          reasoning_effort_rounding: "down",
        });

        pi.registerProvider("litellm", {
          baseUrl: "http://127.0.0.1:4000/v1",
          models: [model],
        });

        const payload: Record<string, unknown> = { messages: [] };
        beforeRequest?.({ payload }, { model: { provider: "litellm", ...model } });

        expect(payload.extra_body).toEqual({
          reasoning_effort: tc.expectedEffort,
          thinking_budget_tokens: tc.expectedBudget,
          reasoning: tc.expectedReasoning,
          chat_template_kwargs: {
            enable_thinking: tc.expectedEnableThinking,
          },
        });
      });
    }
  });

  it("preserves model-configured chat_template_kwargs like preserve_thinking", async () => {
    const pi = createTestPi("medium");
    await extension(pi as any);

    const beforeRequest = pi.handlers.get("before_provider_request")?.[0];

    const model = createModelConfig({
      id: "test-kwargs-preserve",
      supports_reasoning: true,
      reasoning_effort_levels: ["low", "medium", "xhigh", "none"],
      reasoning_effort_rounding: "up",
      extraBody: {
        chat_template_kwargs: {
          preserve_thinking: true,
          custom_flag: "custom-val",
        },
      },
    });

    pi.registerProvider("litellm", {
      baseUrl: "http://127.0.0.1:4000/v1",
      models: [model],
    });

    const payload: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload }, { model: { provider: "litellm", ...model } });

    expect(payload.extra_body).toEqual({
      reasoning_effort: "medium",
      thinking_budget_tokens: 2048,
      reasoning: true,
      chat_template_kwargs: {
        preserve_thinking: true,
        custom_flag: "custom-val",
        enable_thinking: true,
      },
    });
  });

  it("handles thinking_level_select event dynamically", async () => {
    const pi = createTestPi("off");
    await extension(pi as any);

    const beforeRequest = pi.handlers.get("before_provider_request")?.[0];
    const selectHandler = pi.handlers.get("thinking_level_select")?.[0];

    const model = createModelConfig({
      id: "test-dyn-model",
      supports_reasoning: true,
      reasoning_effort_levels: ["low", "medium", "xhigh", "none"],
      reasoning_effort_rounding: "up",
    });

    pi.registerProvider("litellm", {
      baseUrl: "http://127.0.0.1:4000/v1",
      models: [model],
    });

    // Initially off
    const p1: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload: p1 }, { model: { provider: "litellm", ...model } });
    expect(p1.extra_body).toEqual({
      reasoning_effort: "none",
      thinking_budget_tokens: 0,
      reasoning: false,
      chat_template_kwargs: { enable_thinking: false },
    });

    // Select "high"
    selectHandler?.({ level: "high" });

    const p2: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload: p2 }, { model: { provider: "litellm", ...model } });
    expect(p2.extra_body).toEqual({
      reasoning_effort: "medium",
      thinking_budget_tokens: 2048,
      reasoning: true,
      chat_template_kwargs: { enable_thinking: true },
    });

    // Select "xhigh"
    selectHandler?.({ level: "xhigh" });

    const p3: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload: p3 }, { model: { provider: "litellm", ...model } });
    expect(p3.extra_body).toEqual({
      reasoning_effort: "xhigh",
      thinking_budget_tokens: 8192,
      reasoning: true,
      chat_template_kwargs: { enable_thinking: true },
    });
  });

  it("falls back to legacy behavior when supports_reasoning is false or unset", async () => {
    const pi = createTestPi("medium");
    await extension(pi as any);

    const beforeRequest = pi.handlers.get("before_provider_request")?.[0];

    const legacyModel = createModelConfig({
      id: "legacy-model",
    });

    pi.registerProvider("litellm", {
      baseUrl: "http://127.0.0.1:4000/v1",
      models: [legacyModel],
    });

    const payload: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload }, { model: { provider: "litellm", ...legacyModel } });

    // Legacy behavior maps medium -> 4096 and does not inject reasoning_effort
    expect(payload.extra_body).toEqual({
      reasoning: true,
      thinking_budget_tokens: 4096,
    });
  });

  it("defaults to rounding up and standard levels when only supports_reasoning: true is specified", async () => {
    const pi = createTestPi("high");
    await extension(pi as any);

    const beforeRequest = pi.handlers.get("before_provider_request")?.[0];

    const model = createModelConfig({
      id: "minimal-reasoning-model",
      supports_reasoning: true,
    });

    pi.registerProvider("litellm", {
      baseUrl: "http://127.0.0.1:4000/v1",
      models: [model],
    });

    const payload: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload }, { model: { provider: "litellm", ...model } });

    // high with default rounding up -> medium -> 2048
    expect(payload.extra_body).toEqual({
      reasoning_effort: "medium",
      thinking_budget_tokens: 2048,
      reasoning: true,
      chat_template_kwargs: { enable_thinking: true },
    });
  });

  it("rounds within declared subset of levels", async () => {
    const pi = createTestPi("medium");
    await extension(pi as any);

    const beforeRequest = pi.handlers.get("before_provider_request")?.[0];

    // Model only supports low, xhigh, none (no medium)
    const modelUp = createModelConfig({
      id: "subset-model-up",
      supports_reasoning: true,
      reasoning_effort_levels: ["low", "xhigh", "none"],
      reasoning_effort_rounding: "up",
    });

    const modelDown = createModelConfig({
      id: "subset-model-down",
      supports_reasoning: true,
      reasoning_effort_levels: ["low", "xhigh", "none"],
      reasoning_effort_rounding: "down",
    });

    pi.registerProvider("litellm", {
      baseUrl: "http://127.0.0.1:4000/v1",
      models: [modelUp, modelDown],
    });

    // Medium with rounding up when medium is unavailable -> rounds up to xhigh (8192)
    const pUp: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload: pUp }, { model: { provider: "litellm", ...modelUp } });
    expect(pUp.extra_body).toEqual({
      reasoning_effort: "xhigh",
      thinking_budget_tokens: 8192,
      reasoning: true,
      chat_template_kwargs: { enable_thinking: true },
    });

    // High with rounding down when medium is unavailable -> high maps to medium, which rounds down to low (512)
    const selectHandler = pi.handlers.get("thinking_level_select")?.[0];
    selectHandler?.({ level: "high" });

    const pDown: Record<string, unknown> = { messages: [] };
    beforeRequest?.({ payload: pDown }, { model: { provider: "litellm", ...modelDown } });
    expect(pDown.extra_body).toEqual({
      reasoning_effort: "low",
      thinking_budget_tokens: 512,
      reasoning: true,
      chat_template_kwargs: { enable_thinking: true },
    });
  });
});
