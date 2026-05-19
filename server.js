const express = require("express");
const cors = require("cors");
const { kv } = require("@vercel/kv");

const app = express();
app.use(cors());
app.use(express.json());

const CASH_PREFIX = "cash:";

async function getCashString(userId) {
    const raw = await kv.get(`${CASH_PREFIX}${userId}`);
    if (raw === null || raw === undefined) return "0";
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number') return raw.toString();
    if (typeof raw === 'object' && raw !== null) {
        return raw.cash?.toString() || "0";
    }
    return "0";
}

function isValidCashString(str) {
    if (typeof str !== 'string') return false;
    return /^\d+$/.test(str);
}

app.get("/", (req, res) => {
    res.json({ message: "Cash API opérationnelle", version: "3.0" });
});

app.get("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const cashStr = await getCashString(userId);
        res.json({ success: true, data: { userId, cash: cashStr } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    const { cash } = req.body;
    if (cash === undefined || !isValidCashString(cash.toString())) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    try {
        const cashStr = cash.toString();
        await kv.set(`${CASH_PREFIX}${userId}`, cashStr);
        res.json({ success: true, data: { userId, cash: cashStr } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/add", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (amount === undefined || !isValidCashString(amount.toString()) || BigInt(amount) <= 0n) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    try {
        const current = await getCashString(userId);
        const newCash = (BigInt(current) + BigInt(amount)).toString();
        await kv.set(`${CASH_PREFIX}${userId}`, newCash);
        res.json({ success: true, data: { userId, cash: newCash } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/subtract", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (amount === undefined || !isValidCashString(amount.toString()) || BigInt(amount) <= 0n) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    try {
        const current = await getCashString(userId);
        const bigCurrent = BigInt(current);
        const bigAmount = BigInt(amount);
        if (bigCurrent < bigAmount) {
            return res.status(400).json({ success: false, error: "Solde insuffisant" });
        }
        const newCash = (bigCurrent - bigAmount).toString();
        await kv.set(`${CASH_PREFIX}${userId}`, newCash);
        res.json({ success: true, data: { userId, cash: newCash } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = app;