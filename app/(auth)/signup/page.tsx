import { SignupForm } from "@/components/auth"
import { Target } from "lucide-react"
import Link from "next/link"

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2">
        <Target className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold">WorkoutWager</span>
      </div>
      <SignupForm />
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/" className="hover:text-primary">
          Back to home
        </Link>
      </p>
    </div>
  )
}
