import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./chat-composer";
afterEach(cleanup);
describe("ChatComposer", () => {
  it("keeps failed text, exposes the error, and clears only after successful retry", async () => {
    const user = userEvent.setup();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server unavailable"))
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    render(<ChatComposer onSend={send} onError={onError} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "Keep this draft{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server unavailable",
    );
    expect(input).toHaveValue("Keep this draft");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(input).toHaveValue(""));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("allows multiline and IME input without sending and blocks disabled submission", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ChatComposer onSend={send} />);
    const input = screen.getByRole("textbox");
    await user.type(input, "hello{Shift>}{Enter}{/Shift}world");
    expect(input).toHaveValue("hello\nworld");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(send).not.toHaveBeenCalled();
    rerender(<ChatComposer onSend={send} disabled />);
    fireEvent.submit(input.closest("form")!);
    expect(send).not.toHaveBeenCalled();
  });
  it("prevents duplicate submissions while sending", async () => {
    let resolve!: () => void;
    const send = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    render(<ChatComposer onSend={send} />);
    await user.type(screen.getByRole("textbox"), "hello{Enter}");
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(send).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  });
});
