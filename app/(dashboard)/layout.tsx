"use client"

import { AuthProvider, ProtectedRoute } from "@/components/auth"
import { Sidebar } from "@/components/layout"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 pl-64">{children}</main>
        </div>
      </ProtectedRoute>
    </AuthProvider>
  )
}
