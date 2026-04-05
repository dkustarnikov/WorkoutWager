"use client"

import { Input, Label, Textarea } from "@/components/ui"

interface GoalBasicsData {
  goalName: string
  goalType: string
  generalObjective: string
}

interface GoalBasicsFormProps {
  data: GoalBasicsData
  onChange: (data: GoalBasicsData) => void
}

const goalTypes = [
  { value: "fitness", label: "Fitness" },
  { value: "health", label: "Health" },
  { value: "nutrition", label: "Nutrition" },
  { value: "habit", label: "Habit" },
  { value: "other", label: "Other" },
]

export function GoalBasicsForm({ data, onChange }: GoalBasicsFormProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Goal Basics</h2>
        <p className="mt-1 text-sm text-muted">
          Give your goal a name and describe what you want to achieve.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="goalName">Goal Name</Label>
          <Input
            id="goalName"
            placeholder="e.g., Run a Marathon, Lose 20 pounds"
            value={data.goalName}
            onChange={(e) => onChange({ ...data, goalName: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="goalType">Goal Type</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {goalTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => onChange({ ...data, goalType: type.value })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  data.goalType === type.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-background-elevated"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="generalObjective">General Objective</Label>
          <Textarea
            id="generalObjective"
            placeholder="Describe what you want to achieve and why it matters to you..."
            rows={3}
            value={data.generalObjective}
            onChange={(e) =>
              onChange({ ...data, generalObjective: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  )
}
