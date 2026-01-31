import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'change-me';

export function sign(payload) {
  return jwt.sign(payload, SECRET);
}

export function verify(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const payload = verify(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = payload.userId;
  next();
}
