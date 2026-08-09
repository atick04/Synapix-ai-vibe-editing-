import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useVibe } from "@/context/VibeContext";

export interface AnimatedListProps {
  children: React.ReactNode;
  activeTime: number; // Time in seconds elapsed since scene start
  delay?: number;     // Standard delay in seconds between items
}

export function AnimatedList({ children, activeTime, delay = 0.35 }: AnimatedListProps) {
  const childrenArray = React.Children.toArray(children);
  const { vibeConfig } = useVibe();

  // Adjust delay based on pacing multiplier
  const adjustedDelay = delay / vibeConfig.global.pacingMultiplier;

  return (
    <div className="flex flex-col gap-4 w-full items-center">
      <AnimatePresence mode="popLayout">
        {childrenArray.map((child, idx) => {
          const itemTriggerTime = idx * adjustedDelay;
          const isTriggered = activeTime >= itemTriggerTime;
          if (!isTriggered) return null;

          return (
            <AnimatedListItem key={(child as any).key || idx} physics={vibeConfig.physics}>
              {child}
            </AnimatedListItem>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function AnimatedListItem({
  children,
  physics,
}: {
  children: React.ReactNode;
  physics: { mass: number; stiffness: number; damping: number };
}) {
  const animations = {
    initial: { scale: 0.85, opacity: 0, y: 15 },
    animate: { scale: 1, opacity: 1, y: 0 },
    exit: { scale: 0.85, opacity: 0, y: -15 },
    transition: {
      type: "spring" as const,
      mass: physics.mass,
      stiffness: physics.stiffness,
      damping: physics.damping,
    },
  };

  return (
    <motion.div {...animations} layout className="w-full">
      {children}
    </motion.div>
  );
}
