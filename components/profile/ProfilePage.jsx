"use client";
import React, { useState, useEffect } from 'react';
import { printerService } from '@/lib/services/api';
import { setSession, getStoredToken } from '@/lib/client/auth';
import {
  User, KeyRound, Save, Loader2, AlertCircle, CheckCircle,
  Mail, Phone, ShieldCheck, Lock, Eye, EyeOff, Bell, BellOff, Camera, Trash2
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
const getPhotoUrl = (filename) => (filename ? `${UPLOADS_BASE_URL}/uploads/${encodeURIComponent(filename)}` : null);

// Custom CSS for animations
const styleSheet = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
    100% { transform: translateY(0px); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-fade-in-up { animation: fadeInUp 0.6s ease-out forwards; opacity: 0; }
  .animate-float { animation: float 6s ease-in-out infinite; }
  .animate-slide-in-right { animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .delay-100 { animation-delay: 100ms; }
  .delay-200 { animation-delay: 200ms; }
`;

// Enhanced Toast notification component with smooth slide-in animation
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const baseClasses = "fixed top-5 right-5 px-5 py-3.5 rounded-xl shadow-2xl text-sm font-semibold z-50 flex items-center gap-3 animate-slide-in-right border backdrop-blur-sm";
  const typeClasses = {
    success: "bg-emerald-50/90 text-emerald-800 border-emerald-200/50 shadow-emerald-500/10",
    error: "bg-red-50/90 text-red-800 border-red-200/50 shadow-red-500/10",
  };
  const Icon = type === 'success' ? CheckCircle : AlertCircle;

  return (
    <div className={`${baseClasses} ${typeClasses[type]}`}>
      <Icon size={20} className={type === 'success' ? 'text-emerald-600' : 'text-red-600'} />
      {message}
    </div>
  );
};

export default function ProfilePage({ currentUser }) {
  const [profile, setProfile] = useState({ fullName: '', email: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notification, setNotification] = useState(null);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [savingNotifPref, setSavingNotifPref] = useState(false);

  const [profilePhoto, setProfilePhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // UI State for Password Visibility
  const [showPassword, setShowPassword] = useState({ old: false, new: false, confirm: false });

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await printerService.getProfile();
        setProfile({
          fullName: data.fullName || '',
          email: data.email || '',
          phone: data.phone || '',
        });
        setNotificationsEnabled(data.notificationsEnabled !== false);
        setProfilePhoto(data.profilePhoto || null);
      } catch {
        setNotification({ type: 'error', message: 'Failed to load profile.' });
      } finally {
        setLoadingProfile(false);
      }
    }
    fetchProfile();
  }, []);

  const handleProfileChange = (e) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handlePasswordChange = (e) => {
    setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });
  };

  const togglePasswordVisibility = (field) => {
    setShowPassword(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setNotification(null);
    try {
      const result = await printerService.updateProfile(profile);
      syncStoredUser(result.user);
      setNotification({ type: 'success', message: 'Profile updated successfully.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.response?.data?.message || 'Failed to update profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const syncStoredUser = (updatedUser) => {
    if (!updatedUser) return;
    setSession({ user: updatedUser, token: getStoredToken() });
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      setNotification({ type: 'error', message: 'Only JPG, PNG, WEBP, or GIF images are allowed.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotification({ type: 'error', message: 'Image must be smaller than 5MB.' });
      return;
    }
    setUploadingPhoto(true);
    try {
      const result = await printerService.uploadProfilePhoto(file);
      setProfilePhoto(result.user?.profilePhoto || null);
      syncStoredUser(result.user);
      setNotification({ type: 'success', message: 'Profile photo updated.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.response?.data?.message || 'Failed to upload photo.' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true);
    try {
      const result = await printerService.removeProfilePhoto();
      setProfilePhoto(null);
      syncStoredUser(result.user);
      setNotification({ type: 'success', message: 'Profile photo removed.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.response?.data?.message || 'Failed to remove photo.' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleToggleNotifications = async () => {
    const next = !notificationsEnabled;
    setSavingNotifPref(true);
    try {
      const result = await printerService.updateProfile({ ...profile, notificationsEnabled: next });
      setNotificationsEnabled(next);
      syncStoredUser(result.user);
      setNotification({ type: 'success', message: next ? 'Notifications turned on.' : 'Notifications turned off.' });
    } catch (error) {
      setNotification({ type: 'error', message: error.response?.data?.message || 'Failed to update notification preference.' });
    } finally {
      setSavingNotifPref(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setNotification({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setNotification({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }
    setSavingPassword(true);
    setNotification(null);
    try {
      await printerService.changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      setNotification({ type: 'success', message: 'Password changed successfully.' });
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setShowPassword({ old: false, new: false, confirm: false }); // Reset visibility
    } catch (error) {
      setNotification({ type: 'error', message: error.response?.data?.message || 'Failed to change password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[500px] space-y-5">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
          <Loader2 className="animate-spin text-indigo-600 relative z-10" size={48} />
        </div>
        <p className="text-slate-500 font-medium tracking-wide animate-pulse">Loading your profile...</p>
      </div>
    );
  }

  // Common input styling class for reuse
  const inputContainerStyles = "relative group mt-1.5";
  const inputStyles = "w-full pl-11 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all duration-300 outline-none sm:text-sm";
  const labelStyles = "text-sm font-semibold text-slate-700 ml-1";
  const iconStyles = "absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors duration-300";

  return (
    <>
      <style>{styleSheet}</style>
      {/* Changed to w-full to take the full width of the parent container */}
      <div className="w-full space-y-8 py-6 px-4 sm:px-6 lg:px-8">
        {notification && (
          <Toast 
            message={notification.message} 
            type={notification.type} 
            onClose={() => setNotification(null)} 
          />
        )}
        
        {/* Profile Section */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden animate-fade-in-up">
          {/* Decorative floating blob */}
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-48 h-48 bg-indigo-50 rounded-full blur-3xl opacity-70 animate-float pointer-events-none"></div>
          
          <div className="relative z-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shadow-sm border border-indigo-100/50">
                  <User size={22} />
                </div>
                My Profile
              </h2>
              <p className="text-slate-500 text-sm ml-1">Update your personal information and contact details.</p>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-5 mb-8">
              <div className="relative w-20 h-20 shrink-0">
                {profilePhoto ? (
                  <img
                    src={getPhotoUrl(profilePhoto)}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover border-2 border-indigo-100 shadow-sm"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center border-2 border-indigo-100 shadow-sm">
                    <User size={32} className="text-indigo-500" />
                  </div>
                )}
                {uploadingPhoto && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
                <label
                  htmlFor="profile-photo-input"
                  className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md cursor-pointer transition-colors"
                  title="Change photo"
                >
                  <Camera size={13} />
                  <input
                    id="profile-photo-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handlePhotoChange}
                    disabled={uploadingPhoto}
                  />
                </label>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Profile Photo</p>
                <p className="text-xs text-slate-400 mb-2">JPG, PNG, WEBP or GIF — up to 5MB.</p>
                {profilePhoto && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={uploadingPhoto}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 size={12} /> Remove photo
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className={labelStyles}>Full Name</label>
                  <div className={inputContainerStyles}>
                    <User size={18} className={iconStyles} />
                    <input 
                      type="text" 
                      name="fullName" 
                      value={profile.fullName} 
                      onChange={handleProfileChange} 
                      className={inputStyles} 
                      placeholder="John Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelStyles}>Username</label>
                  <div className={inputContainerStyles}>
                    <ShieldCheck size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      value={currentUser.username} 
                      disabled 
                      className={`${inputStyles} bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200/50 focus:ring-0 focus:border-slate-200`} 
                    />
                  </div>
                </div>
                <div>
                  <label className={labelStyles}>Email Address</label>
                  <div className={inputContainerStyles}>
                    <Mail size={18} className={iconStyles} />
                    <input 
                      type="email" 
                      name="email" 
                      value={profile.email} 
                      onChange={handleProfileChange} 
                      className={inputStyles} 
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelStyles}>Phone Number</label>
                  <div className={inputContainerStyles}>
                    <Phone size={18} className={iconStyles} />
                    <input 
                      type="tel" 
                      name="phone" 
                      value={profile.phone} 
                      onChange={handleProfileChange} 
                      className={inputStyles} 
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end pt-5 mt-4 border-t border-slate-100">
                <button 
                  type="submit" 
                  disabled={savingProfile} 
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.97] hover:scale-[1.02] text-white rounded-xl font-semibold text-sm flex items-center gap-2 disabled:opacity-70 disabled:pointer-events-none transition-all duration-200 shadow-lg shadow-indigo-600/20"
                >
                  {savingProfile ? (
                    <><Loader2 size={18} className="animate-spin" /> Saving Changes...</>
                  ) : (
                    <><Save size={18} /> Save Profile</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Notification Preferences Section */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden animate-fade-in-up">
          <div className="relative z-10">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600 shadow-sm border border-amber-100/50">
                  <Bell size={22} />
                </div>
                Notification Preferences
              </h2>
              <p className="text-slate-500 text-sm ml-1">Control whether you receive in-app notifications (order updates, contract uploads, etc.).</p>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50/60 border border-slate-100">
              <div className="flex items-center gap-3">
                {notificationsEnabled ? <Bell size={18} className="text-indigo-500" /> : <BellOff size={18} className="text-slate-400" />}
                <div>
                  <p className="text-sm font-semibold text-slate-700">{notificationsEnabled ? 'Notifications are on' : 'Notifications are off'}</p>
                  <p className="text-xs text-slate-400">{notificationsEnabled ? "You'll receive new notifications as they happen." : "You won't receive any new notifications until turned back on."}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleNotifications}
                disabled={savingNotifPref}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-60 ${notificationsEnabled ? 'bg-indigo-600 border-indigo-600' : 'bg-slate-200 border-slate-200'}`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${notificationsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Password Section */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden animate-fade-in-up delay-100">
          {/* Decorative floating blob */}
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-48 h-48 bg-rose-50 rounded-full blur-3xl opacity-70 animate-float delay-200 pointer-events-none"></div>
          
          <div className="relative z-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-3">
                <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600 shadow-sm border border-rose-100/50">
                  <KeyRound size={22} />
                </div>
                Change Password
              </h2>
              <p className="text-slate-500 text-sm ml-1">Ensure your account is using a long, random password to stay secure.</p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              {/* Old password is now in a grid layout to match the width nicely on full screen */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className={labelStyles}>Old Password</label>
                  <div className={inputContainerStyles}>
                    <Lock size={18} className={iconStyles} />
                    <input 
                      type={showPassword.old ? "text" : "password"} 
                      name="oldPassword" 
                      value={passwordForm.oldPassword} 
                      onChange={handlePasswordChange} 
                      className={inputStyles} 
                      required 
                      placeholder="••••••••"
                    />
                    <button 
                      type="button" 
                      onClick={() => togglePasswordVisibility('old')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword.old ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <label className={labelStyles}>New Password</label>
                  <div className={inputContainerStyles}>
                    <Lock size={18} className={iconStyles} />
                    <input 
                      type={showPassword.new ? "text" : "password"} 
                      name="newPassword" 
                      value={passwordForm.newPassword} 
                      onChange={handlePasswordChange} 
                      className={inputStyles} 
                      required 
                      placeholder="••••••••"
                    />
                    <button 
                      type="button" 
                      onClick={() => togglePasswordVisibility('new')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword.new ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelStyles}>Confirm New Password</label>
                  <div className={inputContainerStyles}>
                    <Lock size={18} className={iconStyles} />
                    <input 
                      type={showPassword.confirm ? "text" : "password"} 
                      name="confirmPassword" 
                      value={passwordForm.confirmPassword} 
                      onChange={handlePasswordChange} 
                      className={inputStyles} 
                      required 
                      placeholder="••••••••"
                    />
                    <button 
                      type="button" 
                      onClick={() => togglePasswordVisibility('confirm')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end pt-5 mt-4 border-t border-slate-100">
                <button 
                  type="submit" 
                  disabled={savingPassword} 
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-[0.97] hover:scale-[1.02] text-white rounded-xl font-semibold text-sm flex items-center gap-2 disabled:opacity-70 disabled:pointer-events-none transition-all duration-200 shadow-lg shadow-slate-800/20"
                >
                  {savingPassword ? (
                    <><Loader2 size={18} className="animate-spin" /> Updating...</>
                  ) : (
                    <><Save size={18} /> Update Password</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
