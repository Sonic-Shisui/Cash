const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3002;

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

app.get("/api/cash/:userId", (req, res) => {
    const { userId } = req.params;
    db.get("SELECT * FROM users WHERE userId = ?", [userId], (err, user) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!user) {
            db.run("INSERT INTO users (userId, cash) VALUES (?, 0)", [userId]);
            return res.json({ success: true, data: { userId, cash: 0 } });
        }
        res.json({ success: true, data: user });
    });
});

app.post("/api/cash/:userId", (req, res) => {
    const { userId } = req.params;
    const { cash } = req.body;
    if (cash === undefined || isNaN(cash)) {
        return res.status(400).json({ success: false, error: "Invalid cash amount" });
    }
    db.run("UPDATE users SET cash = ?, lastUpdated = ? WHERE userId = ?", 
        [cash, Date.now(), userId], 
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            db.get("SELECT * FROM users WHERE userId = ?", [userId], (e, user) => {
                if (e) return res.status(500).json({ success: false, error: e.message });
                res.json({ success: true, data: user });
            });
        });
});

app.post("/api/cash/:userId/add", (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    db.get("SELECT cash FROM users WHERE userId = ?", [userId], (err, user) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!user) {
            db.run("INSERT INTO users (userId, cash) VALUES (?, ?)", [userId, amount]);
            return res.json({ success: true, data: { userId, cash: amount } });
        }
        const newCash = user.cash + amount;
        db.run("UPDATE users SET cash = ?, lastUpdated = ? WHERE userId = ?", 
            [newCash, Date.now(), userId], 
            (updateErr) => {
                if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
                res.json({ success: true, data: { userId, cash: newCash } });
            });
    });
});

app.post("/api/cash/:userId/subtract", (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    db.get("SELECT cash FROM users WHERE userId = ?", [userId], (err, user) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if (user.cash < amount) {
            return res.status(400).json({ success: false, error: "Insufficient cash" });
        }
        const newCash = user.cash - amount;
        db.run("UPDATE users SET cash = ?, lastUpdated = ? WHERE userId = ?", 
            [newCash, Date.now(), userId], 
            (updateErr) => {
                if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
                res.json({ success: true, data: { userId, cash: newCash } });
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

app.get("/", (req, res) => {
    res.send(`
        <h1>Cash Management API</h1>
        <p>Endpoints:</p>
        <ul>
            <li>GET /api/cash/:userId</li>
            <li>POST /api/cash/:userId (body: { cash })</li>
            <li>POST /api/cash/:userId/add (body: { amount })</li>
            <li>POST /api/cash/:userId/subtract (body: { amount })</li>
            <li>GET /api/cash/top?limit=25</li>
        </ul>
    `);
});

app.listen(PORT, () => console.log(`Cash API running on port ${PORT}`));