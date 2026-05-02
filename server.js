const express = require("express");
const cors = require("cors");
const { kv } = require("@vercel/kv");

const app = express();
app.use(cors());
app.use(express.json());

const CASH_PREFIX = "cash:";

app.get("/", (req, res) => {
    res.json({ message: "Cash API opérationnelle", version: "2.0.0" });
});

app.get("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const cash = await kv.get(`${CASH_PREFIX}${userId}`);
        const data = { userId, cash: cash !== null ? Number(cash) : 0 };
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    const { cash } = req.body;
    if (cash === undefined || isNaN(cash)) {
        return res.status(400).json({ success: false, error: "Montant cash invalide" });
    }
    try {
        await kv.set(`${CASH_PREFIX}${userId}`, Number(cash));
        const savedCash = await kv.get(`${CASH_PREFIX}${userId}`);
        console.log(`[CASH API] Set ${userId} = ${savedCash}`);
        res.json({ success: true, data: { userId, cash: Number(savedCash) } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/add", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    try {
        const current = await kv.get(`${CASH_PREFIX}${userId}`);
        const newCash = (current !== null ? Number(current) : 0) + amount;
        await kv.set(`${CASH_PREFIX}${userId}`, newCash);
        res.json({ success: true, data: { userId, cash: newCash } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/subtract", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    try {
        const current = await kv.get(`${CASH_PREFIX}${userId}`);
        if (current === null) {
            return res.status(404).json({ success: false, error: "Utilisateur introuvable" });
        }
        const currentCash = Number(current);
        if (currentCash < amount) {
            return res.status(400).json({ success: false, error: "Solde insuffisant" });
        }
        const newCash = currentCash - amount;
        await kv.set(`${CASH_PREFIX}${userId}`, newCash);
        res.json({ success: true, data: { userId, cash: newCash } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/cash/top", async (req, res) => {
    const limit = parseInt(req.query.limit) || 25;
    try {
        const keys = await kv.keys(`${CASH_PREFIX}*`);
        const users = [];
        for (const key of keys) {
            const userId = key.replace(CASH_PREFIX, "");
            const cash = Number(await kv.get(key)) || 0;
            users.push({ userId, cash });
        }
        users.sort((a, b) => b.cash - a.cash);
        res.json({ success: true, data: users.slice(0, limit) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = app;