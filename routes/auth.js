'use strict';

const express        = require('express');
const AuthController = require('../controllers/authController');
const router         = express.Router();

router.get('/login',  AuthController.showLogin);
router.post('/login', AuthController.postLogin);
router.post('/logout', AuthController.logout);

module.exports = router;
