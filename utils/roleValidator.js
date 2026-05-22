/**
 * Role Validation Helper
 * Enforces restrictions on which roles can have multiple users.
 *
 * Restricted roles (only 1 user allowed):
 *   - Admin
 *   - HR Management
 *   - Sales Manager
 *
 * Unrestricted roles (multiple users allowed):
 *   - Finance Management
 *   - Sales Rep
 */

const User = require('../models/User');

// Define which roles can only have a single user
const SINGLE_USER_ROLES = ['Admin', 'HR Management', 'Sales Manager'];
const MULTI_USER_ROLES = ['Finance Management', 'Sales Rep'];

/**
 * Check if a role can only have a single user
 * @param {String} role - The role name
 * @returns {Boolean} - true if role is restricted to single user
 */
function isSingleUserRole(role) {
  return SINGLE_USER_ROLES.includes(role);
}

/**
 * Check if a role allows multiple users
 * @param {String} role - The role name
 * @returns {Boolean} - true if role allows multiple users
 */
function isMultiUserRole(role) {
  return MULTI_USER_ROLES.includes(role);
}

/**
 * Validate if a new user can be assigned a role
 * For single-user roles, checks if a user with that role already exists
 * @param {String} role - The role to assign
 * @param {String} excludeUserId - User ID to exclude from count (for updates)
 * @returns {Promise<Object>} - { allowed: boolean, error?: string }
 */
async function validateRoleAssignment(role, excludeUserId = null) {
  try {
    if (!isSingleUserRole(role)) {
      // Multi-user role or unrestricted role
      return { allowed: true };
    }

    // Build query to check if role already exists
    const query = { role };
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    // Count users with this single-user role
    const count = await User.countDocuments(query);
    if (count > 0) {
      return {
        allowed: false,
        error: `${role} role is restricted to a single user. A user with this role already exists.`,
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error('Role validation error:', err);
    return {
      allowed: false,
      error: 'Failed to validate role assignment',
    };
  }
}

/**
 * Get count of users with a specific role
 * @param {String} role - The role name
 * @returns {Promise<Number>} - Count of users with this role
 */
async function getRoleCount(role) {
  try {
    return await User.countDocuments({ role });
  } catch (err) {
    console.error('Get role count error:', err);
    return 0;
  }
}

/**
 * Get role restrictions info
 * @returns {Object} - Information about role restrictions
 */
function getRoleInfo() {
  return {
    singleUserRoles: SINGLE_USER_ROLES,
    multiUserRoles: MULTI_USER_ROLES,
    description: {
      Admin: 'Only 1 user allowed',
      'HR Management': 'Only 1 user allowed',
      'Sales Manager': 'Only 1 user allowed',
      'Finance Management': 'Multiple users allowed',
      'Sales Rep': 'Multiple users allowed',
    },
  };
}

module.exports = {
  SINGLE_USER_ROLES,
  MULTI_USER_ROLES,
  isSingleUserRole,
  isMultiUserRole,
  validateRoleAssignment,
  getRoleCount,
  getRoleInfo,
};
