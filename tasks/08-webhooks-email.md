# Task 08 — Zapier webhooks + email
Inbound: webhook endpoint for Gravity Forms (up to 4 children → 1 guardian + N leads, dedupe
guardian by phone/email, UTM capture, location routing). Outbound: "Send confirmation" and ad-hoc
email buttons POST to Zapier webhook with merge fields; Zapier creates HTML Gmail draft incl.
site signature (templates documented in repo). Confirmation-sent timestamps on the timeline.
