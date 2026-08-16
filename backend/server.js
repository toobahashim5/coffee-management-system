const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, '..', 'frontend', 'uploads', 'products');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json({ limit: '15mb' })); // large limit to allow base64 image uploads
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function makeToken() {
    return crypto.randomBytes(24).toString('hex');
}

// Deletes a previously-uploaded product image file if it lives under our own
// /uploads/products/ folder (never touches external URLs or base64 strings).
function deleteUploadedImageIfLocal(imagePath) {
    if (!imagePath || !imagePath.startsWith('/uploads/products/')) return;
    const filePath = path.join(__dirname, '..', 'frontend', imagePath);
    fs.unlink(filePath, () => {}); // best-effort, ignore errors
}

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function productRow(row) {
    return {
        id: row.id,
        name: row.name,
        category: row.category_slug,
        description: row.description,
        price: row.price,
        image: row.image || '',
        bestSeller: !!row.best_seller,
        status: row.status,
        stock: row.stock
    };
}

function orderWithItems(order) {
    const items = db.prepare(`
        SELECT product_id AS id, product_name AS name, unit_price AS price, quantity, subtotal
        FROM order_items WHERE order_id = ?
    `).all(order.id);
    return {
        id: order.id,
        customerId: order.customer_id,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        orderType: order.order_type,
        paymentMethod: order.payment_method,
        deliveryAddress: order.delivery_address,
        items,
        subtotal: order.subtotal,
        deliveryFee: order.delivery_fee,
        tax: order.tax,
        total: order.total,
        status: order.status,
        date: order.created_at
    };
}

function reservationOut(r) {
    return {
        id: r.id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        customerEmail: r.customer_email,
        date: r.reservation_date,
        time: r.reservation_time,
        guests: r.number_of_guests,
        table: r.table_number,
        notes: r.special_request,
        status: r.status,
        created: r.created_at
    };
}

function messageOut(m) {
    return {
        id: m.id,
        customerId: m.customer_id,
        name: m.name,
        email: m.email,
        subject: m.subject,
        message: m.message,
        status: m.status,
        date: m.created_at
    };
}

function replyOut(r) {
    return {
        id: r.id,
        messageId: r.message_id,
        from: r.from_role,
        message: r.reply_message,
        date: r.created_at
    };
}

function customerOut(c) {
    return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        loyaltyPoints: c.loyalty_points,
        totalOrders: c.total_orders,
        totalSpent: c.total_spent,
        joinDate: c.created_at
    };
}

// ---------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------
function getBearerToken(req) {
    const header = req.headers['authorization'] || '';
    const parts = header.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
    return null;
}

function requireCustomer(req, res, next) {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const customer = db.prepare('SELECT * FROM customers WHERE session_token = ?').get(token);
    if (!customer) return res.status(401).json({ error: 'Invalid or expired session' });
    req.customer = customer;
    next();
}

function requireManager(req, res, next) {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const manager = db.prepare('SELECT * FROM managers WHERE session_token = ?').get(token);
    if (!manager) return res.status(401).json({ error: 'Invalid or expired session' });
    req.manager = manager;
    next();
}

// =======================================================================
// AUTHENTICATION
// =======================================================================

