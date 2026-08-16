# Brew & Bean — Coffee Management System

A full-stack coffee shop management system: the existing customer and manager
frontend, now backed by a real **Node.js + Express.js + SQLite** API. Every
account, order, reservation, contact message, menu item, and inventory record
is stored permanently in `backend/coffee_shop.db`.

## Project structure

```
Coffee Management System/
├── frontend/
│   ├── customer.html      # Customer portal (menu, cart, orders, reservations, profile)
│   ├── manager.html       # Manager dashboard (menu, orders, reservations, inventory, messages, reports, settings)
│   ├── index.html         # Landing page + manager login
│   ├── style.css
│   ├── videos/
│   └── uploads/
│
├── backend/
│   ├── server.js          # Express app + all REST API routes
│   ├── database.js        # SQLite connection, schema init, minimal seed data
│   ├── schema.sql          # Table definitions (customers, orders, products, ...)
│   ├── package.json
│   └── coffee_shop.db     # Created automatically on first run
│
└── README.md
```

## Running the project

Requires **Node.js 22.5 or newer** (uses Node's built-in `node:sqlite` module,
so there's nothing to compile — works out of the box on Windows, macOS, and
Linux with no build tools required).

```bash
cd backend
npm install
npm start
```

The server starts at **http://localhost:3000** and also serves the frontend,
so you can just open that URL in your browser — no separate frontend server
or CORS configuration needed.

You'll see a one-line `ExperimentalWarning: SQLite is an experimental
feature` in the console when the server starts — that's expected and can be
ignored; it doesn't affect functionality.

- Customer portal: `http://localhost:3000/index.html` → "Customer Portal"
- Manager portal: `http://localhost:3000/index.html` → "Manager Portal"

### Default manager login
```
Username: admin
Password: password123
```

A customer account is created through the normal Sign Up form on the
customer portal.

## What's stored in SQLite

- **customers** — accounts, hashed passwords, loyalty points, running totals
- **managers** — manager accounts, hashed passwords
- **categories** / **products** — the menu, editable from the manager dashboard
- **orders** / **order_items** — every order placed, with backend-calculated
  totals (the server never trusts a total sent from the browser)
- **reservations** — table bookings, with manager confirm/cancel workflow
- **contact_messages** / **message_replies** — the Contact Us form and manager replies
- **inventory** — stock items with reorder levels and a low-stock endpoint
- **settings** — shop info and tax/service/delivery-fee configuration

Foreign keys are enabled (`PRAGMA foreign_keys = ON`) and order creation runs
inside a single SQLite transaction — if anything fails, the whole order is
rolled back so the database is never left with a partial order.

## Recent improvements

On top of the core system, the following were added:

- **Order tracking status bar** — customers see a visual step tracker (Placed → Preparing → Ready/Completed) on each order in their History page.
- **Order confirmation notification (demo)** — the order confirmation modal shows a simulated "email/SMS sent" banner. No real email/SMS provider is configured for this project; it's a UI demonstration only.
- **Manager dashboard date-range filter** — Today / This Week / This Month toggle above the stats cards.
- **Real product image uploads** — images are uploaded via `POST /api/upload/product-image`, saved as real files under `frontend/uploads/products/`, and the file is cleaned up automatically when a product's image is replaced or the product is deleted. (Previously images were stored as base64 text directly in the database.)
- **Menu price range + sort filter** — a price slider and a sort dropdown (price/name) were added next to the existing category filter and search box on the customer menu page.
- **Forgot password (demo)** — customers can request a password reset from the login page. Since no email service is configured, the reset code is shown directly in the browser instead of being emailed (clearly labelled as a demo). This is a good next step to wire up to a real email provider (e.g. SendGrid/Nodemailer) for production use.
- **Real-time new-order alerts** — the manager dashboard polls every 10 seconds; when a new order comes in it shows a toast notification and a badge on the "Order Management" sidebar link (cleared when the manager opens that section).

## Notes

- Passwords are hashed with bcrypt; they are never returned by the API.
- Session auth is a simple bearer token issued at login and checked against
  the `session_token` column — enough for this project without adding a
  heavier auth framework.
- The frontend's visual design, layout, and pages are unchanged. Only the
  JavaScript that used to read/write `localStorage` now calls the API.
