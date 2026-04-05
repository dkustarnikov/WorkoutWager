"use client"

import * as React from "react"
import { Plus, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui"
import { MilestoneRow, type MilestoneData } from "./milestone-row"
import { formatCurrency } from "@/lib/utils"

interface MilestonesBuilderProps {
  milestones: MilestoneData[]
  totalAmount: number
  goalType: string
  onChange: (milestones: MilestoneData[]) => void
}

export function MilestonesBuilder({
  milestones,
  totalAmount,
  goalType,
  onChange,
}: MilestonesBuilderProps) {
  const allocatedAmount = milestones.reduce((sum, m) => sum + (m.monetaryValue || 0), 0)
  const remainingAmount = totalAmount - allocatedAmount
  const isBalanced = remainingAmount === 0

  const addMilestone = () => {
    const newMilestone: MilestoneData = {
      id: `milestone-${Date.now()}`,
      milestoneName: "",
      type: goalType,
      milestoneDeadline: "",
      monetaryValue: 0,
    }
    onChange([...milestones, newMilestone])
  }

  const updateMilestone = (id: string, data: Partial<MilestoneData>) => {
    onChange(
      milestones.map((m) => (m.id === id ? { ...m, ...data } : m))
    )
  }

  const removeMilestone = (id: string) => {
    onChange(milestones.filter((m) => m.id !== id))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Milestones</h2>
        <p className="mt-1 text-sm text-muted">
          Break your goal into achievable milestones with deadlines and amounts.
        </p>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-background-card p-4">
        <div>
          <p className="text-sm text-muted">Total Amount</p>
          <p className="text-lg font-semibold">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <p className="text-sm text-muted">Allocated</p>
          <p className="text-lg font-semibold">{formatCurrency(allocatedAmount)}</p>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <p className="text-sm text-muted">Remaining</p>
          <p
            className={`text-lg font-semibold ${
              remainingAmount < 0
                ? "text-danger"
                : remainingAmount > 0
                ? "text-warning"
                : "text-success"
            }`}
          >
            {formatCurrency(remainingAmount)}
          </p>
        </div>
      </div>

      {/* Warning if not balanced */}
      {!isBalanced && milestones.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertCircle className="h-4 w-4" />
          <span>
            {remainingAmount > 0
              ? `You still need to allocate ${formatCurrency(remainingAmount)}`
              : `You've allocated ${formatCurrency(Math.abs(remainingAmount))} more than the total amount`}
          </span>
        </div>
      )}

      {/* Milestones List */}
      <div className="space-y-3">
        {milestones.map((milestone, index) => (
          <MilestoneRow
            key={milestone.id}
            milestone={milestone}
            index={index}
            onChange={updateMilestone}
            onRemove={removeMilestone}
            canRemove={milestones.length > 1}
          />
        ))}
      </div>

      {/* Add Milestone Button */}
      <Button type="button" variant="outline" onClick={addMilestone} className="w-full">
        <Plus className="h-4 w-4" />
        Add Milestone
      </Button>
    </div>
  )
}
