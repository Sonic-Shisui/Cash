const express = require("express");
const cors = require("cors");
const { kv } = require("@vercel/kv");

const app = express();
app.use(cors());
app.use(express.json());

const CASH_PREFIX = "cash:";

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
        return res.status(400).json({ success: false, error: "Invalid cash amount" });
    }
    try {
        await kv.set(`${CASH_PREFIX}${userId}`, cash);
        res.json({ success: true, data: { userId, cash } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/add", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
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
        return res.status(400).json({ success: false, error: "Invalid amount" });
    }
    try {
        const current = await kv.get(`${CASH_PREFIX}${userId}`);
        if (current === null) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        const currentCash = Number(current);
        if (currentCash < amount) {
            return res.status(400).json({ success: false, error: "Insufficient cash" });
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

app.get("/", (req, res) => {
    res.send(`<h1>Cash Management API</h1><p>Serverless with Vercel KV</p>`);
});

module.exports = app;