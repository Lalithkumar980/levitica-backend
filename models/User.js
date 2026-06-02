const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt } = require('../utils/encrypt');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  passwordEncrypted: { type: String },
  role: {
    type: String,
    enum: ['Admin', 'HR Management', 'Sales Manager', 'Finance Management', 'Sales Rep', 'Read Only'],
    default: 'Sales Rep'
  },
  department: { type: String, default: 'Sales' },
  viewAll: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
  export: { type: Boolean, default: false },
  admin: { type: Boolean, default: false },
  bulkImport: { type: Boolean, default: false },
  viewReports: { type: Boolean, default: false },
  modules: [{ type: String }],
  profilePhoto: { type: String },
  profileImageFileId: { type: String },
  companyLogo: { type: String },
  companyLogoFileId: { type: String },
  profileImage: { type: String },
  phone: { type: String },
  city: { type: String },
  address: { type: String },
  company: { type: String },
  dob: { type: String },
  experience: { type: String },
  companyAssets: { type: String },
  skills: { type: String },
  hobbies: { type: String },
  bio: { type: String },
}, {
  timestamps: true
});

// Initials virtual
UserSchema.virtual('initials').get(function () {
  if (!this.name) return '';
  const parts = this.name.split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
});

// Pre-save hook
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    // Encrypt the plaintext password copy first for admin display
    this.passwordEncrypted = encrypt(this.password);

    // Hash the password with bcryptjs
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Password compare method
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', UserSchema);
