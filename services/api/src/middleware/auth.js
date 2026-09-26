const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');
const { HttpError } = require('./errors');

// Roles that watch projects: the Division sees everything, state/district authorities their own area.
const MONITOR_ROLES = ['official', 'state', 'district'];

const sign = (user, expiresIn = '12h') => jwt.sign({
  sub: user.id, role: user.role, projectId: user.project_id, state: user.state, district: user.district, name: user.name,
}, jwtSecret, { expiresIn });

function decode(token) {
  const p = jwt.verify(token, jwtSecret);
  return { id: p.sub, role: p.role, projectId: p.projectId, state: p.state, district: p.district, name: p.name };
}

// requireRole('official', 'state') – omit roles to allow any signed-in user.
// Tokens are only accepted in the Authorization header (never in URLs, which end up in logs).
const requireRole = (...roles) => (req, _res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return next(new HttpError(401, 'Not signed in'));
  try { req.user = decode(token); } catch { return next(new HttpError(401, 'Session expired')); }
  if (roles.length && !roles.includes(req.user.role)) return next(new HttpError(403, 'Not permitted for your role'));
  next();
};
const requireMonitor = requireRole(...MONITOR_ROLES);

// SQL filter limiting a query to the user's jurisdiction. `alias` is the projects table alias.
function scopeClause(user, params = [], alias = 'p') {
  if (user.role === 'state') {
    params.push(user.state);
    return { sql: `${alias}.state = $${params.length}`, params };
  }
  if (user.role === 'district') {
    params.push(user.state, user.district);
    return { sql: `${alias}.state = $${params.length - 1} AND ${alias}.district = $${params.length}`, params };
  }
  return { sql: 'TRUE', params };
}

// Same rule for a project row already in memory ({ state, district }).
function inScope(user, project) {
  if (user.role === 'official') return true;
  if (user.role === 'state') return project.state === user.state;
  if (user.role === 'district') return project.state === user.state && project.district === user.district;
  return false;
}

const scopeLabel = user => (user.role === 'district' ? `${user.district}, ${user.state}` : user.role === 'state' ? user.state : 'All India');

module.exports = { MONITOR_ROLES, sign, decode, requireRole, requireMonitor, scopeClause, inScope, scopeLabel };
