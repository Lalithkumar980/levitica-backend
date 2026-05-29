const express = require('express');
const router = express.Router();
const path = require('path');
const User = require('../models/User');
const { verifyToken, adminOnly } = require('../middleware/auth');
const { validateRoleAssignment } = require('../utils/roleValidator');
const { profilePhotoUpload } = require('../middleware/upload');
const { decrypt } = require('../utils/encrypt');
const {
  getDriveClient,
  ensureFolderPath,
  uploadBufferToFolder,
  deleteFile,
  sanitizeSegment
} = require('../services/googleDriveService');

/** Helper function to format user for frontend expectations */
function formatUserForFrontend(userDoc, requesterIsAdmin = false) {
  const u = userDoc.toJSON ? userDoc.toJSON() : userDoc;
  const idStr = u._id ? u._id.toString() : '';

  // Resolve profile photo URL
  let profilePhotoUrl = null;
  if (u.profileImageFileId) {
    profilePhotoUrl = `/api/users/${idStr}/photo`;
  } else if (u.profilePhoto) {
    profilePhotoUrl = `/api/uploads/profiles/${u.profilePhoto}`;
  }

  // Resolve company logo URL
  let companyLogoUrl = null;
  if (u.companyLogoFileId) {
    companyLogoUrl = `/api/users/${idStr}/company-logo`;
  } else if (u.companyLogo) {
    companyLogoUrl = u.companyLogo;
  }

  // Map role badge class
  let roleClass = "bg-gray-100 text-gray-700";
  if (u.role === 'Admin') roleClass = "bg-blue-100 text-blue-700";
  else if (u.role === 'HR Management') roleClass = "bg-violet-100 text-violet-700";
  else if (u.role === 'Sales Manager') roleClass = "bg-emerald-100 text-emerald-700";
  else if (u.role === 'Finance Management') roleClass = "bg-sky-100 text-sky-700";
  else if (u.role === 'Sales Rep') roleClass = "bg-amber-100 text-amber-700";

  // Calculate initials if virtual is not resolved
  let initials = u.initials;
  if (!initials && u.name) {
    const parts = u.name.split(' ').filter(Boolean);
    if (parts.length === 1) initials = parts[0].substring(0, 2).toUpperCase();
    else if (parts.length > 1) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
  }

  const formatted = {
    id: idStr,
    _id: idStr,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department || 'Sales',
    dept: u.department || 'Sales',
    modules: u.modules || [],
    viewAll: !!u.viewAll,
    delete: !!u.delete,
    export: !!u.export,
    admin: !!u.admin,
    bulkImport: !!u.bulkImport,
    viewReports: !!u.viewReports,
    initials: initials || '—',
    roleClass,
    profilePhoto: u.profilePhoto,
    profileImageFileId: u.profileImageFileId,
    profileImage: profilePhotoUrl,
    profilePhotoUrl,
    companyLogo: u.companyLogo,
    companyLogoFileId: u.companyLogoFileId,
    companyLogoUrl,
    phone: u.phone,
    city: u.city,
    address: u.address,
    company: u.company,
    dob: u.dob,
    experience: u.experience,
    companyAssets: u.companyAssets,
    skills: u.skills,
    hobbies: u.hobbies,
    bio: u.bio
  };

  // Only expose plain text password to admins
  if (requesterIsAdmin && u.passwordEncrypted) {
    formatted.passwordDisplay = decrypt(u.passwordEncrypted);
  }

  return formatted;
}

/** GET /api/users - List all users (Admin only) */
router.get('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const formatted = users.map((u) => formatUserForFrontend(u, true));
    res.json(formatted);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ message: 'Failed to list users' });
  }
});

/** GET /api/users/me - Get logged-in user profile */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(formatUserForFrontend(user, user.role === 'Admin'));
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ message: 'Failed to load profile' });
  }
});

/** POST /api/users - Create a new user (Admin only) */
router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { fullName, email, password, role, department } = req.body || {};
    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ message: 'Full name, email, password and role are required' });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: emailNorm });
    if (existing) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    // Enforce role assignment count limit restrictions
    const validation = await validateRoleAssignment(role);
    if (!validation.allowed) {
      return res.status(400).json({ message: validation.error });
    }

    // Set default permissions and modules based on role
    let viewAll = false;
    let del = false;
    let exp = false;
    let adminFlag = false;
    let bulkImport = false;
    let viewReports = true;
    let modules = [];

    if (role === 'Admin') {
      viewAll = true;
      del = true;
      exp = true;
      adminFlag = true;
      bulkImport = true;
      viewReports = true;
      modules = ['/dashboard', '/leads', '/contacts', '/companies', '/deals', '/activity', '/call-tracking', '/email-log', '/documents', '/bulk-upload', '/reports', '/settings'];
    } else if (role === 'HR Management') {
      viewAll = true;
      viewReports = true;
      modules = ['/dashboard', '/hr/intake', '/hr/pipeline', '/hr/candidates', '/hr/onboarding-submissions', '/hr/offer-letter-ready', '/hr/training-fees'];
    } else if (role === 'Sales Manager') {
      viewAll = true;
      exp = true;
      bulkImport = true;
      viewReports = true;
      modules = ['/dashboard', '/leads', '/contacts', '/companies', '/deals', '/activity', '/call-tracking', '/email-log', '/documents', '/bulk-upload', '/reports'];
    } else if (role === 'Finance Management') {
      viewAll = true;
      exp = true;
      viewReports = true;
      modules = ['/dashboard', '/finance/invoices', '/finance/expenses', '/finance/payments', '/finance/pl-report'];
    } else if (role === 'Sales Rep') {
      viewReports = true;
      modules = ['/dashboard', '/leads', '/contacts', '/companies', '/deals', '/activity', '/call-tracking', '/email-log', '/documents'];
    }

    const user = new User({
      name: fullName.trim(),
      email: emailNorm,
      password: password.trim(),
      role,
      department: department || 'Sales',
      viewAll,
      delete: del,
      export: exp,
      admin: adminFlag,
      bulkImport,
      viewReports,
      modules
    });

    await user.save();
    res.status(201).json(formatUserForFrontend(user, true));
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ message: err.message || 'Failed to create user' });
  }
});

