'use strict';

require('dotenv').config();

const express        = require('express');
const session        = require('express-session');
const flash          = require('connect-flash');
const methodOverride = require('method-override');
const path           = require('path');
const cookieParser   = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');

const authRoutes  = require('./routes/auth');
const hoursRoutes = require('./routes/hours');
const adminRoutes = require('./routes/admin');
const { requireLogin } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── View engine ── */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ── Static files ── */
app.use(express.static(path.join(__dirname, 'public')));

/* ── Cookie parser (required by csrf-csrf) ── */
app.use(cookieParser());

/* ── Body parsers ── */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ── Method override (PUT / DELETE from HTML forms) ── */
app.use(methodOverride('_method'));

/* ── Session ── */
app.use(session({
  secret: process.env.SESSION_SECRET || 'mishoras-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
}));

/* ── Flash messages ── */
app.use(flash());

/* ── CSRF protection ── */
const isProduction = process.env.NODE_ENV === 'production';
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'mishoras-dev-secret',
  getSessionIdentifier: (req) => req.session.id,
  cookieName: isProduction ? '__Host-x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: isProduction,
    httpOnly: true,
  },
  size: 64,
  getCsrfTokenFromRequest: (req) =>
    (req.body && req.body._csrf) || req.query._csrf || req.headers['x-csrf-token'],
});

app.use(doubleCsrfProtection);

/* Expose CSRF token to all EJS views */
app.use((req, res, next) => {
  res.locals.csrfToken = generateCsrfToken(req, res);
  next();
});

/* ── Routes ── */
app.use('/auth',  authRoutes);
app.use('/hours', hoursRoutes);
app.use('/admin', adminRoutes);

/* ── Home ── */
app.get('/', requireLogin, (req, res) => {
  if (req.session.userRole === 'admin') return res.redirect('/admin');
  res.redirect('/hours');
});

/* ── 404 ── */
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found', user: req.session.user || null });
});

/* ── Error handler ── */
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).render('500', { title: 'Server Error', user: req.session.user || null });
});

app.listen(PORT, () => {
  console.log(`mishoras running on http://localhost:${PORT}`);
});

module.exports = app;
