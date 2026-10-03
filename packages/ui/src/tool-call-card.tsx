import { useId, useState, type ReactNode } from "react";
import type { ToolItem } from "@openhands/canvas-core";
import { classes, type UIProps } from "./common";
import { useUILabels } from "./labels";
export interface ToolCallCardProps extends UIProps {
  tool: ToolItem;
  defaultExpanded?: boolean;
  renderInput?: (input: unknown, tool: ToolItem) => ReactNode;
  renderOutput?: (output: unknown, tool: ToolItem) => ReactNode;
  renderRisk?: (risk: string, tool: ToolItem) => ReactNode;
  renderSummary?: (tool: ToolItem) => ReactNode;
}
function display(value: unknown): string {
  if (typeof value === "string") return value;
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(
      value,
      (_, item: unknown) => {
        if (typeof item === "bigint") return String(item);
        if (item && typeof item === "object") {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      },
      2,
    ) ?? ""
  );
}
export function ToolCallCard({
  tool,
  defaultExpanded = false,
  renderInput,
  renderOutput,
  renderRisk,
  renderSummary,
  labels: overrides,
  className,
  style,
}: ToolCallCardProps) {
  const labels = useUILabels(overrides);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const id = useId();
  return (
    <article
      className={classes("oh-tool", className)}
      style={style}
      data-status={tool.status}
    >
      <button
        className="oh-tool-toggle"
        type="button"
        id={`${id}-toggle`}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span className="oh-tool-title">
          {renderSummary ? (
            renderSummary(tool)
          ) : (
            <>
              <strong>{tool.name}</strong>
              {tool.summary && <span className="oh-muted">{tool.summary}</span>}
            </>
          )}
        </span>
        <span className="oh-badge">{labels[tool.status]}</span>
      </button>
      {expanded && (
        <div
          id={id}
          className="oh-tool-body"
          role="region"
          aria-labelledby={`${id}-toggle`}
        >
          {tool.risk && (
            <section>
              <h4>{labels.risk}</h4>
              {renderRisk ? renderRisk(tool.risk, tool) : <p>{tool.risk}</p>}
            </section>
          )}
          <section>
            <h4>{labels.input}</h4>
            {renderInput ? (
              renderInput(tool.input, tool)
            ) : (
              <pre>{display(tool.input)}</pre>
            )}
          </section>
          {tool.output !== undefined && (
            <section>
              <h4>{labels.output}</h4>
              {renderOutput ? (
                renderOutput(tool.output, tool)
              ) : (
                <pre>{display(tool.output)}</pre>
              )}
            </section>
          )}
        </div>
      )}
    </article>
  );
}
