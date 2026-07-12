"use client";

// The Design Agent canvas lives in the `design-agent` package (Open-AI-Design-Agent
// git submodule). That submodule's pinned commit is no longer available upstream, so it
// is not bundled in this deployment. The image/video studios are unaffected.
export default function DesignAgentStudio() {
  return (
    <div className="h-full w-full bg-black text-white/50 flex flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-lg font-semibold opacity-70">Design Agent unavailable</p>
      <p className="text-sm opacity-40 max-w-md">
        This studio ships from the Open-AI-Design-Agent submodule, which isn’t bundled in
        this deployment. Use the Image Studio (with image-to-image edit models) instead.
      </p>
    </div>
  );
}
