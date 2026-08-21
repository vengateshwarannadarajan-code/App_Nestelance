"""T-BILLING-001 + T-BILLING-005: Billing router — Stripe Checkout, webhooks, portal, invoices"""
import os, stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import create_client
from auth import get_current_user, UserProfile

router = APIRouter()

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

PLAN_PRICE_IDS = {
    "starter":      os.environ.get("STRIPE_PRICE_STARTER",      "price_starter"),
    "growth":       os.environ.get("STRIPE_PRICE_GROWTH",       "price_growth"),
    "professional": os.environ.get("STRIPE_PRICE_PROFESSIONAL", "price_professional"),
    "consultant":   os.environ.get("STRIPE_PRICE_CONSULTANT",   "price_consultant"),
}

PLAN_RANK = {"starter": 0, "growth": 1, "professional": 2, "consultant": 3}

def _supa():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _stripe_error_detail(e: "stripe.error.StripeError") -> str:
    """None of the Stripe calls below were wrapped — any real Stripe
    error (bad price/product id, wrong test/live mode, card declined,
    etc.) crashed with a raw unhandled-exception 500 instead of a
    usable message. Surfaced live: STRIPE_PRICE_* was set to a Product
    id (prod_...) instead of a Price id (price_...)."""
    return str(e)

class CheckoutRequest(BaseModel):
    plan: str
    success_url: str = "https://nestelance.com/settings?tab=subscription&success=1"
    cancel_url: str  = "https://nestelance.com/billing?cancelled=1"

@router.post("/checkout")
async def create_checkout(body: CheckoutRequest, user: UserProfile = Depends(get_current_user)):
    price_id = PLAN_PRICE_IDS.get(body.plan)
    if not price_id:
        raise HTTPException(400, f"Unknown plan: {body.plan}")

    # Prevent downgrade via checkout
    if PLAN_RANK.get(body.plan, 0) <= PLAN_RANK.get(user.plan, 0):
        raise HTTPException(400, "Cannot downgrade via checkout. Use the cancel endpoint instead.")

    supabase = _supa()
    user_rec = supabase.table("users").select("stripe_customer_id").eq("id", user.id).maybe_single().execute()
    customer_id = ((user_rec.data if user_rec else None) or {}).get("stripe_customer_id")

    session_params = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": body.success_url,
        "cancel_url": body.cancel_url,
        "client_reference_id": user.id,
        "metadata": {"user_id": user.id, "plan": body.plan},
    }
    if customer_id:
        session_params["customer"] = customer_id
    else:
        session_params["customer_email"] = user.email

    try:
        session = stripe.checkout.Session.create(**session_params)
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"Stripe checkout failed: {_stripe_error_detail(e)}")
    return {"checkout_url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    supabase = _supa()
    event_type = event["type"]

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
        plan = session.get("metadata", {}).get("plan", "growth")
        customer_id = session.get("customer")
        if user_id:
            update = {"plan": plan}
            if customer_id:
                update["stripe_customer_id"] = customer_id
            supabase.table("users").update(update).eq("id", user_id).execute()

    elif event_type == "customer.subscription.deleted":
        customer_id = event["data"]["object"].get("customer")
        if customer_id:
            supabase.table("users").update({"plan": "starter"}).eq("stripe_customer_id", customer_id).execute()

    elif event_type == "invoice.payment_failed":
        customer_id = event["data"]["object"].get("customer")
        if customer_id:
            supabase.table("users").update({"payment_failed": True}).eq("stripe_customer_id", customer_id).execute()

    return {"received": True}


@router.post("/cancel")
async def cancel_subscription(user: UserProfile = Depends(get_current_user)):
    supabase = _supa()
    user_rec = supabase.table("users").select("stripe_customer_id").eq("id", user.id).maybe_single().execute()
    customer_id = ((user_rec.data if user_rec else None) or {}).get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(400, "No active subscription found")

    try:
        subs = stripe.Subscription.list(customer=customer_id, status="active", limit=1)
        if not subs.data:
            raise HTTPException(400, "No active subscription found")
        sub = stripe.Subscription.modify(subs.data[0].id, cancel_at_period_end=True)
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"Stripe cancellation failed: {_stripe_error_detail(e)}")
    return {
        "cancelled_at_period_end": sub.cancel_at_period_end,
        "current_period_end": sub.current_period_end,
    }


@router.get("/portal")
async def customer_portal(user: UserProfile = Depends(get_current_user)):
    """T-BILLING-005: Stripe Customer Portal session"""
    supabase = _supa()
    user_rec = supabase.table("users").select("stripe_customer_id").eq("id", user.id).maybe_single().execute()
    customer_id = ((user_rec.data if user_rec else None) or {}).get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(400, "No Stripe customer found")

    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url="https://nestelance.com/settings?tab=billing",
        )
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"Stripe portal session failed: {_stripe_error_detail(e)}")
    return {"portal_url": session.url}


@router.get("/invoices")
async def get_invoices(user: UserProfile = Depends(get_current_user)):
    """T-BILLING-004: Invoice list"""
    supabase = _supa()
    user_rec = supabase.table("users").select("stripe_customer_id").eq("id", user.id).maybe_single().execute()
    customer_id = ((user_rec.data if user_rec else None) or {}).get("stripe_customer_id")
    if not customer_id:
        return {"invoices": []}

    try:
        invoices = stripe.Invoice.list(customer=customer_id, limit=12)
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"Stripe invoice lookup failed: {_stripe_error_detail(e)}")
    return {
        "invoices": [
            {
                "id": inv.id,
                "date": inv.created,
                "amount": inv.amount_paid / 100,
                "currency": inv.currency.upper(),
                "status": inv.status,
                "pdf_url": inv.invoice_pdf,
            }
            for inv in invoices.data
        ]
    }
