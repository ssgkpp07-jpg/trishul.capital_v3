import jwt from 'jsonwebtoken';

const adminUser = (process.env.ADMIN_USERNAME || 'admin@trishulcapital.com').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'TC-ChangeThisPassword';
const secret = process.env.JWT_SECRET || 'change-this-secret';

export default function loginHandler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const input = req.body || {};
  const username = String(input.username || '').trim().toLowerCase();
  if (username !== adminUser || String(input.password || '') !== adminPassword) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  return res.status(200).json({
    token: jwt.sign({ sub: adminUser }, secret, { expiresIn: '12h' })
  });
}
