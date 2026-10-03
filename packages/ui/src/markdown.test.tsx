import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./markdown";
afterEach(cleanup);
describe("Markdown", () => {
  it("renders GFM while blocking raw HTML and executable URLs", () => {
    const { container } = render(
      <Markdown
        text={
          "~~removed~~\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n[safe](https://example.com)"
        }
      />,
    );
    expect(container.querySelector("del")).toHaveTextContent("removed");
    expect(container.querySelector("script")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "unsafe" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });
  it("does not fetch images by default, and sanitizes even opted-in images", () => {
    const { container, rerender } = render(
      <Markdown
        text={
          "![preview](https://tracker.example/pixel) ![bad](data:image/svg+xml,bad)"
        }
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: /preview/ })).toHaveAttribute(
      "href",
      "https://tracker.example/pixel",
    );
    rerender(
      <Markdown
        allowImages
        text={
          "![preview](https://example.com/image.png) ![bad](javascript:alert)"
        }
      />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img")).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
  });
});
