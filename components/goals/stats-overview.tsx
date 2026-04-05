"use client"

import { Target, Trophy, AlertTriangle, DollarSign } from "lucide-react"
import { Card, CardContent } from "@/components/ui"
import { formatCurrency } from "@/lib/utils"
import type { Goal } from "@/lib/types"

interface StatsOverviewProps {
  goals: Goal[]
}

export function StatsOverview({ goals }: StatsOverviewProps) {
  const activeGoals = goals.filter(
    (g) => g.status === "created" || g.status === "inProgress"
  ).length

  const completedGoals = goals.filter((g) => g.status === "completed").length
  const failedGoals = goals.filter(
    (g) => g.status === "failed" || g.status === "cancelled"
  ).length

  const totalAtStake = goals
    .filter((g) => g.status === "created" || g.status === "inProgress")
    .reduce((sum, g) => sum + g.totalAmount, 0)

  const successRate =
    completedGoals + failedGoals > 0
      ? Math.round((completedGoals / (completedGoals + failedGoals)) * 100)
      : 0

  const stats = [
    {
      label: "Active Goals",
      value: activeGoals,
      icon: Target,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Completed",
      value: completedGoals,
      icon: Trophy,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Failed",
      value: failedGoals,
      icon: AlertTriangle,
      color: "text-danger",
      bgColor: "bg-danger/10",
    },
    {
      label: "At Stake",
      value: formatCurrency(totalAtStake),
      icon: DollarSign,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className={`rounded-lg p-2.5 ${stat.bgColor}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted">{stat.label}</p>
              <p className="text-2xl font-semibold">{stat.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
