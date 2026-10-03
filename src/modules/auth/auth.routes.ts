import { Router } from "express"
import { authController } from "./auth.controller.js"
import { asyncHandler } from "../../lib/async-handler.js"
import { requireAuth } from "../../middleware/require-auth.js"

export const authRoutes = Router()

authRoutes.post("/signup", asyncHandler(authController.signup))
authRoutes.post("/login", asyncHandler(authController.login))
authRoutes.post("/logout", asyncHandler(authController.logout))
authRoutes.get("/me", requireAuth, asyncHandler(authController.me))
