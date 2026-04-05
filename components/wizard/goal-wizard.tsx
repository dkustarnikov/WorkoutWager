"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button, Card, CardContent } from "@/components/ui"
import { WizardProgress } from "./wizard-progress"
import { GoalBasicsForm } from "./goal-basics-form"
import { FinancialStakesForm } from "./financial-stakes-form"
import { MilestonesBuilder } from "@/components/milestones/milestones-builder"
import { GoalReview } from "@/components/goals/goal-review"
import { api } from "@/lib/api"
import type { MilestoneData } from "@/components/milestones/milestone-row"

const STEPS = ["Basics", "Stakes", "Milestones", "Review"]

interface GoalFormData {
  // Step 1
  goalName: string
  goalType: string
  generalObjective: string
  // Step 2
  totalAmount: number
  penaltyInterestRate: number
  rewardDestination: string
  penaltyDestination: string
  allOrNothing: boolean
  // Step 3
  milestones: MilestoneData[]
}

const initialFormData: GoalFormData = {
  goalName: "",
  goalType: "fitness",
  generalObjective: "",
  totalAmount: 0,
  penaltyInterestRate: 10,
  rewardDestination: "savings",
  penaltyDestination: "charity",
  allOrNothing: false,
  milestones: [
    {
      id: "milestone-1",
      milestoneName: "",
      type: "fitness",
      milestoneDeadline: "",
      monetaryValue: 0,
    },
  ],
}

export function GoalWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = React.useState(0)
  const [formData, setFormData] = React.useState<GoalFormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.goalName && formData.goalType && formData.generalObjective
      case 1:
        return formData.totalAmount > 0
      case 2: {
        const allocatedAmount = formData.milestones.reduce(
          (sum, m) => sum + (m.monetaryValue || 0),
          0
        )
        return (
          formData.milestones.length > 0 &&
          formData.milestones.every((m) => m.milestoneName && m.milestoneDeadline && m.monetaryValue > 0) &&
          allocatedAmount === formData.totalAmount
        )
      }
      case 3:
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError("")

    try {
      // Get the last milestone deadline as the goal deadline
      const deadline = formData.milestones[formData.milestones.length - 1].milestoneDeadline

      const createGoalData = {
        goalType: formData.goalType,
        goalName: formData.goalName,
        generalObjective: formData.generalObjective,
        totalAmount: formData.totalAmount,
        deadline,
        milestones: formData.milestones.map((m) => ({
          milestoneName: m.milestoneName,
          type: m.type || formData.goalType,
          milestoneDeadline: m.milestoneDeadline,
          monetaryValue: m.monetaryValue,
        })),
        allOrNothing: formData.allOrNothing,
        rewardDestination: formData.rewardDestination,
        penaltyDestination: formData.penaltyDestination,
        penaltyInterestRate: formData.penaltyInterestRate,
      }

      // Check if API is configured
      if (process.env.NEXT_PUBLIC_API_URL) {
        await api.createGoal(createGoalData)
      }

      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal")
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <GoalBasicsForm
            data={{
              goalName: formData.goalName,
              goalType: formData.goalType,
              generalObjective: formData.generalObjective,
            }}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        )
      case 1:
        return (
          <FinancialStakesForm
            data={{
              totalAmount: formData.totalAmount,
              penaltyInterestRate: formData.penaltyInterestRate,
              rewardDestination: formData.rewardDestination,
              penaltyDestination: formData.penaltyDestination,
              allOrNothing: formData.allOrNothing,
            }}
            onChange={(data) => setFormData({ ...formData, ...data })}
          />
        )
      case 2:
        return (
          <MilestonesBuilder
            milestones={formData.milestones}
            totalAmount={formData.totalAmount}
            goalType={formData.goalType}
            onChange={(milestones) => setFormData({ ...formData, milestones })}
          />
        )
      case 3:
        return (
          <GoalReview
            goalName={formData.goalName}
            goalType={formData.goalType}
            generalObjective={formData.generalObjective}
            totalAmount={formData.totalAmount}
            penaltyInterestRate={formData.penaltyInterestRate}
            rewardDestination={formData.rewardDestination}
            penaltyDestination={formData.penaltyDestination}
            allOrNothing={formData.allOrNothing}
            milestones={formData.milestones}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <WizardProgress steps={STEPS} currentStep={currentStep} />

      <Card>
        <CardContent className="p-6">
          {error && (
            <div className="mb-6 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          {renderStep()}

          <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              Back
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Goal"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
