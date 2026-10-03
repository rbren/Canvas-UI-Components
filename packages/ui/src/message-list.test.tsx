import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import type { MessageItem, ToolItem } from "@openhands/canvas-core";
import { MessageList } from "./message-list";
import { ToolCallCard } from "./tool-call-card";
afterEach(cleanup);
const message = (id: string): MessageItem => ({
  type: "message",
  id,
  text: id,
  role: "assistant",
  images: [],
});
const tool: ToolItem = {
  type: "tool",
  id: "call",
  name: "terminal",
  input: { command: "pwd" },
  output: "/workspace",
  risk: "LOW",
  status: "completed",
};
it("collapses tool details and exposes custom input, output, and risk slots", async () => {
  render(
    <ToolCallCard
      tool={tool}
      renderInput={() => <p>Custom input</p>}
      renderOutput={() => <p>Custom output</p>}
      renderRisk={(risk) => <p>Risk: {risk}</p>}
    />,
  );
  const toggle = screen.getByRole("button");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Custom input")).not.toBeInTheDocument();
  await userEvent.click(toggle);
  expect(screen.getByRole("region")).toHaveTextContent("Custom input");
  expect(screen.getByRole("region")).toHaveTextContent("Custom output");
  expect(screen.getByRole("region")).toHaveTextContent("Risk: LOW");
  expect(toggle).toHaveAttribute(
    "aria-controls",
    screen.getByRole("region").id,
  );
});
it("uses named tool renderers with default fallback for unknown tool names", () => {
  render(
    <MessageList
      items={[tool, { ...tool, id: "other", name: "toString" }]}
      toolRenderers={{ terminal: (item) => <p>Terminal: {item.status}</p> }}
    />,
  );
  expect(screen.getByText("Terminal: completed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /toString/ })).toBeInTheDocument();
});
it("preserves a scrolled-up position on append and prepend, then follows after jumping to latest", async () => {
  const items = [message("middle"), message("last")];
  const { rerender } = render(<MessageList items={items} />);
  const viewport = screen.getByRole("region", { name: "Messages" });
  let height = 1000;
  // jsdom does not calculate layout, so provide only the viewport geometry.
  Object.defineProperties(viewport, {
    scrollHeight: { get: () => height },
    clientHeight: { value: 200 },
  });
  viewport.scrollTop = 100;
  fireEvent.scroll(viewport);
  height = 1100;
  rerender(<MessageList items={[...items, message("new")]} />);
  expect(viewport.scrollTop).toBe(100);
  height = 1300;
  rerender(
    <MessageList items={[message("older"), ...items, message("new")]} />,
  );
  expect(viewport.scrollTop).toBe(300);
  await userEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
  expect(viewport.scrollTop).toBe(1300);
  height = 1400;
  rerender(
    <MessageList
      items={[message("older"), ...items, message("new"), message("newest")]}
    />,
  );
  expect(viewport.scrollTop).toBe(1400);
});
