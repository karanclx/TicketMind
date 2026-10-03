import type { Request, Response } from "express"
import { authService } from "./auth.service.js"
import { signupSchema, loginSchema } from "./auth.schemas.js"
import { signSessionToken } from "../../lib/auth.js"
import { env } from "../../config/env.js"

export class AuthController {
  signup = async (req: Request, res: Response) => {
    const input = signupSchema.parse(req.body)
    const payload = await authService.signup(input)
    
    const token = signSessionToken(payload)
    
    res.cookie("session", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    })

    res.status(201).json({ message: "Signup successful" })
  }

  login = async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body)
    const payload = await authService.login(input)
    
    const token = signSessionToken(payload)
    
    res.cookie("session", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    })

    res.status(200).json({ message: "Login successful" })
  }

  logout = async (req: Request, res: Response) => {
    res.clearCookie("session")
    res.status(200).json({ message: "Logout successful" })
  }

  me = async (req: Request, res: Response) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Not authenticated" })
    }
    const user = await authService.getMe(req.auth.userId!)
    res.status(200).json({ user, organization: user.organizationId })
  }
}

export const authController = new AuthController()
