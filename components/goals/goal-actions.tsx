"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { XCircle, Trash2 } from "lucide-react"
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui"
import { api } from "@/lib/api"
import type { Goal } from "@/lib/types"

interface GoalActionsProps {
  goal: Goal
  onUpdate: () => void
}

export function GoalActions({ goal, onUpdate }: GoalActionsProps) {
  const router = useRouter()
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)

  const isActive = goal.status === "created" || goal.status === "inProgress"

  const handleCancel = async () => {
    setIsLoading(true)
    try {
      if (process.env.NEXT_PUBLIC_API_URL) {
        await api.cancelGoal(goal.goalId)
      }
      setCancelDialogOpen(false)
      onUpdate()
    } catch (error) {
      console.error("Failed to cancel goal:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      if (process.env.NEXT_PUBLIC_API_URL) {
        await api.deleteGoal(goal.goalId)
      }
      router.push("/dashboard")
    } catch (error) {
      console.error("Failed to delete goal:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex gap-2">
      {/* Cancel Goal */}
      {isActive && (
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <XCircle className="h-4 w-4" />
              Cancel Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Goal</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel this goal? This will mark all pending milestones
                as missed and apply penalties.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                Keep Goal
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={isLoading}>
                {isLoading ? "Cancelling..." : "Cancel Goal"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Goal */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Goal</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this goal? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Keep Goal
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
              {isLoading ? "Deleting..." : "Delete Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
