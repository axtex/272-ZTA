const express = require('express');

const { verifyToken, verifyRole } = require('../auth/auth.middleware');
const controller = require('./user.controller');

const router = express.Router();

router.use(verifyToken, verifyRole('admin'));

router.get('/', controller.listUsers);
router.get('/:id', controller.getUser);
router.post('/', controller.createUser);
router.patch('/:id', controller.updateUser);
router.delete('/:id', controller.deleteUser);

// TODO: add nurse ward assignment model to schema
router.post('/:id/assign', controller.assignDoctor);
router.post('/:id/unlock', controller.unlockUser);

module.exports = router;

