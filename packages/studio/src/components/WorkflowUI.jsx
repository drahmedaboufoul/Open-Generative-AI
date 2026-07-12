"use client";

import React from "react";

// The node-based Workflow builder lives in the `workflow-builder` package
// (Vibe-Workflow git submodule). That submodule's pinned commit is no longer
// available upstream, so it is not bundled in this deployment. The rest of the
// studios (image, video, cinema, lip-sync, audio, …) are unaffected.
const WorkflowUI = () => (
  <div className="w-full h-full bg-black text-white/50 flex flex-col items-center justify-center gap-2 p-8 text-center">
    <p className="text-lg font-semibold opacity-70">Workflow builder unavailable</p>
    <p className="text-sm opacity-40 max-w-md">
      This studio ships from the Vibe-Workflow submodule, which isn’t bundled in this
      deployment. Use the Image, Video, Cinema, Lip Sync and Audio studios.
    </p>
  </div>
);

export default WorkflowUI;
