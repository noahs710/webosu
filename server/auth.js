"use strict";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "30d";

function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function verifyPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, {
    expiresIn: TOKEN_TTL,
  });
}
function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
}

// express middleware: req.user = payload or null
function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  req.user = payload;
  next();
}

function authOptional(req, _res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  req.user = token ? verifyToken(token) : null;
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, authRequired, authOptional };
