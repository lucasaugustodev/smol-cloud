import { useState } from "react";

interface Props {
  name: string;
  input: string;
  output?: string;
  done: boolean;
}

export default function ToolCall({ name, input, output, done }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-800 transition"
      >
        <span className="text-xs">{done ? "\u2713" : "\u25B6"}</span>
        <span className="font-mono font-medium text-gray-300">{name}</span>
        {!done && (
          <span className="ml-auto inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold text-gray-500">Input</p>
            <pre className="overflow-x-auto rounded bg-gray-950 p-2 font-mono text-xs text-gray-400">
              {input}
            </pre>
          </div>
          {output != null && (
            <div>
              <p className="mb-1 text-xs font-semibold text-gray-500">Output</p>
              <pre className="overflow-x-auto rounded bg-gray-950 p-2 font-mono text-xs text-gray-400">
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
