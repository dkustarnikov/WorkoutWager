"use client"

import Link from "next/link"
import { Calendar, DollarSign, Target, ChevronRight } from "lucide-react"
import { Card, CardContent, Progress, Badge } from "@/components/ui"
import { formatDate, formatCurrency, getDaysRemaining, calculateProgress } from "@/lib/utils"
import type { Goal, GoalStatus } from "@/lib/types"

interface GoalCardProps {
  goal: Goal
}

function getStatusBadge(status: GoalStatus, deadline: string) {
  const daysRemaining = getDaysRemaining(deadline)

  if (status === "completed") {
    return <Badge variant="success">Completed</Badge>
  }
  if (status === "failed") {
    return <Badge variant="danger">Failed</Badge>
  }
  if (status === "cancelled") {
    return <Badge variant="secondary">Cancelled</Badge>
  }
  if (daysRemaining < 0) {
    return <Badge variant="danger">Overdue</Badge>
  }
  if (daysRemaining <= 3) {
    return <Badge variant="warning">Due Soon</Badge>
  }
  if (status === "inProgress") {
    return <Badge variant="default">In Progress</Badge>
  }
  return <Badge variant="secondary">Created</Badge>
}

export function GoalCard({ goal }: GoalCardProps) {
  const progress = calculateProgress(goal.milestones)
  const daysRemaining = getDaysRemaining(goal.deadline)
  const completedMilestones = goal.milestones.filter(m => m.completion === true).length
  const totalMilestones = goal.milestones.length

  return (
    <Link href={`/goals/${goal.goalId}`}>
      <Card className="group transition-all hover:border-border-hover hover:bg-background-elevated">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {goal.goalName}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted line-clamp-1">
                    {goal.generalObjective}
                  </p>
                </div>
                {getStatusBadge(goal.status, goal.deadline)}
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Progress</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-muted">
                  <Target className="h-4 w-4" />
                  <span>{completedMilestones}/{totalMilestones} milestones</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {daysRemaining > 0
                      ? `${daysRemaining} days left`
                      : daysRemaining === 0
                      ? "Due today"
                      : `${Math.abs(daysRemaining)} days ago`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted">
                  <DollarSign className="h-4 w-4" />
                  <span>{formatCurrency(goal.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight className="h-5 w-5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
