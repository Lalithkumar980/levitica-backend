const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt } = require('../utils/encrypt');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 6, select: false },
    passwordEncrypted: { type: String, select: false },
    role: { type: String, required: true, enum: ['Admin', 'HR Management', 'Sales Manager', 'Finance Management', 'Sales Rep'] },
    department: { type: String, default: 'Sales', trim: true },
    viewAll: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    export: { type: Boolean, default: false },
    admin: { type: Boolean, default: false },
    bulkImport: { type: Boolean, default: false },
    viewReports: { type: Boolean, default: true },
    modules: { type: [String], default: [] },
    profilePhoto: { type: String, default: null, trim: true },
    // Profile page (edit by user)
    phone: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    company: { type: String, default: '', trim: true },
    experience: { type: String, default: '', trim: true },
    skills: { type: String, default: '', trim: true },
    hobbies: { type: String, default: '', trim: true },
    bio: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const plaintext = this.password;
  this.passwordEncrypted = encrypt(plaintext);
  this.password = await bcrypt.hash(plaintext, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '').slice(0, 2).toUpperCase() || '—';
}

const ROLE_CLASS = {
  Admin: 'bg-blue-100 text-blue-700',
  'HR Management': 'bg-violet-100 text-violet-700',
  'Sales Manager': 'bg-emerald-100 text-emerald-700',
  'Finance Management': 'bg-sky-100 text-sky-700',
  'Sales Rep': 'bg-amber-100 text-amber-700',
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  obj.initials = getInitials(obj.name);
  obj.roleClass = ROLE_CLASS[obj.role] || ROLE_CLASS['Sales Rep'] || 'bg-gray-100 text-gray-700';
  obj.dept = obj.department;
  obj.id = obj._id.toString();
  return obj;
};

module.exports = mongoose.model('User', userSchema);
