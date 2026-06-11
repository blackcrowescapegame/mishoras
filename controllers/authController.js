'use strict';

const bcrypt = require('bcrypt');
const User = require('../models/User');

const AuthController = {
  showLogin(req, res) {
    if (req.session.userId) return res.redirect(req.session.userRole === 'admin' ? '/admin' : '/hours');
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
      const user = await User.findByEmailAny(email.trim().toLowerCase());
      if (!user || !(await bcrypt.compare(password, user.password))) {
        req.flash('error', 'Correo o contraseña incorrectos.');
        return res.redirect('/auth/login');
      }
      if (!user.active) {
        req.flash('error', 'Tu cuenta está desactivada. Contacta a un administrador para habilitarla.');
        return res.redirect('/auth/login');
      }
      req.session.userId   = user.id;
      req.session.userName = user.name;
      req.session.userRole = user.role;
      req.session.user     = { id: user.id, name: user.name, email: user.email, role: user.role };
      res.redirect(user.role === 'admin' ? '/admin' : '/hours');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Ocurrió un error. Por favor intente de nuevo.');
      res.redirect('/auth/login');
    }
  },

  logout(req, res) {
    req.session.destroy(() => res.redirect('/auth/login'));
  },

  showProfile(req, res) {
    res.render('auth/profile', {
      title: 'My Profile',
      success: req.flash('success'),
      error:   req.flash('error'),
      user:    req.session.user,
    });
  },

  async updateProfile(req, res) {
    const { name } = req.body;
    if (!name || !name.trim()) {
      req.flash('error', 'Name cannot be empty.');
      return res.redirect('/auth/profile');
    }
    try {
      await User.updateProfile(req.session.userId, { name: name.trim() });
      req.session.user = { ...req.session.user, name: name.trim() };
      req.session.userName = name.trim();
      req.flash('success', 'Profile updated.');
      res.redirect('/auth/profile');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update profile.');
      res.redirect('/auth/profile');
    }
  },

  async updatePassword(req, res) {
    const { current_password, new_password, confirm_password } = req.body;
    if (!current_password || !new_password || !confirm_password) {
      req.flash('error', 'All password fields are required.');
      return res.redirect('/auth/profile');
    }
    if (new_password !== confirm_password) {
      req.flash('error', 'New passwords do not match.');
      return res.redirect('/auth/profile');
    }
    if (new_password.length < 6) {
      req.flash('error', 'New password must be at least 6 characters.');
      return res.redirect('/auth/profile');
    }
    try {
      const user = await User.findById(req.session.userId);
      if (!user || !(await bcrypt.compare(current_password, user.password))) {
        req.flash('error', 'Current password is incorrect.');
        return res.redirect('/auth/profile');
      }
      const hashed = await bcrypt.hash(new_password, 10);
      await User.updatePassword(req.session.userId, hashed);
      req.flash('success', 'Password changed successfully.');
      res.redirect('/auth/profile');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update password.');
      res.redirect('/auth/profile');
    }
  },
};

module.exports = AuthController;
