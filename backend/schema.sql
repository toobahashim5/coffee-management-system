-- Brew & Bean Coffee Management System - SQLite Schema
PRAGMA foreign_keys = ON;

-- Customers (customer accounts / login)
CREATE TABLE IF NOT EXISTS customers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    email               TEXT NOT NULL UNIQUE,
    phone               TEXT,
    password_hash       TEXT NOT NULL,
    address             TEXT,
    loyalty_points      INTEGER NOT NULL DEFAULT 100,
    total_orders        INTEGER NOT NULL DEFAULT 0,
    total_spent         REAL NOT NULL DEFAULT 0,
    session_token       TEXT,
    reset_token         TEXT,
    reset_token_expires TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Managers (manager accounts / login)
CREATE TABLE IF NOT EXISTS managers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'manager',
    session_token   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    slug    TEXT NOT NULL UNIQUE,
    name    TEXT NOT NULL
);

-- Products / Menu items
CREATE TABLE IF NOT EXISTS products (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    category_id     INTEGER REFERENCES categories(id),
    description     TEXT,
    price           REAL NOT NULL,
    image           TEXT,
    best_seller     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'available', -- available | unavailable
    stock           INTEGER NOT NULL DEFAULT 50,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER REFERENCES customers(id),
    customer_name   TEXT NOT NULL,
    customer_email  TEXT,
    customer_phone  TEXT,
    order_type      TEXT NOT NULL DEFAULT 'pickup', -- pickup | delivery
    payment_method  TEXT,
    delivery_address TEXT,
    subtotal        REAL NOT NULL,
    delivery_fee    REAL NOT NULL DEFAULT 0,
    tax             REAL NOT NULL DEFAULT 0,
    total           REAL NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending', -- pending|processing|completed|cancelled
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      INTEGER REFERENCES products(id),
    product_name    TEXT NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      REAL NOT NULL,
    subtotal        REAL NOT NULL
);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id         INTEGER REFERENCES customers(id),
    customer_name       TEXT NOT NULL,
    customer_phone      TEXT,
    customer_email      TEXT,
    reservation_date    TEXT NOT NULL,
    reservation_time    TEXT NOT NULL,
    number_of_guests    INTEGER NOT NULL,
    table_number        TEXT,
    special_request     TEXT,
    status              TEXT NOT NULL DEFAULT 'pending', -- pending|confirmed|cancelled|completed
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contact / messages
CREATE TABLE IF NOT EXISTS contact_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER REFERENCES customers(id),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    subject         TEXT NOT NULL,
    message         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'unread', -- unread|read
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Replies to messages (manager -> customer)
CREATE TABLE IF NOT EXISTS message_replies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id      INTEGER NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
    from_role       TEXT NOT NULL DEFAULT 'manager',
    reply_message   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name       TEXT NOT NULL,
    category        TEXT,
    quantity        REAL NOT NULL DEFAULT 0,
    unit            TEXT NOT NULL DEFAULT 'pieces',
    minimum_stock   REAL NOT NULL DEFAULT 0,
    supplier        TEXT,
    last_updated    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shop / tax settings (simple key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);
