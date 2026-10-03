import { Link } from "react-router-dom"

export const SuccessPage = () => {
  return (
    <div className="container" style={{ textAlign: "center", marginTop: "4rem" }}>
      <h1>Subscription Upgraded!</h1>
      <p>Your payment was successful. Your account limits will be updated shortly.</p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: "2rem", display: "inline-block" }}>
        Return to Dashboard
      </Link>
    </div>
  )
}

export const CancelPage = () => {
  return (
    <div className="container" style={{ textAlign: "center", marginTop: "4rem" }}>
      <h1>Checkout Canceled</h1>
      <p>Your checkout session was canceled. No charges were made.</p>
      <Link to="/billing" className="btn btn-primary" style={{ marginTop: "2rem", display: "inline-block" }}>
        Return to Billing
      </Link>
    </div>
  )
}
