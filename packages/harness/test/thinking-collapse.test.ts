import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collapseThinkingInMessages,
  registerThinkingCollapseHook,
  THINKING_COLLAPSED_PLACEHOLDER,
} from "../src/hooks/thinking-collapse.js";
import {
  isThinkingCollapsed,
  resetThinkingCollapseFlag,
} from "../src/tui/shortcuts.js";
import type {
  AgentMessage,
  AssistantMessage,
  ContextEvent,
  ExtensionAPI,
} from "../src/pi/sdk.js";

afterEach(() => {
  resetThinkingCollapseFlag();
});

function makeAssistantWithThinking(thinking: string): AssistantMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "thinking",
        thinking,
        thinkingSignature: "opaque-sig-abc123",
        redacted: false,
      },
      { type: "text", text: "Here is the answer." },
    ],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-opus-4-7",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 1700000000000,
  } as AssistantMessage;
}

function makeUser(text: string): AgentMessage {
  return {
    role: "user",
    content: text,
    timestamp: 1700000000000,
  } as AgentMessage;
}

describe("collapseThinkingInMessages", () => {
  it("returns undefined when input has no thinking blocks (avoids cache invalidation)", () => {
    const messages: AgentMessage[] = [
      makeUser("hello"),
      {
        role: "assistant",
        content: [{ type: "text", text: "hi" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "claude-opus-4-7",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 1700000000000,
      } as AssistantMessage,
    ];
    expect(collapseThinkingInMessages(messages)).toBeUndefined();
  });

  it("rewrites every assistant thinking block to the placeholder", () => {
    const messages: AgentMessage[] = [
      makeUser("q1"),
      makeAssistantWithThinking("long thinking 1"),
      makeUser("q2"),
      makeAssistantWithThinking("long thinking 2"),
    ];
    const result = collapseThinkingInMessages(messages);
    expect(result).toBeDefined();
    const asst1 = result![1] as AssistantMessage;
    const asst2 = result![3] as AssistantMessage;
    expect((asst1.content[0] as { thinking: string }).thinking).toBe(
      THINKING_COLLAPSED_PLACEHOLDER,
    );
    expect((asst2.content[0] as { thinking: string }).thinking).toBe(
      THINKING_COLLAPSED_PLACEHOLDER,
    );
  });

  it("preserves thinkingSignature (multi-turn continuity)", () => {
    const messages = [makeAssistantWithThinking("body")];
    const result = collapseThinkingInMessages(messages);
    const asst = result![0] as AssistantMessage;
    expect(
      (asst.content[0] as { thinkingSignature?: string }).thinkingSignature,
    ).toBe("opaque-sig-abc123");
  });

  it("preserves the assistant's other fields (model, usage, stopReason)", () => {
    const messages = [makeAssistantWithThinking("body")];
    const result = collapseThinkingInMessages(messages);
    const asst = result![0] as AssistantMessage;
    expect(asst.model).toBe("claude-opus-4-7");
    expect(asst.provider).toBe("anthropic");
    expect(asst.stopReason).toBe("stop");
  });

  it("returns undefined when blocks are already collapsed (idempotence)", () => {
    const alreadyCollapsed: AssistantMessage = {
      ...makeAssistantWithThinking("body"),
      content: [
        {
          type: "thinking",
          thinking: THINKING_COLLAPSED_PLACEHOLDER,
          thinkingSignature: "sig",
        },
      ],
    } as AssistantMessage;
    expect(collapseThinkingInMessages([alreadyCollapsed])).toBeUndefined();
  });

  it("leaves text/tool blocks in assistant content untouched", () => {
    const msg = makeAssistantWithThinking("body");
    const result = collapseThinkingInMessages([msg]);
    const asst = result![0] as AssistantMessage;
    expect(asst.content[1]).toEqual({ type: "text", text: "Here is the answer." });
  });

  it("ignores user messages entirely", () => {
    const messages: AgentMessage[] = [
      makeUser("hello"),
      makeAssistantWithThinking("body"),
    ];
    const result = collapseThinkingInMessages(messages);
    expect(result![0]).toBe(messages[0]); // same reference — untouched
  });
});

describe("registerThinkingCollapseHook handler", () => {
  function setup(isCollapsed: () => boolean) {
    let captured:
      | ((event: ContextEvent) => { messages?: AgentMessage[] } | undefined)
      | undefined;
    const pi = {
      on: vi.fn(
        (
          name: string,
          h: (event: ContextEvent) => { messages?: AgentMessage[] } | undefined,
        ) => {
          if (name === "context") captured = h;
        },
      ),
    } as unknown as ExtensionAPI;
    registerThinkingCollapseHook(pi, { isThinkingCollapsed: isCollapsed });
    if (!captured) throw new Error("context handler not registered");
    return captured;
  }

  it("registers on the 'context' event surface", () => {
    let registered: string | undefined;
    const pi = {
      on: vi.fn((name: string) => {
        registered = name;
      }),
    } as unknown as ExtensionAPI;
    registerThinkingCollapseHook(pi, { isThinkingCollapsed: () => false });
    expect(registered).toBe("context");
  });

  it("returns undefined when the flag is OFF", () => {
    const handler = setup(() => false);
    const result = handler({
      type: "context",
      messages: [makeAssistantWithThinking("body")],
    });
    expect(result).toBeUndefined();
  });

  it("rewrites messages when the flag is ON", () => {
    const handler = setup(() => true);
    const result = handler({
      type: "context",
      messages: [makeAssistantWithThinking("body")],
    });
    expect(result).toBeDefined();
    expect(result?.messages).toBeDefined();
    const asst = result!.messages![0] as AssistantMessage;
    expect((asst.content[0] as { thinking: string }).thinking).toBe(
      THINKING_COLLAPSED_PLACEHOLDER,
    );
  });

  it("returns undefined when flag is ON but messages already collapsed (idempotent)", () => {
    const handler = setup(() => true);
    const already: AssistantMessage = {
      ...makeAssistantWithThinking("body"),
      content: [
        {
          type: "thinking",
          thinking: THINKING_COLLAPSED_PLACEHOLDER,
          thinkingSignature: "sig",
        },
      ],
    } as AssistantMessage;
    const result = handler({ type: "context", messages: [already] });
    expect(result).toBeUndefined();
  });

  it("default deps wire through to the live shortcuts.ts flag", () => {
    // Sanity: the un-touched flag is OFF, so the default-deps handler
    // returns undefined.
    expect(isThinkingCollapsed()).toBe(false);
    let captured:
      | ((event: ContextEvent) => { messages?: AgentMessage[] } | undefined)
      | undefined;
    const pi = {
      on: vi.fn((name: string, h: typeof captured) => {
        if (name === "context") captured = h;
      }),
    } as unknown as ExtensionAPI;
    registerThinkingCollapseHook(pi);
    if (!captured) throw new Error("context handler not registered");
    expect(
      captured({
        type: "context",
        messages: [makeAssistantWithThinking("body")],
      }),
    ).toBeUndefined();
  });
});
