"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

export type StepsItemProps = React.ComponentProps<"div">

export const StepsItem = ({
  children,
  className,
  ...props
}: StepsItemProps) => (
  <div className={cn("text-zinc-500 text-[11px] font-mono leading-relaxed", className)} {...props}>
    {children}
  </div>
)

export type StepsTriggerProps = React.ComponentProps<
  typeof CollapsibleTrigger
> & {
  leftIcon?: React.ReactNode
  swapIconOnHover?: boolean
}

export const StepsTrigger = ({
  children,
  className,
  leftIcon,
  swapIconOnHover = true,
  ...props
}: StepsTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "group text-zinc-400 hover:text-zinc-200 flex w-full cursor-pointer items-center justify-start gap-2 text-[12px] font-sans transition-colors focus:outline-none select-none",
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-2">
      {leftIcon ? (
        <span className="relative inline-flex size-4 items-center justify-center">
          <span
            className={cn(
              "transition-opacity duration-200",
              swapIconOnHover && "group-hover:opacity-0"
            )}
          >
            {leftIcon}
          </span>
          {swapIconOnHover && (
            <ChevronDown className="absolute size-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-data-[state=open]:rotate-180" />
          )}
        </span>
      ) : null}
      <span>{children}</span>
    </div>
    {!leftIcon && (
      <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180 ml-1.5" />
    )}
  </CollapsibleTrigger>
)

export type StepsContentProps = React.ComponentProps<
  typeof CollapsibleContent
> & {
  bar?: React.ReactNode
}

export const StepsContent = ({
  children,
  className,
  bar,
  ...props
}: StepsContentProps) => {
  return (
    <CollapsibleContent
      className={cn(
        "text-zinc-400 overflow-hidden transition-all duration-200 ease-out data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down",
        className
      )}
      {...props}
    >
      <div className="mt-2 grid max-w-full min-w-0 grid-cols-[min-content_minmax(0,1fr)] items-start gap-x-3.5">
        <div className="min-w-0 self-stretch">{bar ?? <StepsBar />}</div>
        <div className="min-w-0 space-y-2 py-0.5">{children}</div>
      </div>
    </CollapsibleContent>
  )
}

export type StepsBarProps = React.HTMLAttributes<HTMLDivElement>

export const StepsBar = ({ className, ...props }: StepsBarProps) => (
  <div
    className={cn("bg-zinc-800/80 h-full w-[2px] rounded-full mx-1.5", className)}
    aria-hidden
    {...props}
  />
)

export type StepsProps = React.ComponentProps<typeof Collapsible>

export function Steps({ defaultOpen = true, className, ...props }: StepsProps) {
  return (
    <Collapsible
      className={cn(className)}
      defaultOpen={defaultOpen}
      {...props}
    />
  )
}
