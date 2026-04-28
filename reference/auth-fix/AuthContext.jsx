/**
 * AuthContext.jsx — Zenyra Main App
 * ============================================================
 * REPLACE your existing AuthContext with this file exactly.
 * Copy to: src/contexts/AuthContext.jsx  in the Zenyra-main repo.
 *
 * ROOT CAUSE OF THE INFINITE "checking authentication..." BUG
 * -----------------------------------------------------------
 * The original auth never resolved when ANY of these happened:
 *
 * 1.  isAdmin was initialized to `null`. App.jsx checked
 *       (loading || isAdmin === null)  → shows spinner forever
 *     because isAdmin stayed null if the admin lookup failed, was
 *     skipped, or the user had no admin record.
 *
 * 2.  Profile/agent fetch had no try/finally. A single Supabase
 *     error (network, RLS, wrong table name) left loading=true
 *     permanently.
 *
 * 3.  onAuthStateChange fired INITIAL_SESSION which triggered an
 *     await inside the handler. If that await never resolved (e.g.
 *     RLS-blocked query), loading never cleared.
 *
 * 4.  No hard timeout. A stale JWT in localStorage caused
 *     supabase.auth.getSession() to silently hang on token refresh,
 *     which blocked the entire init path.
 *
 * 5.  Subscription was not always cleaned up on unmount, causing
 *     setState calls on dead components and spurious re-runs.
 *
 * 6.  A second useState initialized = false that had to be set
 *     separately from loading, creating a two-gated spinner that
 *     required BOTH to clear simultaneously.
 *
 * THE FIX: single-state object, getSession() first, profile fetch
 * always in try/finally, hard 8-second timeout, explicit isAdmin
 * boolean (never null), reset helper on every error path.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react'
import { supabase } from '../lib/supabaseClient'  // adjust path if needed

// ─── Hard timeout before we declare auth "stuck" ──────────────────────────────
const AUTH_TIMEOUT_MS = 8_000

// ─── localStorage key for any app-level auth flags ────────────────────────────
const APP_AUTH_KEYS = ['zenyra_auth', 'sb-session', 'supabase.auth.token']

// ─── Canonical auth state shape ───────────────────────────────────────────────
const INITIAL_STATE = {
  loading:    true,   // true only during the first resolution
  user:       null,   // supabase User object or null
  agent:      null,   // agents table row or null
  isAdmin:    false,  // BOOLEAN, never null — prevents circular waits
  error:      null,   // string | null
}

export const AuthContext = createContext(INITIAL_STATE)

// ─── Exported helper ──────────────────────────────────────────────────────────
export function useAuth() {
  return useContext(AuthContext)
}

// ─── Clears all auth state from browser storage ──────────────────────────────
export async function resetAuthSession() {
  console.log('[auth] resetAuthSession called')
  try { await supabase.auth.signOut() } catch { /* ignore */ }
  APP_AUTH_KEYS.forEach((k) => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
    try { sessionStorage.removeItem(k) } catch { /* ignore */ }
  })
  // Supabase stores session under project-specific key — nuke all sb-* keys
  Object.keys(localStorage)
    .filter((k) => k.startsWith('sb-') || k.startsWith('supabase'))
    .forEach((k) => localStorage.removeItem(k))
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE)
  const mountedRef = useRef(true)  // prevent setState after unmount

  // Stable setter — only updates if still mounted
  const safeSet = useCallback((patch) => {
    if (!mountedRef.current) return
    setState((prev) => ({ ...prev, ...patch }))
  }, [])

  // ── Resolve agent/admin profile from Supabase ────────────────────────────
  const resolveProfile = useCallback(async (user) => {
    console.log('[auth] resolveProfile start — user.id:', user?.id)

    if (!user?.id) {
      console.log('[auth] resolveProfile — no user, clearing state')
      safeSet({ user: null, agent: null, isAdmin: false, loading: false, error: null })
      return
    }

    try {
      // ── Agent lookup ────────────────────────────────────────────────────
      const { data: agentRow, error: agentErr } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()  // .maybeSingle() returns null (not error) when no row found

      console.log('[auth] agent query result:', { agentRow, agentErr })

      if (agentErr) {
        // DB / RLS error — user exists but profile lookup failed
        console.error('[auth] agent query error:', agentErr)
        safeSet({
          user,
          agent:   null,
          isAdmin: false,
          loading: false,
          error:   `Profile lookup failed: ${agentErr.message}`,
        })
        return
      }

      if (!agentRow) {
        // Authenticated user but no agent record
        console.warn('[auth] No agent profile found for user:', user.id)
        safeSet({
          user,
          agent:   null,
          isAdmin: false,
          loading: false,
          error:   'no-profile',
        })
        return
      }

      // ── Admin check ─────────────────────────────────────────────────────
      // isAdmin is derived from the agent row — NEVER left as null.
      // Adjust the field name to match your actual schema.
      const isAdmin = agentRow.role === 'admin' || agentRow.is_admin === true

      console.log('[auth] resolveProfile success —', {
        agentId: agentRow.id,
        role: agentRow.role,
        isAdmin,
      })

      safeSet({
        user,
        agent:   agentRow,
        isAdmin,
        loading: false,
        error:   null,
      })
    } catch (err) {
      // Network or unexpected JS error
      console.error('[auth] resolveProfile caught exception:', err)
      safeSet({
        user,
        agent:   null,
        isAdmin: false,
        loading: false,
        error:   `Profile error: ${err.message}`,
      })
    }
  }, [safeSet])

  // ── Initial auth resolution on mount ─────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    let timeoutId

    const init = async () => {
      console.log('[auth] init start')

      // Hard timeout — if auth hasn't resolved in AUTH_TIMEOUT_MS, force clear
      timeoutId = setTimeout(() => {
        if (!mountedRef.current) return
        console.warn('[auth] TIMEOUT — forcing loading=false after', AUTH_TIMEOUT_MS, 'ms')
        safeSet({
          user:    null,
          agent:   null,
          isAdmin: false,
          loading: false,
          error:   'Auth check timed out. Please sign in again.',
        })
      }, AUTH_TIMEOUT_MS)

      try {
        // getSession() reads from localStorage immediately — does NOT do a
        // network round-trip for valid tokens (Supabase v2 behavior).
        // It WILL do a refresh call if the token is expired, which is where
        // hangs previously occurred → the timeout above guards this.
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession()

        console.log('[auth] getSession result:', {
          sessionFound: !!session,
          userId: session?.user?.id,
          sessionErr,
        })

        if (sessionErr) {
          // Bad/corrupted session — wipe it so the user isn't stuck forever
          console.error('[auth] getSession error — clearing session:', sessionErr)
          await resetAuthSession()
          safeSet({
            user:    null,
            agent:   null,
            isAdmin: false,
            loading: false,
            error:   `Session error: ${sessionErr.message}`,
          })
          return
        }

        if (!session) {
          console.log('[auth] No session — unauthenticated')
          safeSet({ user: null, agent: null, isAdmin: false, loading: false, error: null })
          return
        }

        // Valid session — load profile
        await resolveProfile(session.user)
      } catch (err) {
        console.error('[auth] init caught exception:', err)
        safeSet({
          user:    null,
          agent:   null,
          isAdmin: false,
          loading: false,
          error:   `Auth init error: ${err.message}`,
        })
      } finally {
        clearTimeout(timeoutId)
        console.log('[auth] init complete')
      }
    }

    init()

    // ── Subscribe to subsequent auth events ────────────────────────────────
    // IMPORTANT: We do NOT call resolveProfile inside onAuthStateChange for
    // INITIAL_SESSION — init() above already handled it. Doing it twice
    // causes the race that produced the original stuck state.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[auth] onAuthStateChange:', event, session?.user?.id)

        // Skip INITIAL_SESSION — handled synchronously by init() above
        if (event === 'INITIAL_SESSION') return

        if (event === 'SIGNED_OUT' || !session) {
          safeSet({ user: null, agent: null, isAdmin: false, loading: false, error: null })
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token refreshed — user object may have changed; re-resolve profile
          safeSet({ loading: true })
          await resolveProfile(session.user)
          return
        }

        if (event === 'SIGNED_IN') {
          // A new sign-in (not the initial page load session)
          safeSet({ loading: true })
          await resolveProfile(session.user)
          return
        }

        if (event === 'USER_UPDATED') {
          // Email/password changed — update user object only
          safeSet({ user: session.user })
          return
        }
      }
    )

    return () => {
      mountedRef.current = false
      clearTimeout(timeoutId)
      subscription.unsubscribe()
      console.log('[auth] cleanup — subscription unsubscribed')
    }
  }, [resolveProfile, safeSet])

  // ── Sign in / out helpers ─────────────────────────────────────────────────
  const signIn = useCallback(async ({ email, password }) => {
    safeSet({ loading: true, error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      safeSet({ loading: false, error: error.message })
      return { error }
    }
    // onAuthStateChange SIGNED_IN will call resolveProfile
    return { data }
  }, [safeSet])

  const signOut = useCallback(async () => {
    await resetAuthSession()
    safeSet({ user: null, agent: null, isAdmin: false, loading: false, error: null })
  }, [safeSet])

  const value = {
    ...state,
    // Convenience booleans — both always defined, never null
    isAuthenticated: !!state.user && !state.loading,
    hasProfile:      !!state.agent,
    // Actions
    signIn,
    signOut,
    resetAuthSession,
    // Debug
    _debugState: state,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
