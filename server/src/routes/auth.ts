import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ADMIN_COOKIE, checkPassword, cookieOptions, createAdminToken, verifyAdminToken } from '../lib/auth';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

authRouter.post('/login', loginLimiter, (req, res) => {
  if (!checkPassword(req.body?.password)) {
    res.status(401).json({ error: 'Incorrect password.' });
    return;
  }
  res.cookie(ADMIN_COOKIE, createAdminToken(), cookieOptions(req));
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(req), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ authenticated: verifyAdminToken(req.cookies?.[ADMIN_COOKIE]) });
});
