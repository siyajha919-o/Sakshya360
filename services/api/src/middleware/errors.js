class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function errorHandler(err, req, res, _next) {
  if (err.name === 'MulterError') return res.status(413).json({ error: err.message });
  if (err.constructor && err.constructor.name === 'MlError') return res.status(503).json({ error: err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate record' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { HttpError, errorHandler };
