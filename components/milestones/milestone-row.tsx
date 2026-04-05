"use client"

import { Trash2, GripVertical } from "lucide-react"
import { Input, Button } from "@/components/ui"

export interface MilestoneData {
  id: string
  milestoneName: string
  type: string
  milestoneDeadline: string
  monetaryValue: number
}

interface MilestoneRowProps {
  milestone: MilestoneData
  index: number
  onChange: (id: string, data: Partial<MilestoneData>) => void
  onRemove: (id: string) => void
  canRemove: boolean
}

export function MilestoneRow({
  milestone,
  index,
  onChange,
  onRemove,
  canRemove,
}: MilestoneRowProps) {
  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border bg-background-card p-4">
      <div className="flex h-10 items-center text-muted">
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {index + 1}
          </span>
          <Input
            placeholder="Milestone name"
            value={milestone.milestoneName}
            onChange={(e) =>
              onChange(milestone.id, { milestoneName: e.target.value })
            }
            className="flex-1"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted">Deadline</label>
            <Input
              type="date"
              value={milestone.milestoneDeadline}
              onChange={(e) =>
                onChange(milestone.id, { milestoneDeadline: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">Amount ($)</label>
            <Input
              type="number"
              min="0"
              placeholder="100"
              value={milestone.monetaryValue || ""}
              onChange={(e) =>
                onChange(milestone.id, {
                  monetaryValue: Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      </div>

      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
          onClick={() => onRemove(milestone.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
