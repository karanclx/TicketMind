import Stripe from "stripe"
import { env } from "../config/env.js"

// Use the API version supported by the installed Stripe SDK.
export const stripe = new Stripe(env.STRIPE_SECRET_KEY)
