require('dotenv/config');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const authRouter = require('./services/auth/auth.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

app.use('/auth', authRouter);
app.use('/api/auth', authRoutes);

if (process.env.NODE_ENV === 'test') {
  const { verifyToken } = require('./services/auth/auth.middleware');
  app.get('/__test__/auth-context', verifyToken, (req, res) => {
    res.status(200).json({ user: req.user });
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
