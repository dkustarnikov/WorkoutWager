"use client"

import { Calendar, DollarSign, Target, AlertTriangle } from "lucide-react"
import { Card, CardContent, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { MilestoneData } from "@/components/milestones/milestone-row"

interface GoalReviewProps {
  goalName: string
  goalType: string
  generalObjective: string
  totalAmount: number
  penaltyInterestRate: number
  rewardDestination: string
  penaltyDestination: string
  allOrNothing: boolean
  milestones: MilestoneData[]
}

export function GoalReview({
  goalName,
  goalType,
  generalObjective,
  totalAmount,
  penaltyInterestRate,
  rewardDestination,
  penaltyDestination,
  allOrNothing,
  milestones,
}: GoalReviewProps) {
  const deadline = milestones.length > 0
    ? milestones[milestones.length - 1].milestoneDeadline
    : ""

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Review Your Goal</h2>
        <p className="mt-1 text-sm text-muted">
          Make sure everything looks good before creating your goal.
        </p>
      </div>

      {/* Goal Summary */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">{goalName || "Untitled Goal"}</h3>
              <p className="mt-1 text-sm text-muted">{generalObjective}</p>
            </div>
            <Badge variant="secondary">{goalType}</Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted">Total Amount</p>
                <p className="font-semibold">{formatCurrency(totalAmount)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted">Milestones</p>
                <p className="font-semibold">{milestones.length}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted">Deadline</p>
                <p className="font-semibold">
                  {deadline ? formatDate(deadline) : "Not set"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Terms */}
      <Card>
        <CardContent className="p-6">
          <h4 className="font-semibold">Financial Terms</h4>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted">Penalty Interest Rate</span>
              <span className="font-medium">{penaltyInterestRate}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Reward Destination</span>
              <span className="font-medium capitalize">{rewardDestination}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Penalty Destination</span>
              <span className="font-medium capitalize">{penaltyDestination}</span>
            </div>
            {allOrNothing && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span>All-or-Nothing mode is enabled</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Milestones List */}
      <Card>
        <CardContent className="p-6">
          <h4 className="font-semibold">Milestones</h4>
          <div className="mt-4 space-y-3">
            {milestones.map((milestone, index) => (
              <div
                key={milestone.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{milestone.milestoneName || "Untitled"}</p>
                    <p className="text-sm text-muted">
                      Due: {milestone.milestoneDeadline ? formatDate(milestone.milestoneDeadline) : "Not set"}
                    </p>
                  </div>
                </div>
                <span className="font-semibold">
                  {formatCurrency(milestone.monetaryValue)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
