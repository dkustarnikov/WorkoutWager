"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  signIn as cognitoSignIn,
  signUp as cognitoSignUp,
  signOut as cognitoSignOut,
  confirmSignUp as cognitoConfirmSignUp,
  getCurrentUser,
  isCognitoConfigured,
  type AuthUser,
} from "@/lib/auth"

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  confirmSignUp: (username: string, code: string) => Promise<void>
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const router = useRouter()
  const pathname = usePathname()

  // Check for existing session on mount
  React.useEffect(() => {
    async function checkSession() {
      if (!isCognitoConfigured()) {
        // If Cognito isn't configured, use demo mode
        setIsLoading(false)
        return
      }

      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)
      } catch {
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    checkSession()
  }, [])

  // Redirect logic
  React.useEffect(() => {
    if (isLoading) return

    const isAuthPage = pathname === "/login" || pathname === "/signup"
    const isProtectedRoute = pathname.startsWith("/dashboard") || pathname.startsWith("/goals")

    if (!user && isProtectedRoute && isCognitoConfigured()) {
      router.push("/login")
    } else if (user && isAuthPage) {
      router.push("/dashboard")
    }
  }, [user, isLoading, pathname, router])

  const signIn = async (username: string, password: string) => {
    await cognitoSignIn(username, password)
    const currentUser = await getCurrentUser()
    setUser(currentUser)
    router.push("/dashboard")
  }

  const signUp = async (username: string, email: string, password: string) => {
    await cognitoSignUp(username, email, password)
  }

  const signOut = async () => {
    await cognitoSignOut()
    setUser(null)
    router.push("/login")
  }

  const confirmSignUp = async (username: string, code: string) => {
    await cognitoConfirmSignUp(username, code)
  }

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    confirmSignUp,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
