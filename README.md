<div align="center">

# ☕ Brew & Bean
### Coffee Management System

<p>
A full-stack coffee shop management system for managing customers,
orders, reservations, products, inventory, and daily shop operations.
</p>

<br>

![HTML](https://img.shields.io/badge/HTML-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)

</div>

---

## ☕ About The Project

**Brew & Bean** is a full-stack Coffee Management System designed to
digitally manage the complete workflow of a coffee shop.

The system provides two dedicated experiences:

- 👤 **Customer Portal** — browse the menu, place orders, make reservations,
  track orders, manage profiles, and contact the shop.
- 🧑‍💼 **Manager Portal** — manage products, orders, reservations, customers,
  inventory, messages, reports, and shop settings.

The frontend is connected to a real **Node.js + Express.js REST API**
with **SQLite** as the database.

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 👤 Customer Portal

- 📋 Browse & search menu
- 🛒 Shopping cart
- 📦 Pickup & delivery orders
- 📍 Delivery address
- 🪑 Table reservations
- 🔐 Registration & login
- 📊 Order history & tracking
- 👤 Profile management
- 💬 Contact & messaging
- 🔑 Password reset

</td>
<td width="50%">

### 🧑‍💼 Manager Portal

- 📊 Dashboard & statistics
- ☕ Product management
- 📦 Order management
- 🪑 Reservation management
- 👥 Customer management
- 📋 Inventory management
- ⚠️ Low-stock alerts
- 💬 Customer messages
- ⚙️ Shop settings
- 💰 Tax & delivery settings

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

| Layer | Technologies |
|------|--------------|
| **Frontend** | HTML5, CSS3, JavaScript |
| **Backend** | Node.js, Express.js |
| **Database** | SQLite |
| **Authentication** | bcrypt + Bearer Tokens |
| **API** | REST API |
| **Runtime** | Node.js 22.5+ |

---

## 📁 Project Structure

```text
Coffee Management System/
│
├── frontend/
│   ├── index.html
│   ├── customer.html
│   ├── manager.html
│   ├── style.css
│   ├── videos/
│   └── uploads/
│
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── schema.sql
│   └── package.json
│
└── README.md
```

---

## 🚀 Getting Started

### 📋 Requirements

Make sure you have:

- **Node.js 22.5 or newer**
- **Git**

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/toobahashim5/coffee-management-system.git
cd coffee-management-system
```

### 2️⃣ Install Backend Dependencies

```bash
cd backend
npm install
```

### 3️⃣ Start the Application

```bash
npm start
```

You should see:

```text
Brew & Bean server running at http://localhost:3000
```

### 4️⃣ Open the Application

Open your browser and visit:

**http://localhost:3000**

The complete application runs from this single URL.

---

## 👤 Customer Portal

From the home page, select **Customer Portal** to:

- Browse the coffee menu
- Search and filter products
- Add products to the cart
- Place pickup or delivery orders
- Make table reservations
- Create an account
- Track orders
- Manage your profile
- Contact the coffee shop

Customers can create their own account through the registration form.

---

## 🧑‍💼 Manager Portal

From the home page, select **Manager Portal**.

### Demo Login

```text
Username: admin
Password: password123
```

The manager can manage:

- Products and menu
- Orders
- Reservations
- Customers
- Inventory
- Customer messages
- Dashboard statistics
- Shop settings
- Tax and delivery settings

> ⚠️ Change the default manager password before using the application
> in a real production environment.

---

## 🗄️ Database

The application uses **SQLite** to store:

- 👥 Customer and manager accounts
- ☕ Products and categories
- 🛒 Orders and order items
- 🪑 Reservations
- 📦 Inventory
- 💬 Contact messages and replies
- ⚙️ Shop settings

The database is initialized automatically when the backend starts.

Order creation uses database transactions to help maintain data integrity.

---

## 🔐 Security

- Passwords are hashed using **bcrypt**.
- Authentication uses bearer session tokens.
- Order totals are calculated by the backend.
- SQLite foreign-key constraints are enabled.
- Protected API routes use authentication middleware.

---

## 📌 Project Highlights

- Full-stack web application
- Customer and manager portals
- REST API integration
- SQLite database
- Authentication system
- Complete ordering workflow
- Reservation management
- Inventory management
- Product image uploads
- Dashboard statistics
- Customer messaging system

---

## 💻 Run Locally

```text
Clone Repository
      ↓
cd backend
      ↓
npm install
      ↓
npm start
      ↓
http://localhost:3000
```

---

<div align="center">

### ☕ Brew • Manage • Serve

**Built with passion for coffee and code.**

</div>