/**
 * src/routes/agentRoutes.js
 * REST routes for blockchain agent status.
 */
'use strict';

const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/status', async (_req, res) => {
  try {
    const exists = await pool.query(`
      SELECT to_regclass('public.image_proofs') AS table_name
    `);

    if (!exists.rows[0]?.table_name) {
      return res.json({ summary: [], latest: [] });
    }

    const result = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM image_proofs
      GROUP BY status
      ORDER BY status
    `);

    const latest = await pool.query(`
      SELECT image_hash, status, tx_hash, tx_confirmed_block, created_at
      FROM image_proofs
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return res.json({
      summary: result.rows,
      latest: latest.rows,
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Status query failed' });
  }
});

module.exports = router;
