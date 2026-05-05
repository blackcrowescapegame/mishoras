'use strict';

const bcrypt = require('bcrypt');
const User = require('../models/User');

const AuthController = {
  showLogin(req, res) {
    if (req.session.userId) return res.redirect('/');
    res.render('auth/login', {
      title: 'Login',
      error: req.flash('error'),
      success: req.flash('success'),
    });
  },

  async postLogin(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error', 'Email and password are required.');
      return res.redirect('/auth/login');
    }
    try {
      const user = await User.findByEmail(email.trim().toLowerCase());
      if (!user || !(await bcrypt.compare(password, user.password))) {
        req.flash('error', 'Invalid email or password.');
        return res.redirect('/auth/login');
      }
      req.session.userId   = user.id;
      req.session.userName = user.name;
      req.session.userRole = user.role;
      req.session.user     = { id: user.id, name: user.name, role: user.role };
      res.redirect('/');
    } catch (err) {
      console.error(err);
      req.flash('error', 'An error occurred. Please try again.');
      res.redirect('/auth/login');
    }
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/auth/login'));
  },
};

module.exports = AuthController;
