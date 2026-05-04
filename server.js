const express = require("express");
const cors = require("cors");
const { kv } = require("@vercel/kv");

const app = express();
app.use(cors());
app.use(express.json());

const CASH_PREFIX = "cash:";

function parseCashData(raw) {
    if (raw === null || raw === undefined) {
        return { cash: 0, name: null };
    }
    if (typeof raw === "number") {
        return { cash: raw, name: null };
    }
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        return {
            cash: Number(raw.cash) || 0,
            name: raw.name || null
        };
    }
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return {
                cash: Number(parsed.cash) || 0,
                name: parsed.name || null
            };
        } catch (e) {
            return { cash: Number(raw) || 0, name: null };
        }
    }
    return { cash: 0, name: null };
}

app.get("/", (req, res) => {
    res.json({ message: "Cash API opérationnelle", version: "3.4.0" });
});

app.get("/api/cash/top", async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    try {
        const keys = await kv.keys(`${CASH_PREFIX}*`);
        const users = [];
        for (const key of keys) {
            const userId = key.replace(CASH_PREFIX, "");
            const raw = await kv.get(key);
            const { cash, name } = parseCashData(raw);
            users.push({ userId, cash, name });
        }
        users.sort((a, b) => b.cash - a.cash);
        res.json({ success: true, data: users.slice(0, limit) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const raw = await kv.get(`${CASH_PREFIX}${userId}`);
        const { cash, name } = parseCashData(raw);
        res.json({ success: true, data: { userId, cash, name } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    const { cash, name } = req.body;
    try {
        const currentCash = (cash !== undefined && cash !== null) ? Number(cash) : 0;
        const data = { cash: String(currentCash) };
        if (name !== undefined && name !== null) data.name = name;
        await kv.set(`${CASH_PREFIX}${userId}`, JSON.stringify(data));
        res.json({ success: true, data: { userId, cash: currentCash, name: name || null } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/add", async (req, res) => {
    const { userId } = req.params;
    const { amount, name } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    try {
        const raw = await kv.get(`${CASH_PREFIX}${userId}`);
        const { cash: currentCash, name: currentName } = parseCashData(raw);
        const newCash = currentCash + numAmount;
        const data = { cash: String(newCash) };
        if (name !== undefined && name !== null) data.name = name;
        else if (currentName) data.name = currentName;
        await kv.set(`${CASH_PREFIX}${userId}`, JSON.stringify(data));
        res.json({ success: true, data: { userId, cash: newCash, name: data.name || null } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/subtract", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    try {
        const raw = await kv.get(`${CASH_PREFIX}${userId}`);
        const { cash: currentCash, name: currentName } = parseCashData(raw);
        if (currentCash < numAmount) {
            return res.status(400).json({ success: false, error: "Solde insuffisant" });
        }
        const newCash = currentCash - numAmount;
        const data = { cash: String(newCash) };
        if (currentName) data.name = currentName;
        await kv.set(`${CASH_PREFIX}${userId}`, JSON.stringify(data));
        res.json({ success: true, data: { userId, cash: newCash, name: data.name || null } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = app;