"use client"

import * as React from "react"
import { GoalCard } from "./goal-card"
import { Button } from "@/components/ui"
import type { Goal, GoalStatus } from "@/lib/types"

interface GoalsListProps {
  goals: Goal[]
}

type FilterType = "all" | "active" | "completed" | "failed"

export function GoalsList({ goals }: GoalsListProps) {
  const [filter, setFilter] = React.useState<FilterType>("all")

  const filteredGoals = React.useMemo(() => {
    if (filter === "all") return goals

    return goals.filter((goal) => {
      if (filter === "active") {
        return goal.status === "created" || goal.status === "inProgress"
      }
      if (filter === "completed") {
        return goal.status === "completed"
      }
      if (filter === "failed") {
        return goal.status === "failed" || goal.status === "cancelled"
      }
      return true
    })
  }, [goals, filter])

  const filters: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Completed", value: "completed" },
    { label: "Failed", value: "failed" },
  ]

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Goals grid */}
      {filteredGoals.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted">No goals found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredGoals.map((goal) => (
            <GoalCard key={goal.goalId} goal={goal} />
          ))}
        </div>
      )}
    </div>
  )
}
