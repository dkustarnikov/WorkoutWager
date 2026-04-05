"use client"

import * as React from "react"
import { use } from "react"
import Link from "next/link"
import useSWR, { mutate } from "swr"
import { ArrowLeft } from "lucide-react"
import { Header, PageContainer } from "@/components/layout"
import { GoalHeader, GoalActions, FinancialSummary } from "@/components/goals"
import { MilestoneTimeline } from "@/components/milestones"
import { Button } from "@/components/ui"
import { api } from "@/lib/api"
import type { Goal, GoalStatus } from "@/lib/types"

// Mock goal data for demo mode
const mockGoal: Goal = {
  goalId: "goal-1",
  userId: "user-1",
  goalType: "fitness",
  goalName: "Run a Marathon",
  generalObjective: "Complete my first marathon by end of year with structured training",
  totalAmount: 500,
  deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  milestones: [
    {
      milestoneId: "m1",
      milestoneName: "Run 5K without stopping",
      type: "fitness",
      completion: true,
      milestoneCounter: 1,
      milestoneDeadline: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      monetaryValue: 100,
    },
    {
      milestoneId: "m2",
      milestoneName: "Complete 10K race",
      type: "fitness",
      completion: true,
      milestoneCounter: 2,
      milestoneDeadline: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      monetaryValue: 100,
    },
    {
      milestoneId: "m3",
      milestoneName: "Run Half Marathon",
      type: "fitness",
      completion: undefined,
      milestoneCounter: 3,
      milestoneDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      monetaryValue: 150,
    },
    {
      milestoneId: "m4",
      milestoneName: "Complete Full Marathon",
      type: "fitness",
      completion: undefined,
      milestoneCounter: 4,
      milestoneDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      monetaryValue: 150,
    },
  ],
  allOrNothing: false,
  rewardDestination: "savings",
  penaltyDestination: "charity",
  penaltyInterestRate: 10,
  createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  status: "inProgress" as GoalStatus,
}

async function fetchGoal(goalId: string): Promise<Goal> {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    // Return mock data for demo mode
    return mockGoal
  }
  return api.getGoal(goalId)
}

interface PageProps {
  params: Promise<{ goalId: string }>
}

export default function GoalDetailPage({ params }: PageProps) {
  const { goalId } = use(params)
  const { data: goal, error, isLoading } = useSWR(
    `goal-${goalId}`,
    () => fetchGoal(goalId)
  )

  const handleCompleteMilestone = async (milestoneId: string) => {
    if (process.env.NEXT_PUBLIC_API_URL) {
      await api.completeMilestone(goalId, milestoneId)
    }
    // Refresh the goal data
    mutate(`goal-${goalId}`)
  }

  const handleUpdate = () => {
    mutate(`goal-${goalId}`)
    mutate("goals") // Also refresh the goals list
  }

  const isGoalActive = goal?.status === "created" || goal?.status === "inProgress"

  return (
    <>
      <Header
        title="Goal Details"
        action={
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        }
      />
      <PageContainer>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted">Loading goal...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/50 bg-danger/10 p-6 text-center">
            <p className="text-danger">Failed to load goal. Please try again.</p>
          </div>
        ) : goal ? (
          <div className="space-y-6">
            {/* Header with progress */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <GoalHeader goal={goal} />
              </div>
              <GoalActions goal={goal} onUpdate={handleUpdate} />
            </div>

            {/* Main content grid */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Milestones - takes 2 columns */}
              <div className="lg:col-span-2">
                <MilestoneTimeline
                  milestones={goal.milestones}
                  goalId={goal.goalId}
                  isGoalActive={isGoalActive}
                  onCompleteMilestone={handleCompleteMilestone}
                />
              </div>

              {/* Financial Summary - sidebar */}
              <div>
                <FinancialSummary goal={goal} />
              </div>
            </div>
          </div>
        ) : null}
      </PageContainer>
    </>
  )
}
