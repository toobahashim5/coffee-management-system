const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'coffee_shop.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const rawDb = new DatabaseSync(DB_PATH);
rawDb.exec('PRAGMA foreign_keys = ON');

// Run schema (idempotent - uses CREATE TABLE IF NOT EXISTS)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
rawDb.exec(schema);

// ---------------------------------------------------------------------
// A tiny better-sqlite3-style wrapper around node:sqlite's DatabaseSync
// so the rest of the codebase can keep using db.prepare(...).run/get/all
// and db.transaction(fn) exactly as before.
// ---------------------------------------------------------------------
const db = {
    raw: rawDb,
    prepare(sql) {
        const stmt = rawDb.prepare(sql);
        return {
            run: (...args) => stmt.run(...args),
            get: (...args) => stmt.get(...args),
            all: (...args) => stmt.all(...args)
        };
    },
    exec(sql) {
        return rawDb.exec(sql);
    },
    transaction(fn) {
        return (...args) => {
            rawDb.exec('BEGIN');
            try {
                const result = fn(...args);
                rawDb.exec('COMMIT');
                return result;
            } catch (err) {
                rawDb.exec('ROLLBACK');
                throw err;
            }
        };
    }
};

// ---------------------------------------------------------------------
// Lightweight migrations: add new columns to tables that already existed
// (from a database created before this update) without touching data.
// ---------------------------------------------------------------------
function migrate() {
    const customerColumns = db.prepare("PRAGMA table_info(customers)").all().map(c => c.name);
    if (!customerColumns.includes('reset_token')) {
        db.exec('ALTER TABLE customers ADD COLUMN reset_token TEXT');
    }
    if (!customerColumns.includes('reset_token_expires')) {
        db.exec('ALTER TABLE customers ADD COLUMN reset_token_expires TEXT');
    }
}
migrate();

