const express = require('express');
const router = express.Router();
const { sendHashTransaction } = require('../services/txService');

/**
 * POST /submit-hash
 * Body: { "hash": "string" }
 */
router.post('/submit-hash', async (req, res) => {
    const { hash } = req.body;

    if (!hash) {
        return res.status(400).json({ error: "Missing 'hash' in request body" });
    }

    try {
        const result = await sendHashTransaction(hash);
        res.status(202).json(result);
    } catch (error) {
        console.error(`Request Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
