# Auth Fix — Apply to Zenyra-main

These files fix the infinite "checking authentication..." spinner on app.zenyra.app.

## Files

| File | Destination in Zenyra-main |
|------|-----------------------------|
| `AuthContext.jsx` | `src/contexts/AuthContext.jsx` |
| `ProtectedRoute.jsx` | `src/components/ProtectedRoute.jsx` |

## Root cause

`isAdmin` was initialized to `null`. App.jsx or ProtectedRoute checked
`loading || isAdmin === null`, so any failed admin lookup left the spinner
running permanently. A secondary cause was no hard timeout on
`supabase.auth.getSession()`, which hangs when the JWT needs a refresh and
the network is slow or the token is corrupt.

## What the fix does

1. `isAdmin` is now `false` (boolean) by default — never `null`.
2. Hard 8-second timeout forces `loading = false` and shows a reset button.
3. `onAuthStateChange` skips `INITIAL_SESSION` to avoid racing with `getSession()`.
4. Every code path (error, empty result, success) calls `safeSet({ loading: false })`.
5. `resetAuthSession()` clears all `sb-*` / `supabase*` localStorage keys and
   signs out, so a stale token never blocks a future page load.

## One-line change if you can't replace the whole file

Find this pattern in your existing App.jsx or ProtectedRoute:

```js
if (loading || isAdmin === null) return <Spinner />
```

Change it to:

```js
if (loading) return <Spinner />
```

That alone unblocks the most common case. Apply the full AuthContext.jsx
replacement to also fix the timeout and session-error paths.

## Testing after applying

1. Open a fresh incognito window → should reach login page, not spinner.
2. Sign in, then open a new tab → should restore session without spinner.
3. Open DevTools → Application → Local Storage, delete all `sb-*` keys,
   then refresh → should show login, not spinner.
4. Check console — you should see `[auth] init complete` within ~1 second.
   If you see `[auth] TIMEOUT`, there is a network or RLS issue to investigate.
