import Link from "next/link"
import { Target, TrendingUp, Shield, Zap } from "lucide-react"
import { Button } from "@/components/ui"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">WorkoutWager</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl">
            Put Your Money Where
            <br />
            <span className="text-primary">Your Goals Are</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted text-pretty">
            Create fitness goals with real financial stakes. Hit your milestones and keep your money.
            Miss them and pay the price. Turn commitment into results.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="px-8">
                Start Your Journey
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline">
                View Demo
              </Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-background-card">
          <div className="mx-auto max-w-6xl px-4 py-24">
            <h2 className="text-center text-3xl font-bold">How It Works</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
              A simple system that turns your fitness ambitions into accountable commitments.
            </p>

            <div className="mt-16 grid gap-8 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-background p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Set Your Goals</h3>
                <p className="mt-2 text-sm text-muted">
                  Create specific fitness goals with clear milestones and deadlines. 
                  Define what success looks like for you.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                  <Zap className="h-6 w-6 text-warning" />
                </div>
                <h3 className="text-lg font-semibold">Put Money on the Line</h3>
                <p className="mt-2 text-sm text-muted">
                  Assign a monetary value to each milestone. Choose where penalties go if you miss
                  your targets - charity, savings, or elsewhere.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                  <TrendingUp className="h-6 w-6 text-success" />
                </div>
                <h3 className="text-lg font-semibold">Track & Achieve</h3>
                <p className="mt-2 text-sm text-muted">
                  Mark milestones complete as you progress. Keep your money by staying on track,
                  or face real consequences for falling behind.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-24 text-center">
            <h2 className="text-3xl font-bold">Ready to Get Serious?</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Join others who have used financial accountability to achieve their fitness goals.
              Your future self will thank you.
            </p>
            <div className="mt-8">
              <Link href="/signup">
                <Button size="lg" className="px-8">
                  Create Your First Goal
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <span className="font-semibold">WorkoutWager</span>
            </div>
            <p className="text-sm text-muted">
              Built to help you achieve your goals.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
