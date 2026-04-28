/**
 * ProtectedRoute.jsx — Zenyra Main App
 * ============================================================
 * REPLACE your existing ProtectedRoute / auth guard with this file.
 * Copy to: src/components/ProtectedRoute.jsx  in the Zenyra-main repo.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The original ProtectedRoute (or equivalent guard in App.jsx) showed a
 * spinner whenever:
 *
 *   loading === true  ||  isAdmin === null
 *
 * Because isAdmin was initialized to null and only set to true/false if
 * the admin query *succeeded*, any failure or empty result left it null
 * forever, blocking the render tree permanently.
 *
 * THE FIX
 * -------
 * The new AuthContext always sets isAdmin to a boolean (false default).
 * This guard only blocks on loading === true. Once loading is false, all
 * other states (no user, no profile, no admin) are handled as redirects
 * or error messages — never as infinite spinners.
 *
 * USAGE
 * -----
 * In App.jsx (or your router setup):
 *
 *   // Public route — no guard
 *   <Route path="/login" element={<LoginPage />} />
 *
 *   // Authenticated — any signed-in user
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 *
 *   // Admin only
 *   <Route element={<ProtectedRoute requireAdmin />}>
 *     <Route path="/admin" element={<AdminPanel />} />
 *   </Route>
 *
 *   // Requires agent profile record in DB
 *   <Route element={<ProtectedRoute requireProfile />}>
 *     <Route path="/calls" element={<CallsView />} />
 *   </Route>
 *
 * If you use view-based navigation (no router), see the inline example
 * at the bottom of this file.
 */

import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'  // adjust path if needed

// ─── Spinner (minimal — replace with your design system component) ────────────
function AuthSpinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '16px',
      fontFamily: 'system-ui, sans-serif',
      color: '#6b7280',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid #e5e7eb',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: '14px' }}>Checking authentication…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Stuck-auth fallback (shown only if resetAuthSession was called) ──────────
// This is the "Reset Auth Session" button mentioned in the bug report.
// It appears on the auth-timed-out error screen, not the spinner.
function AuthErrorScreen({ error, onReset }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '16px',
      fontFamily: 'system-ui, sans-serif',
      color: '#374151',
      padding: '24px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '32px' }}>⚠️</div>
      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
        Authentication problem
      </h2>
      <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', maxWidth: '360px' }}>
        {error === 'Auth check timed out. Please sign in again.'
          ? 'Your session could not be verified. This sometimes happens after a long period of inactivity.'
          : error || 'An unexpected error occurred during sign-in.'}
      </p>
      <button
        onClick={onReset}
        style={{
          marginTop: '8px',
          padding: '10px 20px',
          background: '#6366f1',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Reset session and sign in again
      </button>
    </div>
  )
}

// ─── ProtectedRoute ────────────────────────────────────────────────────────────
/**
 * @param {object}  props
 * @param {boolean} [props.requireAdmin=false]   Redirect non-admins to /dashboard
 * @param {boolean} [props.requireProfile=false] Redirect users without an agent
 *                                               profile to /no-profile
 * @param {string}  [props.redirectTo='/login']  Override redirect destination
 */
export default function ProtectedRoute({
  requireAdmin   = false,
  requireProfile = false,
  redirectTo     = '/login',
}) {
  const { loading, user, agent, isAdmin, error, signOut, resetAuthSession } = useAuth()

  // ── 1. Auth still resolving ─────────────────────────────────────────────────
  // IMPORTANT: Only block on `loading`. Do NOT also check `isAdmin === null` —
  // the new AuthContext guarantees isAdmin is always a boolean once loading=false.
  if (loading) {
    return <AuthSpinner />
  }

  // ── 2. Hard auth error (timeout, bad session, etc.) ─────────────────────────
  // Show a reset button so agents are never permanently stuck.
  if (error && !user) {
    const handleReset = async () => {
      await resetAuthSession()
      window.location.href = redirectTo
    }
    return <AuthErrorScreen error={error} onReset={handleReset} />
  }

  // ── 3. Not authenticated → redirect to login ─────────────────────────────────
  if (!user) {
    return <Navigate to={redirectTo} replace />
  }

  // ── 4. Authenticated but no profile → soft block ────────────────────────────
  if (requireProfile && !agent) {
    // 'no-profile' is the error string set by AuthContext when the user exists
    // in Auth but has no row in the agents table.
    return <Navigate to="/no-profile" replace />
  }

  // ── 5. Admin gate ────────────────────────────────────────────────────────────
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  // ── 6. All checks passed — render child routes ───────────────────────────────
  return <Outlet />
}

// =============================================================================
// VIEW-BASED NAVIGATION PATTERN (no react-router)
// =============================================================================
// If App.jsx manages views with useState instead of <Route>, replace
// ProtectedRoute usage with an inline guard like this:
//
//   function App() {
//     const { loading, user, isAdmin, error, resetAuthSession } = useAuth()
//
//     // 1. Loading — show spinner, not the "checking auth" text
//     if (loading) return <AuthSpinner />
//
//     // 2. Auth error — show reset button
//     if (error && !user) {
//       return (
//         <AuthErrorScreen
//           error={error}
//           onReset={async () => {
//             await resetAuthSession()
//             window.location.reload()
//           }}
//         />
//       )
//     }
//
//     // 3. Not authenticated
//     if (!user) return <LoginPage />
//
//     // 4. Authenticated — render app
//     return <MainApp />
//   }
//
// KEY POINT: The old code likely had:
//   if (loading || isAdmin === null) return <Spinner />
//
// Replace that entire condition with just:
//   if (loading) return <Spinner />
//
// isAdmin is now always a boolean after loading=false, so the null check
// is both unnecessary and was the original source of the infinite spinner.
// =============================================================================
