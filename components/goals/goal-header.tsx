"use client"

import { Badge, Progress } from "@/components/ui"
import { calculateProgress, formatDate, getDaysRemaining } from "@/lib/utils"
import type { Goal, GoalStatus } from "@/lib/types"

interface GoalHeaderProps {
  goal: Goal
}

function getStatusBadge(status: GoalStatus) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Completed</Badge>
    case "failed":
      return <Badge variant="danger">Failed</Badge>
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>
    case "inProgress":
      return <Badge variant="default">In Progress</Badge>
    default:
      return <Badge variant="secondary">Created</Badge>
  }
}

export function GoalHeader({ goal }: GoalHeaderProps) {
  const progress = calculateProgress(goal.milestones)
  const daysRemaining = getDaysRemaining(goal.deadline)
  const completedMilestones = goal.milestones.filter(m => m.completion === true).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{goal.goalName}</h1>
            {getStatusBadge(goal.status)}
          </div>
          <p className="mt-1 text-muted">{goal.generalObjective}</p>
        </div>
      </div>

      {/* Progress Section */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Overall Progress</p>
            <p className="text-3xl font-bold">{progress}%</p>
          </div>
          <div>
            <p className="text-sm text-muted">Milestones</p>
            <p className="text-lg font-semibold">
              {completedMilestones} / {goal.milestones.length}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Deadline</p>
            <p className="text-lg font-semibold">{formatDate(goal.deadline)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Time Remaining</p>
            <p className={`text-lg font-semibold ${daysRemaining < 0 ? "text-danger" : daysRemaining <= 7 ? "text-warning" : ""}`}>
              {daysRemaining < 0
                ? `${Math.abs(daysRemaining)} days overdue`
                : daysRemaining === 0
                ? "Due today"
                : `${daysRemaining} days`}
            </p>
          </div>
        </div>
        <Progress value={progress} className="mt-4 h-3" />
      </div>
    </div>
  )
}
