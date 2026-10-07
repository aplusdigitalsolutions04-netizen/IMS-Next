"use client";
import React, { Suspense } from "react";
import UserGuide from "@/components/settings/UserGuide";

export default function UserGuidePage() {
  return (
    <Suspense fallback={null}>
      <UserGuide />
    </Suspense>
  );
}
