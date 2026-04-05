"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui"
import { MilestoneCard } from "./milestone-card"
import type { Milestone } from "@/lib/types"

interface MilestoneTimelineProps {
  milestones: Milestone[]
  goalId: string
  isGoalActive: boolean
  onCompleteMilestone: (milestoneId: string) => Promise<void>
}

export function MilestoneTimeline({
  milestones,
  goalId,
  isGoalActive,
  onCompleteMilestone,
}: MilestoneTimelineProps) {
  // Sort milestones by counter (order)
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.milestoneCounter - b.milestoneCounter
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Milestones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedMilestones.map((milestone) => (
          <MilestoneCard
            key={milestone.milestoneId}
            milestone={milestone}
            goalId={goalId}
            isGoalActive={isGoalActive}
            onComplete={onCompleteMilestone}
          />
        ))}
      </CardContent>
    </Card>
  )
}
