module.exports = {
  validate: () => ({ valid: true, data: { expiresAt: new Date(Date.now() + 31536000000), plan: 'full' } }),
  validateStandalone: () => ({ valid: true, data: { expiresAt: new Date(Date.now() + 31536000000), plan: 'full' } })
};
