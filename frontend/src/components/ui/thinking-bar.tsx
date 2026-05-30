"use client"

import { TextShimmer } from "@/components/ui/text-shimmer"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

type ThinkingBarProps = {
  className?: string
  text?: string
  onStop?: () => void
  stopLabel?: string
  onClick?: () => void
}

export function ThinkingBar({
  className,
  text = "Thinking",
  onStop,
  stopLabel = "Answer now",
  onClick,
}: ThinkingBarProps) {
  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1 text-sm transition-opacity hover:opacity-80 focus:outline-none select-none cursor-pointer"
        >
          <TextShimmer className="font-medium text-[11px] font-mono tracking-wide">{text}</TextShimmer>
          <ChevronRight className="text-zinc-500 size-3.5" />
        </button>
      ) : (
        <TextShimmer className="cursor-default font-medium text-[11px] font-mono tracking-wide">{text}</TextShimmer>
      )}
      {onStop ? (
        <button
          onClick={onStop}
          type="button"
          className="text-zinc-500 hover:text-zinc-350 border-zinc-700 hover:border-zinc-500 border-b border-dotted text-[10px] font-mono transition-colors focus:outline-none select-none cursor-pointer"
        >
          {stopLabel}
        </button>
      ) : null}
    </div>
  )
}
