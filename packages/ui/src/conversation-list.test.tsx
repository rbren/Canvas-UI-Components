import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationInfo } from "@openhands/canvas-core";
import { ConversationExecutionStatus } from "@openhands/typescript-client";
import { ConversationList } from "./conversation-list";
import { UILabelsProvider } from "./labels";
afterEach(cleanup);
const conversation: ConversationInfo = {
  id: "first",
  title: "First conversation",
  execution_status: ConversationExecutionStatus.IDLE,
  confirmation_policy: {},
  activated_knowledge_skills: [],
  agent: { kind: "Agent", llm: { model: "test-model" } },
  workspace: {},
  persistence_dir: "",
};
it("selects explicit IDs, marks the active conversation, and inherits labels", async () => {
  const onSelect = vi.fn();
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(
    <UILabelsProvider labels={{ newConversation: "Start a chat" }}>
      <ConversationList
        conversations={[conversation]}
        activeId="first"
        onSelect={onSelect}
        onCreate={onCreate}
      />
    </UILabelsProvider>,
  );
  const item = screen.getByRole("button", { name: /First conversation/ });
  expect(item).toHaveAttribute("aria-current", "page");
  await userEvent.click(item);
  expect(onSelect).toHaveBeenCalledWith("first");
  await userEvent.click(screen.getByRole("button", { name: "Start a chat" }));
  expect(onCreate).toHaveBeenCalledOnce();
});
