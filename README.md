# Zenyra Home Health Clone Structure

This project is a structural clone of the Zenyra workflow, adapted for home health products.

## What it includes
- Agent dashboard shell
- Leads management page
- Full-screen Home Health Sales Plates
- Outcome logging modal
- Admin dashboard
- Drug reimbursement logic
- Lead scoring logic
- Starter SQL schema

## What it intentionally does not include yet
- Supabase wiring
- Authentication
- Real-time subscriptions
- Production styling parity with your full Zenyra app
- Carrier-side premium calculations

## Build intent
This pack is meant to give you the correct architecture and component breakdown so you can plug the home health version into the same mental model as Zenyra:
- Dashboard shell
- Leads hub
- Full-screen plates flow
- Disposition logging
- Admin analytics

## Install
```bash
npm install
npm run dev
```

## Where to start
1. Replace your current `src/` with this project `src/`
2. Run the Vite app locally
3. Validate the Home Health Sales Plates flow
4. Then wire each page to Supabase

## Key adaptation from Zenyra
This starter keeps the **SalesPlates operating model** but replaces the Medicare Plan Decider with a **Home Health Option Builder** where:
- agent enters carrier-generated monthly premiums
- system calculates reimbursement offsets
- system recommends A / B / C based on guided discovery + qualification logic