/** PUT /api/users/me - Update logged-in user profile */
router.put('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const fields = [
      'name', 'phone', 'city', 'address', 'company', 'dob',
      'experience', 'companyAssets', 'skills', 'hobbies', 'bio'
    ];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        user[f] = req.body[f];
      }
    });

    await user.save();
    res.json(formatUserForFrontend(user, user.role === 'Admin'));
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

/** PUT /api/users/:id - Update user details (Admin only) */
router.put('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, email, role, department, password } = req.body || {};
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (email) {
      const emailNorm = String(email).trim().toLowerCase();
      if (emailNorm !== user.email) {
        const existing = await User.findOne({ email: emailNorm });
        if (existing) return res.status(400).json({ message: 'Email already in use' });
        user.email = emailNorm;
      }
    }

    if (role && role !== user.role) {
      const validation = await validateRoleAssignment(role, user._id);
      if (!validation.allowed) {
        return res.status(400).json({ message: validation.error });
      }
      user.role = role;

      // Update default permissions and modules on role change
      let viewAll = false;
      let del = false;
      let exp = false;
      let adminFlag = false;
      let bulkImport = false;
      let viewReports = true;
      let modules = [];

      if (role === 'Admin') {
        viewAll = true;
        del = true;
        exp = true;
        adminFlag = true;
        bulkImport = true;
        viewReports = true;
        modules = ['/dashboard', '/leads', '/contacts', '/companies', '/deals', '/activity', '/call-tracking', '/email-log', '/documents', '/bulk-upload', '/reports', '/settings'];
      } else if (role === 'HR Management') {
        viewAll = true;
        viewReports = true;
        modules = ['/dashboard', '/hr/intake', '/hr/pipeline', '/hr/candidates', '/hr/onboarding-submissions', '/hr/offer-letter-ready', '/hr/training-fees'];
      } else if (role === 'Sales Manager') {
        viewAll = true;
        exp = true;
        bulkImport = true;
        viewReports = true;
        modules = ['/dashboard', '/leads', '/contacts', '/companies', '/deals', '/activity', '/call-tracking', '/email-log', '/documents', '/bulk-upload', '/reports'];
      } else if (role === 'Finance Management') {
        viewAll = true;
        exp = true;
        viewReports = true;
        modules = ['/dashboard', '/finance/invoices', '/finance/expenses', '/finance/payments', '/finance/pl-report'];
      } else if (role === 'Sales Rep') {
        viewReports = true;
        modules = ['/dashboard', '/leads', '/contacts', '/companies', '/deals', '/activity', '/call-tracking', '/email-log', '/documents'];
      }

      user.viewAll = viewAll;
      user.delete = del;
      user.export = exp;
      user.admin = adminFlag;
      user.bulkImport = bulkImport;
      user.viewReports = viewReports;
      user.modules = modules;
    }

    if (name) user.name = name.trim();
    if (department) user.department = department;
    if (password && password.trim()) {
      user.password = password.trim();
    }

    await user.save();
    res.json(formatUserForFrontend(user, true));
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ message: err.message || 'Failed to update user' });
  }
});

