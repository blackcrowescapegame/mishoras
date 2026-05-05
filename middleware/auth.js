'use strict';

function requireLogin(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.flash('error', 'Please log in to access that page.');
  res.redirect('/auth/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.userRole === 'admin') {
    return next();
  }
  res.status(403).render('403', { title: 'Forbidden', user: req.session.user || null });
}

module.exports = { requireLogin, requireAdmin };
