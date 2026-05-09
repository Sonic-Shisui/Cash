const express = require("express");
const cors = require("cors");
const { kv } = require("@vercel/kv");

const app = express();
app.use(cors());
app.use(express.json());

const CASH_PREFIX = "cash:";

async function getUserData(userId) {
    const raw = await kv.get(`${CASH_PREFIX}${userId}`);
    if (raw === null || raw === undefined) return { cash: "0", name: "" };
    if (typeof raw === 'string') {
        if (/^\d+$/.test(raw)) return { cash: raw, name: "" };
        try {
            const parsed = JSON.parse(raw);
            return { cash: parsed.cash || "0", name: parsed.name || "" };
        } catch(e) { return { cash: "0", name: "" }; }
    }
    if (typeof raw === 'object') {
        return { cash: raw.cash?.toString() || "0", name: raw.name || "" };
    }
    return { cash: "0", name: "" };
}

async function setUserData(userId, data) {
    const toStore = JSON.stringify({ cash: data.cash, name: data.name || "" });
    await kv.set(`${CASH_PREFIX}${userId}`, toStore);
}

function isValidCashString(str) {
    return typeof str === 'string' && /^\d+$/.test(str);
}

function addCashStrings(a, b) { return (BigInt(a) + BigInt(b)).toString(); }
function subtractCashStrings(a, b) { return (BigInt(a) - BigInt(b)).toString(); }

app.get("/", (req, res) => {
    res.json({ message: "Cash API avec stockage nom", version: "3.0" });
});

app.get("/api/cash/top", async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    try {
        const keys = await kv.keys(`${CASH_PREFIX}*`);
        const users = [];
        for (const key of keys) {
            const userId = key.replace(CASH_PREFIX, "");
            const userData = await getUserData(userId);
            users.push({ userId, cash: userData.cash, name: userData.name });
        }
        users.sort((a, b) => {
            const bigA = BigInt(a.cash);
            const bigB = BigInt(b.cash);
            if (bigA > bigB) return -1;
            if (bigA < bigB) return 1;
            return 0;
        });
        res.json({ success: true, data: users.slice(0, limit) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const userData = await getUserData(userId);
        res.json({ success: true, data: { userId, cash: userData.cash, name: userData.name } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId/name", async (req, res) => {
    const { userId } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
        return res.status(400).json({ success: false, error: "Nom invalide" });
    }
    try {
        const currentData = await getUserData(userId);
        await setUserData(userId, { cash: currentData.cash, name });
        res.json({ success: true, data: { userId, cash: currentData.cash, name } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/cash/:userId", async (req, res) => {
    const { userId } = req.params;
    let { cash, name } = req.body;
    if (cash === undefined || !isValidCashString(cash.toString())) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    const cashStr = cash.toString();
    const currentData = await getUserData(userId);
    const newName = name !== undefined ? name : currentData.name;
    await setUserData(userId, { cash: cashStr, name: newName });
    res.json({ success: true, data: { userId, cash: cashStr, name: newName } });
});

app.post("/api/cash/:userId/add", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (amount === undefined || !isValidCashString(amount.toString()) || BigInt(amount) <= 0n) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    const currentData = await getUserData(userId);
    const newCash = addCashStrings(currentData.cash, amount.toString());
    await setUserData(userId, { cash: newCash, name: currentData.name });
    res.json({ success: true, data: { userId, cash: newCash, name: currentData.name } });
});

app.post("/api/cash/:userId/subtract", async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;
    if (amount === undefined || !isValidCashString(amount.toString()) || BigInt(amount) <= 0n) {
        return res.status(400).json({ success: false, error: "Montant invalide" });
    }
    const currentData = await getUserData(userId);
    const bigCurrent = BigInt(currentData.cash);
    const bigAmount = BigInt(amount);
    if (bigCurrent < bigAmount) {
        return res.status(400).json({ success: false, error: "Solde insuffisant" });
    }
    const newCash = subtractCashStrings(currentData.cash, amount.toString());
    await setUserData(userId, { cash: newCash, name: currentData.name });
    res.json({ success: true, data: { userId, cash: newCash, name: currentData.name } });
});

module.exports = app;