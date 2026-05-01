const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, "database", "cash.db");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        cash INTEGER DEFAULT 0,
        lastUpdated INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )`);
});

function ensureUserExists(userId, callback) {
    db.run("INSERT OR IGNORE INTO users (userId, cash) VALUES (?, 0)", [userId], callback);
}

app.get("/", (req, res) => {
    res.json({ message: "Cash API opérationnelle", version: "1.0.0" });
});

app.get("/api/cash/:userId", (req, res) => {
    const { userId } = req.params;
    ensureUserExists(userId, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, user) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, data: user });
        });
    });
});

app.post("/api/cash/:userId", (req, res) => {
    const { userId } = req.params;
    const { cash } = req.body;
    if (cash === undefined || isNaN(cash)) {
        return res.status(400).json({ success: false, error: "Montant cash invalide" });
    }
    ensureUserExists(userId, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.run("UPDATE users SET cash = ?, lastUpdated = ? WHERE userId = ?", [cash, Date.now(), userId], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, user) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, data: user });
            });
        });
    });
});

app.post("/api/cash/:userId/add", (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    ensureUserExists(userId, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.run("UPDATE users SET cash = cash + ?, lastUpdated = ? WHERE userId = ?", [amount, Date.now(), userId], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, user) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, data: user });
            });
        });
    });
});

app.post("/api/cash/:userId/subtract", (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    ensureUserExists(userId, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.get("SELECT cash FROM users WHERE userId = ?", [userId], (err, user) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!user || user.cash < amount) {
                return res.status(400).json({ success: false, error: "Solde insuffisant" });
            }
            db.run("UPDATE users SET cash = cash - ?, lastUpdated = ? WHERE userId = ?", [amount, Date.now(), userId], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, user) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    res.json({ success: true, data: user });
                });
            });
        });
    });
});

app.get("/api/cash/top", (req, res) => {
    const limit = parseInt(req.query.limit) || 25;
    db.all("SELECT userId, cash FROM users ORDER BY cash DESC LIMIT ?", [limit], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

app.listen(PORT, () => console.log(`Cash API running on port ${PORT}`));