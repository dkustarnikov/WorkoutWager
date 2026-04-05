"use client"

import { DollarSign, Info } from "lucide-react"
import { Input, Label } from "@/components/ui"

interface FinancialStakesData {
  totalAmount: number
  penaltyInterestRate: number
  rewardDestination: string
  penaltyDestination: string
  allOrNothing: boolean
}

interface FinancialStakesFormProps {
  data: FinancialStakesData
  onChange: (data: FinancialStakesData) => void
}

const destinations = [
  { value: "savings", label: "Savings" },
  { value: "charity", label: "Charity" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
]

export function FinancialStakesForm({ data, onChange }: FinancialStakesFormProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Financial Stakes</h2>
        <p className="mt-1 text-sm text-muted">
          Set the amount at stake and where it goes.
        </p>
      </div>

      <div className="space-y-4">
        {/* Total Amount */}
        <div className="space-y-2">
          <Label htmlFor="totalAmount">Total Amount at Stake</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              id="totalAmount"
              type="number"
              min="1"
              placeholder="500"
              className="pl-10"
              value={data.totalAmount || ""}
              onChange={(e) =>
                onChange({ ...data, totalAmount: Number(e.target.value) })
              }
            />
          </div>
          <p className="text-xs text-muted">
            This will be distributed across your milestones
          </p>
        </div>

        {/* Penalty Interest Rate */}
        <div className="space-y-2">
          <Label htmlFor="penaltyRate">Penalty Interest Rate (%)</Label>
          <div className="relative">
            <Input
              id="penaltyRate"
              type="number"
              min="0"
              max="100"
              placeholder="20"
              value={data.penaltyInterestRate || ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  penaltyInterestRate: Number(e.target.value),
                })
              }
            />
          </div>
          <p className="text-xs text-muted">
            Extra percentage added to penalties when you miss a milestone
          </p>
        </div>

        {/* All or Nothing Toggle */}
        <div className="flex items-start gap-3 rounded-lg border border-border p-4">
          <input
            type="checkbox"
            id="allOrNothing"
            checked={data.allOrNothing}
            onChange={(e) =>
              onChange({ ...data, allOrNothing: e.target.checked })
            }
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <div>
            <Label htmlFor="allOrNothing" className="cursor-pointer">
              All or Nothing Mode
            </Label>
            <p className="mt-0.5 text-xs text-muted">
              If enabled, missing any milestone forfeits the entire amount
            </p>
          </div>
        </div>

        {/* Reward Destination */}
        <div className="space-y-2">
          <Label>Reward Destination</Label>
          <p className="text-xs text-muted">Where your money goes when you succeed</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {destinations.map((dest) => (
              <button
                key={dest.value}
                type="button"
                onClick={() =>
                  onChange({ ...data, rewardDestination: dest.value })
                }
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  data.rewardDestination === dest.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-background-elevated"
                }`}
              >
                {dest.label}
              </button>
            ))}
          </div>
        </div>

        {/* Penalty Destination */}
        <div className="space-y-2">
          <Label>Penalty Destination</Label>
          <p className="text-xs text-muted">Where your money goes if you fail</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {destinations.map((dest) => (
              <button
                key={dest.value}
                type="button"
                onClick={() =>
                  onChange({ ...data, penaltyDestination: dest.value })
                }
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  data.penaltyDestination === dest.value
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-border hover:bg-background-elevated"
                }`}
              >
                {dest.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