// Customer registration
app.post('/api/customer/register', (req, res) => {
    try {
        const { name, email, phone, password, address } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
        if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
        if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

        const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
        if (existing) return res.status(409).json({ error: 'Email already exists' });

        const passwordHash = bcrypt.hashSync(password, 10);
        const info = db.prepare(`
            INSERT INTO customers (name, email, phone, password_hash, address, loyalty_points, total_orders, total_spent)
            VALUES (?, ?, ?, ?, ?, 100, 0, 0)
        `).run(name.trim(), email.trim(), phone || '', passwordHash, address || '');

        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
        res.status(201).json({ customer: customerOut(customer) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Customer login
app.post('/api/customer/login', (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!isValidEmail(email) || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
        if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = makeToken();
        db.prepare('UPDATE customers SET session_token = ? WHERE id = ?').run(token, customer.id);
        res.json({ token, customer: customerOut(customer) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Customer logout
app.post('/api/customer/logout', requireCustomer, (req, res) => {
    db.prepare('UPDATE customers SET session_token = NULL WHERE id = ?').run(req.customer.id);
    res.json({ success: true });
});

// Forgot password - generates a short-lived reset token.
// NOTE: this project has no real email/SMS provider configured, so instead
// of silently emailing the token we return it directly in the response as a
// clearly-labelled demo value. In a production system this token would be
// emailed to the customer instead of being sent back to the browser.
app.post('/api/customer/forgot-password', (req, res) => {
    try {
        const { email } = req.body || {};
        if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });

        const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.trim());

        // Always respond the same way whether or not the email exists, so we
        // don't leak which emails have accounts.
        if (!customer) {
            return res.json({ message: 'If an account exists for that email, a reset code has been generated.' });
        }

        const resetToken = crypto.randomBytes(3).toString('hex').toUpperCase(); // short 6-char code
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        db.prepare('UPDATE customers SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
            .run(resetToken, expires, customer.id);

        res.json({
            message: 'If an account exists for that email, a reset code has been generated.',
            demoResetToken: resetToken,
            demoNote: 'No email service is configured for this project, so the reset code is shown here instead of being emailed.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Reset password using the token issued by /forgot-password
app.post('/api/customer/reset-password', (req, res) => {
    try {
        const { email, token, newPassword } = req.body || {};
        if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
        if (!token) return res.status(400).json({ error: 'Reset code is required' });
        if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

        const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email.trim());
        if (!customer || !customer.reset_token || customer.reset_token !== token.trim().toUpperCase()) {
            return res.status(400).json({ error: 'Invalid or expired reset code' });
        }
        if (!customer.reset_token_expires || new Date(customer.reset_token_expires) < new Date()) {
            return res.status(400).json({ error: 'This reset code has expired. Please request a new one.' });
        }

        const passwordHash = bcrypt.hashSync(newPassword, 10);
        db.prepare(`
            UPDATE customers SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, session_token = NULL
            WHERE id = ?
        `).run(passwordHash, customer.id);

        res.json({ message: 'Password reset successfully. Please log in with your new password.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Manager login
app.post('/api/manager/login', (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

        const manager = db.prepare('SELECT * FROM managers WHERE username = ?').get(username.trim());
        if (!manager || !bcrypt.compareSync(password, manager.password_hash)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = makeToken();
        db.prepare('UPDATE managers SET session_token = ? WHERE id = ?').run(token, manager.id);
        res.json({
            token,
            manager: { id: manager.id, name: manager.name, username: manager.username, email: manager.email, role: manager.role }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/manager/logout', requireManager, (req, res) => {
    db.prepare('UPDATE managers SET session_token = NULL WHERE id = ?').run(req.manager.id);
    res.json({ success: true });
});

// Manager profile update
app.put('/api/manager/profile', requireManager, (req, res) => {
    try {
        const { name, email, currentPassword, newPassword } = req.body || {};
        const manager = req.manager;

        if (newPassword) {
            if (!currentPassword || !bcrypt.compareSync(currentPassword, manager.password_hash)) {
                return res.status(400).json({ error: 'Current password is incorrect' });
            }
            const newHash = bcrypt.hashSync(newPassword, 10);
            db.prepare('UPDATE managers SET password_hash = ? WHERE id = ?').run(newHash, manager.id);
        }
        if (name) db.prepare('UPDATE managers SET name = ? WHERE id = ?').run(name, manager.id);
        if (email) db.prepare('UPDATE managers SET email = ? WHERE id = ?').run(email, manager.id);

        const updated = db.prepare('SELECT * FROM managers WHERE id = ?').get(manager.id);
        res.json({ manager: { id: updated.id, name: updated.name, username: updated.username, email: updated.email, role: updated.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Profile update failed' });
    }
});

// =======================================================================
// PRODUCTS / MENU
// =======================================================================

app.get('/api/products', (req, res) => {
    const rows = db.prepare(`
        SELECT p.*, c.slug AS category_slug
        FROM products p LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.id ASC
    `).all();
    res.json(rows.map(productRow));
});

app.get('/api/products/:id', (req, res) => {
    const row = db.prepare(`
        SELECT p.*, c.slug AS category_slug
        FROM products p LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(productRow(row));
});

// Upload a menu item image: accepts a base64 data URL and saves it as a real
// file under frontend/uploads/products, returning the public URL to store
// on the product record instead of the raw base64 blob.
app.post('/api/upload/product-image', requireManager, (req, res) => {
    try {
        const { image } = req.body || {};
        if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
            return res.status(400).json({ error: 'A base64 image data URL is required' });
        }

        // Accept any image/* MIME type (covers png, jpg/jpeg, gif, webp, bmp,
        // svg, heic/heif from phone cameras, etc.), not just a fixed whitelist.
        const match = image.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) return res.status(400).json({ error: 'Unsupported image format' });

        // Sanitize the subtype into a safe file extension
        let ext = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        const extAliases = { jpeg: 'jpg', 'svg+xml': 'svg', xicon: 'ico' };
        ext = extAliases[match[1].toLowerCase()] || ext;
        if (!ext) ext = 'img';

        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) {
            return res.status(400).json({ error: 'The uploaded image appears to be empty or corrupted' });
        }

        // 5MB safety cap per image
        if (buffer.length > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'Image is too large (max 5MB)' });
        }

        const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

        res.status(201).json({ url: `/uploads/products/${filename}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

app.post('/api/products', requireManager, (req, res) => {
    try {
        const { name, category, description, price, image, status, bestSeller, stock } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ error: 'Product name is required' });
        if (!category) return res.status(400).json({ error: 'Category is required' });
        const priceNum = Number(price);
        if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'A valid non-negative price is required' });

        let categoryRow = db.prepare('SELECT id FROM categories WHERE slug = ?').get(category);
        if (!categoryRow) {
            const info = db.prepare('INSERT INTO categories (slug, name) VALUES (?, ?)').run(category, category);
            categoryRow = { id: info.lastInsertRowid };
        }

        const info = db.prepare(`
            INSERT INTO products (name, category_id, description, price, image, best_seller, status, stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name.trim(), categoryRow.id, description || '', priceNum, image || '',
            bestSeller ? 1 : 0, status || 'available', Number.isFinite(Number(stock)) ? Number(stock) : 50
        );

        const row = db.prepare(`
            SELECT p.*, c.slug AS category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?
        `).get(info.lastInsertRowid);
        res.status(201).json(productRow(row));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

app.put('/api/products/:id', requireManager, (req, res) => {
    try {
        const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Product not found' });

        const { name, category, description, price, image, status, bestSeller, stock } = req.body || {};

        let categoryId = existing.category_id;
        if (category) {
            let categoryRow = db.prepare('SELECT id FROM categories WHERE slug = ?').get(category);
            if (!categoryRow) {
                const info = db.prepare('INSERT INTO categories (slug, name) VALUES (?, ?)').run(category, category);
                categoryRow = { id: info.lastInsertRowid };
            }
            categoryId = categoryRow.id;
        }

        let priceNum = existing.price;
        if (price !== undefined) {
            priceNum = Number(price);
            if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'A valid non-negative price is required' });
        }

        db.prepare(`
            UPDATE products SET
                name = ?, category_id = ?, description = ?, price = ?, image = ?,
                best_seller = ?, status = ?, stock = ?
            WHERE id = ?
        `).run(
            name !== undefined ? name.trim() : existing.name,
            categoryId,
            description !== undefined ? description : existing.description,
            priceNum,
            image !== undefined ? image : existing.image,
            bestSeller !== undefined ? (bestSeller ? 1 : 0) : existing.best_seller,
            status !== undefined ? status : existing.status,
            stock !== undefined ? Number(stock) : existing.stock,
            req.params.id
        );

        // If the image was replaced with something different, clean up the old file
        if (image !== undefined && image !== existing.image) {
            deleteUploadedImageIfLocal(existing.image);
        }

        const row = db.prepare(`
            SELECT p.*, c.slug AS category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?
        `).get(req.params.id);
        res.json(productRow(row));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

app.delete('/api/products/:id', requireManager, (req, res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    deleteUploadedImageIfLocal(existing.image);
    res.json({ success: true });
});

// =======================================================================
// ORDERS
// =======================================================================

// Create order (transaction, backend computes totals from DB prices)
app.post('/api/orders', (req, res) => {
    const { items, orderType, paymentMethod, deliveryAddress, customerId, guestName, guestEmail, guestPhone } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Order must contain at least one item' });
    }
    if (!['pickup', 'delivery'].includes(orderType)) {
        return res.status(400).json({ error: 'Invalid order type' });
    }

    // Resolve customer info
    let customer = null;
    const token = getBearerToken(req);
    if (token) {
        customer = db.prepare('SELECT * FROM customers WHERE session_token = ?').get(token);
    } else if (customerId) {
        customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    }

    const customerName = customer ? customer.name : (guestName || 'Guest Customer');
    const customerEmail = customer ? customer.email : (guestEmail || 'guest@example.com');
    const customerPhone = customer ? customer.phone : (guestPhone || 'Not provided');

    try {
        const createOrder = db.transaction(() => {
            // Validate products & compute subtotal from real DB prices
            let subtotal = 0;
            const resolvedItems = items.map(reqItem => {
                const product = db.prepare('SELECT * FROM products WHERE id = ?').get(reqItem.id);
                if (!product) throw { status: 400, message: `Product with id ${reqItem.id} does not exist` };
                if (product.status !== 'available') throw { status: 400, message: `${product.name} is currently unavailable` };
                const quantity = parseInt(reqItem.quantity, 10);
                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw { status: 400, message: `Invalid quantity for ${product.name}` };
                }
                const lineSubtotal = product.price * quantity;
                subtotal += lineSubtotal;
                return { product, quantity, lineSubtotal };
            });

            const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'tax'").get();
            const taxSettings = settingsRow ? JSON.parse(settingsRow.value) : { taxRate: 5, deliveryFee: 150 };

            const deliveryFee = orderType === 'delivery' ? Number(taxSettings.deliveryFee || 150) : 0;
            const tax = subtotal * (Number(taxSettings.taxRate || 5) / 100);
            const total = subtotal + deliveryFee + tax;

            const orderInfo = db.prepare(`
                INSERT INTO orders (customer_id, customer_name, customer_email, customer_phone, order_type, payment_method, delivery_address, subtotal, delivery_fee, tax, total, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
                customer ? customer.id : null, customerName, customerEmail, customerPhone,
                orderType, paymentMethod || 'Cash on Delivery', deliveryAddress || null,
                subtotal, deliveryFee, tax, total
            );

            const insertItem = db.prepare(`
                INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            resolvedItems.forEach(({ product, quantity, lineSubtotal }) => {
                insertItem.run(orderInfo.lastInsertRowid, product.id, product.name, quantity, product.price, lineSubtotal);
                // Reduce product stock
                db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').run(quantity, product.id);
            });

            // Update customer loyalty stats
            if (customer) {
                const newTotalOrders = customer.total_orders + 1;
                const newTotalSpent = customer.total_spent + total;
                const newLoyalty = customer.loyalty_points + Math.floor(total / 10);
                db.prepare(`
                    UPDATE customers SET total_orders = ?, total_spent = ?, loyalty_points = ? WHERE id = ?
                `).run(newTotalOrders, newTotalSpent, newLoyalty, customer.id);
            }

            return orderInfo.lastInsertRowid;
        });

        const orderId = createOrder();
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        res.status(201).json(orderWithItems(order));
    } catch (err) {
        if (err && err.status) return res.status(err.status).json({ error: err.message });
        console.error(err);
        res.status(500).json({ error: 'Failed to place order' });
    }
});

// All orders (manager)
app.get('/api/orders', requireManager, (req, res) => {
    const { status } = req.query;
    let rows;
    if (status && status !== 'all') {
        rows = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC').all(status);
    } else {
        rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    }
    res.json(rows.map(orderWithItems));
});

// Customer's own orders
app.get('/api/orders/my-orders', requireCustomer, (req, res) => {
    const rows = db.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC').all(req.customer.id);
    res.json(rows.map(orderWithItems));
});

app.get('/api/orders/:id', (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // If requester is an authenticated customer, ensure they only see their own order
    const token = getBearerToken(req);
    if (token) {
        const customer = db.prepare('SELECT * FROM customers WHERE session_token = ?').get(token);
        if (customer && order.customer_id && order.customer_id !== customer.id) {
            return res.status(403).json({ error: 'Not authorized to view this order' });
        }
    }
    res.json(orderWithItems(order));
});

app.put('/api/orders/:id', requireManager, (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { status } = req.body || {};
    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid order status' });

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    res.json(orderWithItems(updated));
});

// =======================================================================
// RESERVATIONS
// =======================================================================

app.post('/api/reservations', (req, res) => {
    try {
        const { name, phone, email, date, time, guests, table, notes } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
        if (!phone) return res.status(400).json({ error: 'Phone number is required' });
        if (!date) return res.status(400).json({ error: 'Reservation date is required' });
        if (!time) return res.status(400).json({ error: 'Reservation time is required' });
        const guestsNum = parseInt(guests, 10);
        if (!Number.isFinite(guestsNum) || guestsNum <= 0) return res.status(400).json({ error: 'Invalid number of guests' });

        let customer = null;
        const token = getBearerToken(req);
        if (token) customer = db.prepare('SELECT * FROM customers WHERE session_token = ?').get(token);

        const info = db.prepare(`
            INSERT INTO reservations (customer_id, customer_name, customer_phone, customer_email, reservation_date, reservation_time, number_of_guests, table_number, special_request, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            customer ? customer.id : null, name.trim(), phone, email || 'Not provided',
            date, time, guestsNum, table || null, notes || ''
        );

        const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(info.lastInsertRowid);
        res.status(201).json(reservationOut(reservation));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create reservation' });
    }
});

app.get('/api/reservations', requireManager, (req, res) => {
    const rows = db.prepare('SELECT * FROM reservations ORDER BY reservation_date ASC, reservation_time ASC').all();
    res.json(rows.map(reservationOut));
});

app.get('/api/reservations/my-reservations', requireCustomer, (req, res) => {
    const rows = db.prepare(`
        SELECT * FROM reservations
        WHERE customer_id = ? OR customer_email = ? OR customer_phone = ?
        ORDER BY reservation_date DESC
    `).all(req.customer.id, req.customer.email, req.customer.phone);
    res.json(rows.map(reservationOut));
});

app.put('/api/reservations/:id', requireManager, (req, res) => {
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });

    const { status } = req.body || {};
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid reservation status' });

    db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);
    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    res.json(reservationOut(updated));
});

app.delete('/api/reservations/:id', requireManager, (req, res) => {
    const reservation = db.prepare('SELECT id FROM reservations WHERE id = ?').get(req.params.id);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// =======================================================================
// CONTACT MESSAGES
// =======================================================================

app.post('/api/contact', (req, res) => {
    try {
        const { name, email, subject, message } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
        if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
        if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
        if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

        let customer = null;
        const token = getBearerToken(req);
        if (token) customer = db.prepare('SELECT * FROM customers WHERE session_token = ?').get(token);

        const info = db.prepare(`
            INSERT INTO contact_messages (customer_id, name, email, subject, message, status)
            VALUES (?, ?, ?, ?, ?, 'unread')
        `).run(customer ? customer.id : null, name.trim(), email.trim(), subject.trim(), message.trim());

        const msg = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(info.lastInsertRowid);
        res.status(201).json(messageOut(msg));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/api/contact', requireManager, (req, res) => {
    const rows = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
    const withReplies = rows.map(m => {
        const replies = db.prepare('SELECT * FROM message_replies WHERE message_id = ? ORDER BY created_at ASC').all(m.id);
        return { ...messageOut(m), replies: replies.map(replyOut) };
    });
    res.json(withReplies);
});

app.get('/api/contact/my-messages', requireCustomer, (req, res) => {
    const rows = db.prepare(`
        SELECT * FROM contact_messages
        WHERE customer_id = ? OR email = ?
        ORDER BY created_at DESC
    `).all(req.customer.id, req.customer.email);
    const withReplies = rows.map(m => {
        const replies = db.prepare('SELECT * FROM message_replies WHERE message_id = ? ORDER BY created_at ASC').all(m.id);
        return { ...messageOut(m), replies: replies.map(replyOut) };
    });
    res.json(withReplies);
});

app.put('/api/contact/mark-all-read', requireManager, (req, res) => {
    db.prepare("UPDATE contact_messages SET status = 'read' WHERE status = 'unread'").run();
    res.json({ success: true });
});

app.put('/api/contact/:id', requireManager, (req, res) => {
    const msg = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const { status } = req.body || {};
    if (status && !['unread', 'read'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status || 'read', req.params.id);
    const updated = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
    res.json(messageOut(updated));
});

app.delete('/api/contact/:id', requireManager, (req, res) => {
    const msg = db.prepare('SELECT id FROM contact_messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

app.post('/api/contact/:id/reply', requireManager, (req, res) => {
    const msg = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const { message, from } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: 'Reply message is required' });

    const info = db.prepare(`
        INSERT INTO message_replies (message_id, from_role, reply_message)
        VALUES (?, ?, ?)
    `).run(req.params.id, from || 'manager', message.trim());

    db.prepare("UPDATE contact_messages SET status = 'read' WHERE id = ?").run(req.params.id);

    const reply = db.prepare('SELECT * FROM message_replies WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(replyOut(reply));
});

// =======================================================================
// CUSTOMERS (manager view + profile self-service)
// =======================================================================

app.get('/api/customers', requireManager, (req, res) => {
    const rows = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
    const out = rows.map(c => {
        const orderCount = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE customer_id = ?').get(c.id).c;
        const reservationCount = db.prepare('SELECT COUNT(*) AS c FROM reservations WHERE customer_id = ?').get(c.id).c;
        return { ...customerOut(c), orderCount, reservationCount };
    });
    res.json(out);
});

app.get('/api/customers/me', requireCustomer, (req, res) => {
    res.json(customerOut(req.customer));
});

app.get('/api/customers/:id', (req, res) => {
    // A customer may view only their own record; a manager may view any record.
    const token = getBearerToken(req);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    if (token) {
        const asCustomer = db.prepare('SELECT * FROM customers WHERE session_token = ?').get(token);
        if (asCustomer && asCustomer.id === customer.id) return res.json(customerOut(customer));
        const asManager = db.prepare('SELECT * FROM managers WHERE session_token = ?').get(token);
        if (asManager) return res.json(customerOut(customer));
    }
    return res.status(403).json({ error: 'Not authorized' });
});

app.put('/api/customers/:id', requireCustomer, (req, res) => {
    if (Number(req.params.id) !== req.customer.id) {
        return res.status(403).json({ error: 'You may only update your own profile' });
    }
    const { name, phone, address } = req.body || {};
    db.prepare(`
        UPDATE customers SET
            name = COALESCE(?, name),
            phone = COALESCE(?, phone),
            address = COALESCE(?, address)
        WHERE id = ?
    `).run(name, phone, address, req.customer.id);

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id);
    res.json(customerOut(updated));
});

// =======================================================================
// INVENTORY
// =======================================================================

function inventoryOut(i) {
    return {
        id: i.id,
        name: i.item_name,
        category: i.category,
        stock: i.quantity,
        unit: i.unit,
        reorder: i.minimum_stock,
        supplier: i.supplier,
        lastUpdated: i.last_updated
    };
}

app.get('/api/inventory', requireManager, (req, res) => {
    const rows = db.prepare('SELECT * FROM inventory ORDER BY item_name ASC').all();
    res.json(rows.map(inventoryOut));
});

app.get('/api/inventory/low-stock', requireManager, (req, res) => {
    const rows = db.prepare('SELECT * FROM inventory WHERE quantity <= minimum_stock ORDER BY item_name ASC').all();
    res.json(rows.map(inventoryOut));
});

app.post('/api/inventory', requireManager, (req, res) => {
    const { name, category, stock, unit, reorder, supplier } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Item name is required' });
    const stockNum = Number(stock);
    const reorderNum = Number(reorder);
    if (!Number.isFinite(stockNum) || stockNum < 0) return res.status(400).json({ error: 'Invalid stock quantity' });
    if (!Number.isFinite(reorderNum) || reorderNum < 0) return res.status(400).json({ error: 'Invalid reorder level' });

    const info = db.prepare(`
        INSERT INTO inventory (item_name, category, quantity, unit, minimum_stock, supplier)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(name.trim(), category || '', stockNum, unit || 'pieces', reorderNum, supplier || '');

    const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(inventoryOut(row));
});

app.put('/api/inventory/:id', requireManager, (req, res) => {
    const existing = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Inventory item not found' });

    const { name, category, stock, addStock, unit, reorder, supplier } = req.body || {};

    let newStock = existing.quantity;
    if (stock !== undefined) {
        newStock = Number(stock);
        if (!Number.isFinite(newStock) || newStock < 0) return res.status(400).json({ error: 'Invalid stock quantity' });
    } else if (addStock !== undefined) {
        const addNum = Number(addStock);
        if (!Number.isFinite(addNum) || addNum <= 0) return res.status(400).json({ error: 'Invalid restock quantity' });
        newStock = existing.quantity + addNum;
    }

    db.prepare(`
        UPDATE inventory SET
            item_name = ?, category = ?, quantity = ?, unit = ?, minimum_stock = ?, supplier = ?, last_updated = datetime('now')
        WHERE id = ?
    `).run(
        name !== undefined ? name : existing.item_name,
        category !== undefined ? category : existing.category,
        newStock,
        unit !== undefined ? unit : existing.unit,
        reorder !== undefined ? Number(reorder) : existing.minimum_stock,
        supplier !== undefined ? supplier : existing.supplier,
        req.params.id
    );

    const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(req.params.id);
    res.json(inventoryOut(row));
});

app.delete('/api/inventory/:id', requireManager, (req, res) => {
    const existing = db.prepare('SELECT id FROM inventory WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Inventory item not found' });
    db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// =======================================================================
// DASHBOARD
// =======================================================================

app.get('/api/dashboard', requireManager, (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    const todayOrders = db.prepare(`SELECT * FROM orders WHERE date(created_at) = ?`).all(today);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const pendingOrders = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'`).get().c;
    const activeReservations = db.prepare(`
        SELECT COUNT(*) AS c FROM reservations WHERE date(reservation_date) >= date('now') AND status != 'cancelled'
    `).get().c;

    const totalCustomers = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
    const totalOrders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
    const totalSales = db.prepare('SELECT COALESCE(SUM(total),0) AS s FROM orders').get().s;
    const totalReservations = db.prepare('SELECT COUNT(*) AS c FROM reservations').get().c;
    const totalProducts = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    const availableProducts = db.prepare("SELECT COUNT(*) AS c FROM products WHERE status = 'available'").get().c;
    const lowStockInventory = db.prepare('SELECT COUNT(*) AS c FROM inventory WHERE quantity <= minimum_stock').get().c;
    const completedOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'completed'").get().c;
    const unreadMessages = db.prepare("SELECT COUNT(*) AS c FROM contact_messages WHERE status = 'unread'").get().c;

    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all().map(orderWithItems);
    const recentReservations = db.prepare('SELECT * FROM reservations ORDER BY created_at DESC LIMIT 5').all().map(reservationOut);

    res.json({
        todayOrders: todayOrders.length,
        todayRevenue,
        pendingOrders,
        activeReservations,
        totalCustomers,
        totalOrders,
        totalSales,
        totalReservations,
        totalProducts,
        availableProducts,
        lowStockInventory,
        completedOrders,
        unreadMessages,
        recentOrders,
        recentReservations
    });
});

// =======================================================================
// SETTINGS
// =======================================================================

app.get('/api/settings', (req, res) => {
    const rows = db.prepare('SELECT * FROM settings').all();
    const out = {};
    rows.forEach(r => { out[r.key] = JSON.parse(r.value); });
    res.json(out);
});

app.put('/api/settings/shop', requireManager, (req, res) => {
    const { shopName, openingTime, closingTime, contactEmail, contactPhone, shopAddress } = req.body || {};
    const value = JSON.stringify({ shopName, openingTime, closingTime, contactEmail, contactPhone, shopAddress });
    db.prepare(`
        INSERT INTO settings (key, value) VALUES ('shop', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(value);
    res.json({ shop: JSON.parse(value) });
});

app.put('/api/settings/tax', requireManager, (req, res) => {
    const { taxRate, serviceCharge, deliveryFee } = req.body || {};
    const value = JSON.stringify({ taxRate, serviceCharge, deliveryFee });
    db.prepare(`
        INSERT INTO settings (key, value) VALUES ('tax', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(value);
    res.json({ tax: JSON.parse(value) });
});

// =======================================================================
// Fallback / start
// =======================================================================

app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
    console.log(`Brew & Bean server running at http://localhost:${PORT}`);
});
