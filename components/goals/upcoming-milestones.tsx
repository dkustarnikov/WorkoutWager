"use client"

import Link from "next/link"
import { Clock, ChevronRight } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui"
import { formatDate, getDaysRemaining, formatCurrency, getUrgencyLevel } from "@/lib/utils"
import type { Goal, Milestone } from "@/lib/types"

interface UpcomingMilestonesProps {
  goals: Goal[]
  limit?: number
}

interface MilestoneWithGoal extends Milestone {
  goalId: string
  goalName: string
}

export function UpcomingMilestones({ goals, limit = 5 }: UpcomingMilestonesProps) {
  // Get all pending milestones from active goals
  const upcomingMilestones: MilestoneWithGoal[] = goals
    .filter((g) => g.status === "created" || g.status === "inProgress")
    .flatMap((goal) =>
      goal.milestones
        .filter((m) => m.completion === undefined)
        .map((m) => ({
          ...m,
          goalId: goal.goalId,
          goalName: goal.goalName,
        }))
    )
    .sort(
      (a, b) =>
        new Date(a.milestoneDeadline).getTime() -
        new Date(b.milestoneDeadline).getTime()
    )
    .slice(0, limit)

  if (upcomingMilestones.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Upcoming Milestones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingMilestones.map((milestone) => {
          const daysRemaining = getDaysRemaining(milestone.milestoneDeadline)
          const urgency = getUrgencyLevel(milestone.milestoneDeadline)

          return (
            <Link
              key={`${milestone.goalId}-${milestone.milestoneId}`}
              href={`/goals/${milestone.goalId}`}
              className="group flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-background-elevated"
            >
              <div className="space-y-1">
                <p className="font-medium group-hover:text-primary transition-colors">
                  {milestone.milestoneName}
                </p>
                <p className="text-sm text-muted">{milestone.goalName}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {formatCurrency(milestone.monetaryValue)}
                  </p>
                  <Badge
                    variant={
                      urgency === "urgent"
                        ? "danger"
                        : urgency === "soon"
                        ? "warning"
                        : "secondary"
                    }
                    className="mt-1"
                  >
                    {daysRemaining === 0
                      ? "Today"
                      : daysRemaining < 0
                      ? `${Math.abs(daysRemaining)}d overdue`
                      : `${daysRemaining}d left`}
                  </Badge>
                </div>
                <ChevronRight className="h-4 w-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
