"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { Loader2, ShieldCheck, Truck, Cpu } from "lucide-react";
import { authService } from "@/lib/services/authService";
import { setSession } from "@/lib/client/auth";

export default function LoginPage() {
  const [formData, setFormData] = useState({ EmailId: "", Password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const validation = () => {
    if (!formData.EmailId.trim()) {
      Swal.fire("Oops!", "Please enter Email ID", "error");
      return false;
    }
    if (!formData.Password.trim()) {
      Swal.fire("Oops!", "Please enter Password", "error");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validation()) return;
    setIsLoading(true);
    let navTimer = null;
    try {
      const credentials = { username: formData.EmailId, password: formData.Password };
      const result = await authService.login(credentials);

      if (!result || !result.user) {
        throw new Error("Server returned an invalid response (Backend might be offline or misconfigured).");
      }

      setSession({ user: result.user, token: result.token });
      if (Array.isArray(result.companies)) {
        window.sessionStorage.setItem("pt_companies", JSON.stringify(result.companies));
      }
      Swal.fire({ title: "Success!", text: "Logged in successfully", icon: "success", timer: 1500, showConfirmButton: false });
      navTimer = setTimeout(() => { router.push("/"); }, 1500);
    } catch (err) {
      clearTimeout(navTimer);
      Swal.fire("Opps!", err.message || err.response?.data?.message || "Invalid Email ID or Password", "error");
      setIsLoading(false);
      setFormData((prev) => ({ ...prev, Password: "" }));
    }
  };

  const handleForgotPassword = () => {
    Swal.fire({ title: "Forgot Password?", text: "Please contact the system administrator to reset your password.", icon: "info" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f4f7f6] via-[#e2e8f0] to-[#cbd5e1] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-teal-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-700"></div>

      <div className="max-w-6xl w-full flex flex-col lg:flex-row items-center gap-12 relative z-10">
        <div className="lg:w-1/2 text-left space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-[1px] w-8 bg-emerald-500"></span>
            <h5 className="text-emerald-550 text-xs font-black tracking-[0.3em] uppercase">
              Inventory Management Digital Portal
            </h5>
          </div>

          <h1 className="text-4xl lg:text-6xl font-black text-slate-800 leading-tight tracking-tight">
            One Platform for Inventory, Dispatch &amp; Analytics.
          </h1>

          <div className="text-slate-600 text-base lg:text-lg max-w-md leading-relaxed font-medium space-y-2">
            {[
              "Streamlines inventory tracking",
              "Simplifies order processing",
              "Manages returns efficiently",
              "Reduces operational delays",
              "Improves stock visibility",
              "Enhances overall workflow",
            ].map((line) => (
              <div key={line} className="flex items-center gap-2">
                <span className="text-green-500">✔</span>
                <span>{line}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 pt-4">
            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-4 py-2 rounded-full border border-white shadow-sm">
              <Cpu size={14} className="text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Smart Inventory</span>
            </div>
            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-4 py-2 rounded-full border border-white shadow-sm">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">RBAC Enabled</span>
            </div>
            <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm px-4 py-2 rounded-full border border-white shadow-sm">
              <Truck size={14} className="text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Order Tracking</span>
            </div>
          </div>
        </div>

        <div className="lg:w-1/2 w-full max-w-md">
          <div id="login_sec" className="bg-white/90 backdrop-blur-md p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/50">
            <div className="flex justify-between items-center mb-10 w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/aplus.png"
                className="w-48 h-auto"
                alt="Logo"
                onError={(e) => { e.target.style.display = "none"; }}
              />
              <h4 className="text-2xl font-black text-slate-800 tracking-tight">LOG IN</h4>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="relative">
                  <label htmlFor="EmailId" className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">
                    Username or Email
                  </label>
                  <input
                    id="EmailId"
                    name="EmailId"
                    type="text"
                    className="appearance-none block w-full px-4 py-3 border border-slate-200 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm bg-slate-50/50"
                    placeholder="admin or admin@example.com"
                    value={formData.EmailId}
                    onChange={(e) => setFormData({ ...formData, EmailId: e.target.value })}
                  />
                </div>

                <div className="relative">
                  <label htmlFor="Password" className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">
                    Password
                  </label>
                  <input
                    id="Password"
                    name="Password"
                    type="password"
                    className="appearance-none block w-full px-4 py-3 border border-slate-200 placeholder-slate-400 text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm bg-slate-50/50"
                    placeholder="••••••••"
                    value={formData.Password}
                    onChange={(e) => setFormData({ ...formData, Password: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col space-y-4 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-emerald-500 hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : "LOG IN"}
                </button>

                <div className="flex flex-col items-center space-y-2 text-xs">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-slate-400 hover:text-emerald-500 font-medium transition-colors"
                  >
                    Forgot Password?
                  </button>

                  <span className="text-slate-400">
                    Don&apos;t have an account yet?{" "}
                    <Link href="/signup" className="text-emerald-500 font-bold hover:underline">
                      Sign Up
                    </Link>
                  </span>
                </div>
              </div>
            </form>
          </div>

          <div className="mt-8 text-center">
            <p className="text-[10px] text-slate-400 font-bold tracking-[0.2em] uppercase">
              © {new Date().getFullYear()} A PLUS DIGITAL SOLUTIONS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
