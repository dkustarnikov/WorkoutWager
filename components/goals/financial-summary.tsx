"use client"

import { DollarSign, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui"
import { formatCurrency } from "@/lib/utils"
import type { Goal } from "@/lib/types"

interface FinancialSummaryProps {
  goal: Goal
}

export function FinancialSummary({ goal }: FinancialSummaryProps) {
  const completedMilestones = goal.milestones.filter(m => m.completion === true)
  const missedMilestones = goal.milestones.filter(m => m.completion === false)
  const pendingMilestones = goal.milestones.filter(m => m.completion === undefined)

  const earnedAmount = completedMilestones.reduce((sum, m) => sum + m.monetaryValue, 0)
  const lostAmount = missedMilestones.reduce((sum, m) => {
    const penalty = m.monetaryValue * (1 + goal.penaltyInterestRate / 100)
    return sum + penalty
  }, 0)
  const atRiskAmount = pendingMilestones.reduce((sum, m) => sum + m.monetaryValue, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4" />
          Financial Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted">Total Amount</span>
          <span className="text-lg font-semibold">{formatCurrency(goal.totalAmount)}</span>
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-success">
              <TrendingUp className="h-4 w-4" />
              <span>Earned</span>
            </div>
            <span className="font-medium text-success">+{formatCurrency(earnedAmount)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-danger">
              <TrendingDown className="h-4 w-4" />
              <span>Lost</span>
            </div>
            <span className="font-medium text-danger">-{formatCurrency(lostAmount)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span>At Risk</span>
            </div>
            <span className="font-medium text-warning">{formatCurrency(atRiskAmount)}</span>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-muted">
            <span>Penalty Rate</span>
            <span>{goal.penaltyInterestRate}%</span>
          </div>
          <div className="flex items-center justify-between text-muted">
            <span>Reward goes to</span>
            <span className="capitalize">{goal.rewardDestination}</span>
          </div>
          <div className="flex items-center justify-between text-muted">
            <span>Penalty goes to</span>
            <span className="capitalize">{goal.penaltyDestination}</span>
          </div>
          {goal.allOrNothing && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">All-or-Nothing mode</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
