'use strict';

const express        = require('express');
const AuthController = require('../controllers/authController');
const { requireLogin } = require('../middleware/auth');
const router         = express.Router();

router.get('/login',   AuthController.showLogin);
router.post('/login',  AuthController.postLogin);
router.post('/logout', AuthController.logout);

router.get('/profile',          requireLogin, AuthController.showProfile);
router.post('/profile',         requireLogin, AuthController.updateProfile);
router.post('/profile/password',requireLogin, AuthController.updatePassword);

module.exports = router;