// ---------------------------------------------------------------------
// Seed minimal sample data ONLY if the database is empty.
// ---------------------------------------------------------------------
function seed() {
    const categoryCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
    if (categoryCount === 0) {
        const insertCategory = db.prepare('INSERT INTO categories (slug, name) VALUES (?, ?)');
        const categories = [
            ['hot-coffee', 'Hot Coffee'],
            ['cold-coffee', 'Cold Coffee'],
            ['tea', 'Tea'],
            ['desserts', 'Desserts']
        ];
        const insertMany = db.transaction((rows) => {
            rows.forEach(row => insertCategory.run(...row));
        });
        insertMany(categories);
    }

    const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    if (productCount === 0) {
        const catRow = (slug) => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;
        const insertProduct = db.prepare(`
            INSERT INTO products (name, category_id, description, price, image, best_seller, status, stock)
            VALUES (@name, @category_id, @description, @price, @image, @best_seller, @status, @stock)
        `);
        const products = [
            { name: "Espresso", category: "hot-coffee", price: 350, description: "Strong and rich Italian-style coffee", stock: 50, best_seller: 1 },
            { name: "Cappuccino", category: "hot-coffee", price: 450, description: "Espresso with steamed milk and foam", stock: 45, best_seller: 1 },
            { name: "Latte", category: "hot-coffee", price: 500, description: "Smooth espresso with steamed milk", stock: 40, best_seller: 0 },
            { name: "Americano", category: "hot-coffee", price: 400, description: "Espresso diluted with hot water", stock: 35, best_seller: 0 },
            { name: "Mocha", category: "hot-coffee", price: 550, description: "Chocolate-infused coffee with milk", stock: 30, best_seller: 1 },
            { name: "Iced Coffee", category: "cold-coffee", price: 450, description: "Chilled coffee served over ice", stock: 25, best_seller: 0 },
            { name: "Cold Brew", category: "cold-coffee", price: 500, description: "Slow-steeped coffee for 24 hours", stock: 20, best_seller: 1 },
            { name: "Iced Caramel Macchiato", category: "cold-coffee", price: 600, description: "Vanilla, milk, espresso, and caramel", stock: 15, best_seller: 1 },
            { name: "Frappuccino", category: "cold-coffee", price: 650, description: "Blended coffee drink with ice", stock: 18, best_seller: 0 },
            { name: "Iced Mocha", category: "cold-coffee", price: 600, description: "Chocolate coffee served cold", stock: 22, best_seller: 0 },
            { name: "Green Tea", category: "tea", price: 300, description: "Freshly brewed green tea", stock: 40, best_seller: 0 },
            { name: "Chai Latte", category: "tea", price: 350, description: "Spiced tea with steamed milk", stock: 35, best_seller: 1 },
            { name: "Earl Grey", category: "tea", price: 300, description: "Black tea with bergamot", stock: 30, best_seller: 0 },
            { name: "Iced Tea", category: "tea", price: 350, description: "Refreshing tea served over ice", stock: 25, best_seller: 0 },
            { name: "Chocolate Brownie", category: "desserts", price: 400, description: "Rich, fudgy chocolate brownie", stock: 20, best_seller: 1 },
            { name: "Blueberry Muffin", category: "desserts", price: 350, description: "Fresh blueberry muffin", stock: 25, best_seller: 0 },
            { name: "Croissant", category: "desserts", price: 300, description: "Buttery French pastry", stock: 30, best_seller: 1 },
            { name: "Cheesecake", category: "desserts", price: 550, description: "Creamy New York style cheesecake", stock: 15, best_seller: 1 }
        ];
        const insertMany = db.transaction((rows) => {
            rows.forEach(p => {
                insertProduct.run({
                    name: p.name,
                    category_id: catRow(p.category),
                    description: p.description,
                    price: p.price,
                    image: '',
                    best_seller: p.best_seller,
                    status: 'available',
                    stock: p.stock
                });
            });
        });
        insertMany(products);
    }

    const inventoryCount = db.prepare('SELECT COUNT(*) AS c FROM inventory').get().c;
    if (inventoryCount === 0) {
        const insertInv = db.prepare(`
            INSERT INTO inventory (item_name, category, quantity, unit, minimum_stock, supplier)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const items = [
            ["Coffee Beans", "Ingredients", 15, "kg", 20, "Premium Roasters"],
            ["Milk", "Dairy", 50, "liters", 10, "Fresh Dairy Co."],
            ["Sugar", "Ingredients", 30, "kg", 5, "Sweet Suppliers"],
            ["Cups", "Supplies", 500, "pieces", 100, "Packaging Plus"],
            ["Lids", "Supplies", 450, "pieces", 50, "Packaging Plus"],
            ["Chocolate Syrup", "Ingredients", 8, "liters", 5, "Sweet Suppliers"],
            ["Vanilla Extract", "Ingredients", 3, "liters", 2, "Flavor Masters"]
        ];
        const insertMany = db.transaction((rows) => rows.forEach(r => insertInv.run(...r)));
        insertMany(items);
    }

    const managerCount = db.prepare('SELECT COUNT(*) AS c FROM managers').get().c;
    if (managerCount === 0) {
        const passwordHash = bcrypt.hashSync('password123', 10);
        db.prepare(`
            INSERT INTO managers (name, username, email, password_hash, role)
            VALUES (?, ?, ?, ?, ?)
        `).run('Admin User', 'admin', 'admin@brewandbean.com', passwordHash, 'manager');
    }

    const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
    if (settingsCount === 0) {
        const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        insertSetting.run('shop', JSON.stringify({
            shopName: 'Brew & Bean Coffee Shop',
            openingTime: '07:00',
            closingTime: '22:00',
            contactEmail: 'contact@brewandbean.com',
            contactPhone: '+92 300 1234567',
            shopAddress: '123 Coffee Street, Downtown, Karachi, Pakistan'
        }));
        insertSetting.run('tax', JSON.stringify({
            taxRate: 5,
            serviceCharge: 10,
            deliveryFee: 150
        }));
    }
}

seed();

module.exports = db;
