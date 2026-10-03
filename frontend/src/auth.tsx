import { createContext, useContext, useState, useEffect } from "react"
import { getMe, login, signup, logout } from "./api"

interface AuthContextType {
  user: any | null
  loading: boolean
  error: string | null
  login: (payload: any) => Promise<void>
  signup: (payload: any) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMe = async () => {
    try {
      const data = await getMe()
      setUser(data.user)
      setError(null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMe()
  }, [])

  const handleLogin = async (payload: any) => {
    await login(payload)
    await fetchMe()
  }

  const handleSignup = async (payload: any) => {
    await signup(payload)
    await fetchMe()
  }

  const handleLogout = async () => {
    await logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login: handleLogin, signup: handleSignup, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
