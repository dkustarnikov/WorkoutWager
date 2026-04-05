"use client"

import * as React from "react"
import { Check, X, Clock, CheckCircle2 } from "lucide-react"
import {
  Card,
  CardContent,
  Button,
  Badge,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui"
import { formatDate, formatCurrency, getDaysRemaining, getUrgencyLevel } from "@/lib/utils"
import type { Milestone } from "@/lib/types"

interface MilestoneCardProps {
  milestone: Milestone
  goalId: string
  onComplete: (milestoneId: string) => Promise<void>
  isGoalActive: boolean
}

export function MilestoneCard({
  milestone,
  goalId,
  onComplete,
  isGoalActive,
}: MilestoneCardProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)

  const isPending = milestone.completion === undefined
  const isCompleted = milestone.completion === true
  const isMissed = milestone.completion === false

  const daysRemaining = getDaysRemaining(milestone.milestoneDeadline)
  const urgency = getUrgencyLevel(milestone.milestoneDeadline)

  const handleComplete = async () => {
    setIsLoading(true)
    try {
      await onComplete(milestone.milestoneId)
      setDialogOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card
      className={`transition-colors ${
        isCompleted
          ? "border-success/30 bg-success/5"
          : isMissed
          ? "border-danger/30 bg-danger/5"
          : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* Status Icon */}
            <div
              className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                isCompleted
                  ? "bg-success text-success-foreground"
                  : isMissed
                  ? "bg-danger text-danger-foreground"
                  : "bg-secondary"
              }`}
            >
              {isCompleted ? (
                <Check className="h-4 w-4 text-white" />
              ) : isMissed ? (
                <X className="h-4 w-4 text-white" />
              ) : (
                <span className="text-sm font-medium">{milestone.milestoneCounter}</span>
              )}
            </div>

            {/* Content */}
            <div>
              <h4 className="font-medium">{milestone.milestoneName}</h4>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(milestone.milestoneDeadline)}
                </span>
                {isPending && (
                  <Badge
                    variant={
                      urgency === "urgent"
                        ? "danger"
                        : urgency === "soon"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {daysRemaining === 0
                      ? "Due today"
                      : daysRemaining < 0
                      ? `${Math.abs(daysRemaining)}d overdue`
                      : `${daysRemaining}d left`}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Amount and Action */}
          <div className="flex items-center gap-3">
            <span className="font-semibold">{formatCurrency(milestone.monetaryValue)}</span>

            {isPending && isGoalActive && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Complete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Complete Milestone</DialogTitle>
                    <DialogDescription>
                      Mark &quot;{milestone.milestoneName}&quot; as complete? This will credit{" "}
                      {formatCurrency(milestone.monetaryValue)} to your reward destination.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleComplete} disabled={isLoading}>
                      {isLoading ? "Completing..." : "Confirm"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
