const express = require("express");
const cors = require("cors");
const { kv } = require("@vercel/kv");

const app = express();
app.use(cors());
app.use(express.json());

const CASH_PREFIX = "cash:";

// Extrait la valeur sous forme de chaîne (BigInt) depuis Redis
// Retourne "0" si la clé n'existe pas ou si le format est invalide
async function getCashString(userId) {
    const raw = await kv.get(`${CASH_PREFIX}${userId}`);
    if (raw === null || raw === undefined) return "0";
    // Si déjà une chaîne, la retourner
    if (typeof raw === 'string') return raw;
    // Si c'est un nombre (ancien format), convertir en chaîne
    if (typeof raw === 'number') return raw.toString();
    // Si c'est un objet improbable
    if (typeof raw === 'object' && raw !== null) {
        return raw.cash?.toString() || "0";
    }
    return "0";
}

// Valide qu'une chaîne représente un entier non négatif (BigInt compatible)
function isValidCashString(str) {
    if (typeof str !== 'string') return false;
    // Permet des nombres avec ou sans signe +, mais on veut des entiers >= 0
    // On accepte uniquement les chiffres (pas de point décimal)
    return /^\d+$/.test(str);
}

// Ajoute deux montants sous forme de chaînes (BigInt)
function addCashStrings(a, b) {
    const bigA = BigInt(a);
    const bigB = BigInt(b);
    return (bigA + bigB).toString();
}

// Soustrait b de a (a >= b attendu)
function subtractCashStrings(a, b) {
    const bigA = BigInt(a);
    const bigB = BigInt(b);
    return (bigA - bigB).toString();
}

app.get("/", (req, res) => {
    res.json({ message: "Cash API opérationnelle (stockage string infini)", version: "2.0" });
});

// Endpoint pour récupérer le top (toujours trié, mais les comparaisons sont sur BigInt)
app.get("/api/cash/top", async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    try {
        const keys = await kv.keys(`${CASH_PREFIX}*`);
        const users = [];
        for (const key of keys) {
            const userId = key.replace(CASH_PREFIX, "");
            const cashStr = await getCashString(userId);
            users.push({ userId, cash: cashStr });
        }
        // Tri en utilisant BigInt
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
        return res.status(400).json({ success: false, error: "Montant cash invalide (doit être un entier positif)" });
    }
    try {
        const cashStr = cash.toString(); // s'assurer que c'est une chaîne
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
        return res.status(400).json({ success: false, error: "Montant invalide (doit être un entier positif)" });
    }
    try {
        const current = await getCashString(userId);
        const newCash = addCashStrings(current, amount.toString());
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
        return res.status(400).json({ success: false, error: "Montant invalide (doit être un entier positif)" });
    }
    try {
        const current = await getCashString(userId);
        const bigCurrent = BigInt(current);
        const bigAmount = BigInt(amount);
        if (bigCurrent < bigAmount) {
            return res.status(400).json({ success: false, error: "Solde insuffisant" });
        }
        const newCash = subtractCashStrings(current, amount.toString());
        await kv.set(`${CASH_PREFIX}${userId}`, newCash);
        res.json({ success: true, data: { userId, cash: newCash } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = app;