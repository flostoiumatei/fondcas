'use client';

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-cyan-50/30 to-violet-50/40" />

      {/* Animated gradient orbs */}
      <div className="absolute top-0 -left-40 w-80 h-80 bg-gradient-to-r from-primary/30 to-cyan-400/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
      <div className="absolute top-0 -right-40 w-80 h-80 bg-gradient-to-r from-violet-400/30 to-purple-400/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-40 left-20 w-80 h-80 bg-gradient-to-r from-cyan-400/30 to-teal-400/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />

      {/* Mesh grid pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" className="text-primary" />
      </svg>

      {/* Floating medical icons/shapes */}
      <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-primary/20 rounded-full animate-float" />
      <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-accent/20 rounded-full animate-float animation-delay-2000" />
      <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-cyan-500/20 rounded-full animate-float animation-delay-4000" />
      <div className="absolute top-2/3 right-1/3 w-4 h-4 bg-violet-500/10 rounded-full animate-float animation-delay-2000" />

      {/* Subtle radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-transparent via-transparent to-white/50" />
    </div>
  );
}
