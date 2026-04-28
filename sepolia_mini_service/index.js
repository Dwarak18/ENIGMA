require('dotenv').config();
const express = require('express');
const hashRoutes = require('./routes/hashRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Load Routes
app.use('/', hashRoutes);

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'active', network: 'sepolia' });
});

app.listen(PORT, () => {
    console.log(`🚀 Sepolia Mini-Service running on http://localhost:${PORT}`);
    console.log(`📌 RPC Endpoint: ${process.env.SEPOLIA_RPC_URL}`);
    console.log(`🛠️ POST to /submit-hash with { "hash": "..." } to write to blockchain.`);
});
