"use client";

import React from "react";
import { Steps, StepsTrigger, StepsContent, StepsItem } from "./steps";
import { Hammer, Brain, Check, Loader } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIThinkingBlockProps {
  timer?: number;
  steps?: { 
    step: string; 
    status: string; 
    agent?: string; 
    details?: string; 
    progress?: number;
  }[];
  logs?: string[];
  isThinking?: boolean;
}

export default function AIThinkingBlock({
  steps = [],
  isThinking = true,
}: AIThinkingBlockProps) {
  if (steps.length === 0) {
    if (!isThinking) return null;
    return (
      <div className="flex items-center gap-2.5 text-zinc-500 text-[11px] font-mono pl-1 select-none py-1 animate-pulse">
        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-ping shrink-0" />
        <span>thinking...</span>
      </div>
    );
  }

  // Separate tool execution steps and general reasoning steps
  const toolSteps = steps.filter((s) => s.step.includes("⚒ Вызов:"));
  const reasoningSteps = steps.filter((s) => !s.step.includes("⚒ Вызов:"));

  return (
    <div className="flex flex-col space-y-4 py-2 w-full text-[11px] font-mono leading-relaxed select-none animate-[fadeIn_0.3s_ease-out]">
      {/* 1. Deep AI Reasoning Collapsible Block */}
      {reasoningSteps.length > 0 && (
        <Steps className="w-full border-b border-zinc-900 pb-3" defaultOpen={false}>
          <StepsTrigger 
            className="text-[11px] font-mono lowercase tracking-wide text-zinc-500 hover:text-zinc-350 focus:outline-none"
            leftIcon={<Brain className="size-3.5 text-zinc-500 animate-pulse" />}
          >
            ход мыслей ии-режиссера
          </StepsTrigger>
          <StepsContent className="mt-2.5">
            {reasoningSteps.map((step, i) => {
              let isDone = step.status === "done" || step.step.endsWith("✓") || step.step.includes("выполнено");
              let text = step.step;
              
              if (text.endsWith("✓")) {
                text = text.slice(0, -1).trim();
                isDone = true;
              }
              
              return (
                <StepsItem key={i} className="flex flex-col space-y-1">
                  <div className="flex items-start gap-2.5">
                    <span className={cn(
                      "text-[10px] select-none shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded-full mt-0.5 font-sans border",
                      isDone 
                        ? "border-zinc-800 text-zinc-500 bg-zinc-950" 
                        : "border-zinc-700 text-zinc-300 bg-zinc-900 animate-pulse"
                    )}>
                      {isDone ? <Check className="size-2" /> : "•"}
                    </span>
                    <span className={cn(
                      "transition-colors duration-200",
                      isDone ? "text-zinc-600" : "text-zinc-350 font-medium"
                    )}>
                      {text.toLowerCase()}
                    </span>
                  </div>
                  {step.details && (
                    <div className="pl-6 text-[9.5px] text-zinc-600 lowercase font-mono">
                      {step.details.toLowerCase()}
                    </div>
                  )}
                </StepsItem>
              );
            })}
          </StepsContent>
        </Steps>
      )}

      {/* 2. Tool Execution Block */}
      {toolSteps.length > 0 && (
        <div className="flex flex-col space-y-3 w-full">
          {toolSteps.map((step, i) => {
            const isDone = step.status === "done" || step.step.includes("[выполнено]");
            // Clean up name
            let cleanName = step.step.replace("⚒ Вызов:", "").replace("[выполнено] ✓", "").trim();
            
            return (
              <Steps key={i} className="w-full" defaultOpen={!isDone}>
                <StepsTrigger
                  className="text-[11.5px] font-sans font-medium text-zinc-350 hover:text-zinc-250 focus:outline-none"
                  leftIcon={<Hammer className={cn("size-3.5 text-zinc-400", !isDone && "animate-bounce")} />}
                >
                  tool run: {cleanName.toLowerCase()}
                </StepsTrigger>
                <StepsContent className="mt-2">
                  <StepsItem className="flex items-start gap-2.5">
                    <span className={cn(
                      "text-[10px] select-none shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded-full mt-0.5 border",
                      isDone 
                        ? "border-zinc-800 text-zinc-500 bg-zinc-950" 
                        : "border-zinc-700 text-zinc-300 bg-zinc-900 animate-pulse"
                    )}>
                      {isDone ? <Check className="size-2" /> : <Loader className="size-2 animate-spin" />}
                    </span>
                    <div className="flex flex-col space-y-0.5">
                      <span className={cn(
                        "transition-colors duration-200",
                        isDone ? "text-zinc-500" : "text-zinc-350"
                      )}>
                        {isDone ? "операция успешно завершена" : "выполняется интеграция на таймлайн..."}
                      </span>
                      {step.details && (
                        <span className="text-[9.5px] text-zinc-600 block font-mono lowercase">
                          {step.details.replace("Аргументы:", "аргументы:").toLowerCase()}
                        </span>
                      )}
                    </div>
                  </StepsItem>
                </StepsContent>
              </Steps>
            );
          })}
        </div>
      )}
    </div>
  );
}
