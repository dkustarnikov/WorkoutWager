import { Header, PageContainer } from "@/components/layout"
import { GoalWizard } from "@/components/wizard"

export default function NewGoalPage() {
  return (
    <>
      <Header
        title="Create New Goal"
        description="Set up a new goal with milestones and financial stakes"
      />
      <PageContainer>
        <GoalWizard />
      </PageContainer>
    </>
  )
}