/** DELETE /api/users/:id - Delete a user (Admin only) */
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Cleanup profile photo from Google Drive
    if (user.profileImageFileId) {
      try {
        const drive = await getDriveClient();
        await deleteFile(drive, user.profileImageFileId);
      } catch (driveErr) {
        console.warn('Failed to delete profile photo from Google Drive:', driveErr.message);
      }
    }

    // Cleanup company logo from Google Drive
    if (user.companyLogoFileId) {
      try {
        const drive = await getDriveClient();
        await deleteFile(drive, user.companyLogoFileId);
      } catch (driveErr) {
        console.warn('Failed to delete company logo from Google Drive:', driveErr.message);
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

/** POST /api/users/me/photo - Upload profile photo to Google Drive */
router.post('/me/photo', verifyToken, profilePhotoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No photo file provided' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const drive = await getDriveClient();

    // Remove old photo if present
    if (user.profileImageFileId) {
      try {
        await deleteFile(drive, user.profileImageFileId);
      } catch (driveErr) {
        console.warn('Failed to delete old profile photo:', driveErr.message);
      }
    }

    // Upload to Drive
    const folderId = await ensureFolderPath(drive, ['levitica Profile Photos']);
    const ext = path.extname(req.file.originalname) || '.png';
    const fileName = sanitizeSegment(`${user.name}-profile-${Date.now()}${ext}`);

    const uploadRes = await uploadBufferToFolder({
      drive,
      folderId,
      fileName,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype
    });

    user.profileImageFileId = uploadRes.fileId;
    user.profilePhoto = fileName;
    user.profileImage = uploadRes.fileUrl;

    await user.save();
    res.json(formatUserForFrontend(user, user.role === 'Admin'));
  } catch (err) {
    console.error('Upload profile photo error:', err);
    res.status(500).json({ message: 'Failed to upload profile photo' });
  }
});

/** DELETE /api/users/me/photo - Remove profile photo */
router.delete('/me/photo', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.profileImageFileId) {
      try {
        const drive = await getDriveClient();
        await deleteFile(drive, user.profileImageFileId);
      } catch (driveErr) {
        console.warn('Failed to delete profile photo from Drive:', driveErr.message);
      }
    }

    user.profileImageFileId = undefined;
    user.profilePhoto = undefined;
    user.profileImage = undefined;

    await user.save();
    res.json(formatUserForFrontend(user, user.role === 'Admin'));
  } catch (err) {
    console.error('Remove profile photo error:', err);
    res.status(500).json({ message: 'Failed to remove profile photo' });
  }
});

/** POST /api/users/me/company-logo - Upload company logo (Admin only) */
router.post('/me/company-logo', verifyToken, adminOnly, profilePhotoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No logo file provided' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const drive = await getDriveClient();

    // Remove old logo if present
    if (user.companyLogoFileId) {
      try {
        await deleteFile(drive, user.companyLogoFileId);
      } catch (driveErr) {
        console.warn('Failed to delete old company logo:', driveErr.message);
      }
    }

    // Upload to Drive
    const folderId = await ensureFolderPath(drive, ['levitica Branding']);
    const ext = path.extname(req.file.originalname) || '.png';
    const fileName = sanitizeSegment(`company-logo-${Date.now()}${ext}`);

    const uploadRes = await uploadBufferToFolder({
      drive,
      folderId,
      fileName,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype
    });

    user.companyLogoFileId = uploadRes.fileId;
    user.companyLogo = uploadRes.fileUrl;

    await user.save();
    res.json(formatUserForFrontend(user, true));
  } catch (err) {
    console.error('Upload company logo error:', err);
    res.status(500).json({ message: 'Failed to upload company logo' });
  }
});

/** DELETE /api/users/me/company-logo - Remove company logo (Admin only) */
router.delete('/me/company-logo', verifyToken, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.companyLogoFileId) {
      try {
        const drive = await getDriveClient();
        await deleteFile(drive, user.companyLogoFileId);
      } catch (driveErr) {
        console.warn('Failed to delete company logo from Drive:', driveErr.message);
      }
    }

    user.companyLogoFileId = undefined;
    user.companyLogo = undefined;

    await user.save();
    res.json(formatUserForFrontend(user, true));
  } catch (err) {
    console.error('Remove company logo error:', err);
    res.status(500).json({ message: 'Failed to remove company logo' });
  }
});

/** GET /api/users/:id/photo - Serve profile photo via Google Drive streaming proxy */
router.get('/:id/photo', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.profileImageFileId) {
      return res.status(404).send('Photo not found');
    }

    const drive = await getDriveClient();
    const meta = await drive.files.get({
      fileId: user.profileImageFileId,
      fields: 'mimeType'
    });

    const mimeType = meta.data.mimeType || 'image/png';
    res.setHeader('Content-Type', mimeType);

    const driveRes = await drive.files.get(
      { fileId: user.profileImageFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    driveRes.data.pipe(res);
  } catch (err) {
    console.error('Stream profile photo error:', err.message);
    res.status(404).send('Photo not found');
  }
});

/** GET /api/users/:id/company-logo - Serve company logo via Google Drive streaming proxy */
router.get('/:id/company-logo', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.companyLogoFileId) {
      return res.status(404).send('Company logo not found');
    }

    const drive = await getDriveClient();
    const meta = await drive.files.get({
      fileId: user.companyLogoFileId,
      fields: 'mimeType'
    });

    const mimeType = meta.data.mimeType || 'image/png';
    res.setHeader('Content-Type', mimeType);

    const driveRes = await drive.files.get(
      { fileId: user.companyLogoFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    driveRes.data.pipe(res);
  } catch (err) {
    console.error('Stream company logo error:', err.message);
    res.status(404).send('Company logo not found');
  }
});

module.exports = router;
