<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Booking availability and overlap rules are enforced in the DB trigger validate_booking; src/lib/slots.ts mirrors them for UI only — why: clients can't see others' bookings, so the DB is the source of truth.
- Roles (client/owner) live in user_roles and are checked via has_role(); never on profiles — why: prevents users from granting themselves owner access.
- Stripe runs through a TanStack server function (checkout) and /api/public/stripe-webhook (signature-verified), not Edge Functions — why: this stack doesn't use new Edge Functions; keys live only in server secrets.
