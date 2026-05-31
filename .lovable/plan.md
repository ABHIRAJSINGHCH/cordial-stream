# Fix authenticated app crash

## Root cause

In `src/routes/_authenticated.tsx`, the mobile menu button uses `<SheetTrigger>` placed inside the `<main>` header — **outside** the `<Sheet>` component (the `<Sheet>` only wraps `<SheetContent>`). Shadcn's Sheet is Radix Dialog under the hood, so the orphan trigger throws:

> `DialogTrigger` must be used within `Dialog`

Because this is the layout for every `/_authenticated/*` route, the entire app (campaigns, leads, inbox, analytics, settings) crashes immediately after login with the "Something went wrong" boundary.

## Fix

Remove `SheetTrigger` from the imports and replace its usage in the mobile header with a plain `<Button>` that calls `setMobileOpen(true)` directly. The `Sheet` already controls open state via `open`/`onOpenChange`, so a trigger component is not needed.

```tsx
// before
<SheetTrigger asChild>
  <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
    <Menu className="size-4" />
  </Button>
</SheetTrigger>

// after
<Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
  <Menu className="size-4" />
</Button>
```

## Wider check performed

Searched all `*Trigger` usages across routes/components:
- `campaigns.tsx`, `campaigns.$id.tsx`, `leads.tsx` — all `DialogTrigger`s are correctly nested inside their `<Dialog>` parent. ✅
- No other orphan triggers found.

No other code changes needed; this single fix unblocks the entire authenticated app.
