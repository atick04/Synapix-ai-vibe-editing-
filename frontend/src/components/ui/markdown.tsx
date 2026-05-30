import { cn } from "@/lib/utils"
import { memo } from "react"

export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: any
  showCursor?: boolean
}

function SimpleMarkdownRenderer({ children, className, showCursor }: MarkdownProps) {
  const lines = children.split('\n');
  
  return (
    <div className={cn("whitespace-pre-wrap text-zinc-400 font-mono text-[11px] leading-relaxed", className)}>
      {lines.map((line, idx) => {
        const isLastLine = idx === lines.length - 1;
        const trimmed = line.trim();
        
        // Skip code fences
        if (trimmed.startsWith("```")) {
          return null;
        }
        
        // Bullet list item
        const listMatch = line.match(/^(\s*)-\s+(.*)/);
        if (listMatch) {
          const indent = listMatch[1].length * 8;
          return (
            <div key={idx} className="flex items-start gap-1.5 py-0.5" style={{ paddingLeft: `${indent}px` }}>
              <span className="text-zinc-600 select-none">•</span>
              <span className="text-zinc-400">
                {listMatch[2]}
                {isLastLine && showCursor && (
                  <span className="inline-block w-1.5 h-3.5 bg-blue-500 ml-1 animate-pulse-cursor align-middle" />
                )}
              </span>
            </div>
          );
        }
        
        return (
          <div key={idx} className="min-h-[16px] text-zinc-400">
            {line}
            {isLastLine && showCursor && (
              <span className="inline-block w-1.5 h-3.5 bg-blue-500 ml-1 animate-pulse-cursor align-middle" />
            )}
          </div>
        );
      })}
    </div>
  );
}

const Markdown = memo(SimpleMarkdownRenderer)
Markdown.displayName = "Markdown"

export { Markdown }
