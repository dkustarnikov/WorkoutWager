"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { Plus } from "lucide-react"
import { Header, PageContainer } from "@/components/layout"
import { StatsOverview, GoalsList, UpcomingMilestones } from "@/components/goals"
import { Button } from "@/components/ui"
import { api } from "@/lib/api"
import type { Goal, GoalStatus } from "@/lib/types"

// Mock data for demo mode (when API is not configured)
const mockGoals: Goal[] = [
  {
    goalId: "goal-1",
    userId: "user-1",
    goalType: "fitness",
    goalName: "Run a Marathon",
    generalObjective: "Complete my first marathon by end of year",
    totalAmount: 500,
    deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    milestones: [
      {
        milestoneId: "m1",
        milestoneName: "Run 5K",
        type: "fitness",
        completion: true,
        milestoneCounter: 1,
        milestoneDeadline: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 100,
      },
      {
        milestoneId: "m2",
        milestoneName: "Run 10K",
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
        milestoneName: "Complete Marathon",
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
  },
  {
    goalId: "goal-2",
    userId: "user-1",
    goalType: "fitness",
    goalName: "Gym Consistency",
    generalObjective: "Go to the gym 3x per week for 2 months",
    totalAmount: 200,
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    milestones: [
      {
        milestoneId: "m1",
        milestoneName: "Week 1-2",
        type: "fitness",
        completion: true,
        milestoneCounter: 1,
        milestoneDeadline: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 50,
      },
      {
        milestoneId: "m2",
        milestoneName: "Week 3-4",
        type: "fitness",
        completion: true,
        milestoneCounter: 2,
        milestoneDeadline: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 50,
      },
      {
        milestoneId: "m3",
        milestoneName: "Week 5-6",
        type: "fitness",
        completion: undefined,
        milestoneCounter: 3,
        milestoneDeadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 50,
      },
      {
        milestoneId: "m4",
        milestoneName: "Week 7-8",
        type: "fitness",
        completion: undefined,
        milestoneCounter: 4,
        milestoneDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 50,
      },
    ],
    allOrNothing: true,
    rewardDestination: "savings",
    penaltyDestination: "charity",
    penaltyInterestRate: 20,
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    status: "inProgress" as GoalStatus,
  },
  {
    goalId: "goal-3",
    userId: "user-1",
    goalType: "health",
    goalName: "Weight Loss Goal",
    generalObjective: "Lose 15 pounds in 3 months",
    totalAmount: 300,
    deadline: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    milestones: [
      {
        milestoneId: "m1",
        milestoneName: "Lose 5 lbs",
        type: "health",
        completion: true,
        milestoneCounter: 1,
        milestoneDeadline: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 100,
      },
      {
        milestoneId: "m2",
        milestoneName: "Lose 10 lbs",
        type: "health",
        completion: true,
        milestoneCounter: 2,
        milestoneDeadline: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 100,
      },
      {
        milestoneId: "m3",
        milestoneName: "Lose 15 lbs",
        type: "health",
        completion: true,
        milestoneCounter: 3,
        milestoneDeadline: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        monetaryValue: 100,
      },
    ],
    allOrNothing: false,
    rewardDestination: "savings",
    penaltyDestination: "charity",
    penaltyInterestRate: 15,
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    status: "completed" as GoalStatus,
  },
]

async function fetchGoals(): Promise<Goal[]> {
  // Check if API URL is configured
  if (!process.env.NEXT_PUBLIC_API_URL) {
    // Return mock data for demo mode
    return mockGoals
  }
  return api.getGoals()
}

export default function DashboardPage() {
  const { data: goals, error, isLoading } = useSWR("goals", fetchGoals)

  return (
    <>
      <Header
        title="Dashboard"
        description="Track your goals and progress"
        action={
          <Link href="/goals/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Goal
            </Button>
          </Link>
        }
      />
      <PageContainer>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted">Loading goals...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/50 bg-danger/10 p-6 text-center">
            <p className="text-danger">Failed to load goals. Please try again.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Overview */}
            <StatsOverview goals={goals || []} />

            {/* Main content grid */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Goals List - takes 2 columns */}
              <div className="lg:col-span-2">
                <h2 className="mb-4 text-lg font-semibold">Your Goals</h2>
                <GoalsList goals={goals || []} />
              </div>

              {/* Upcoming Milestones - sidebar */}
              <div>
                <UpcomingMilestones goals={goals || []} />
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  )
}
