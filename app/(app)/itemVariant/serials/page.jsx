"use client";
import React, { Suspense } from "react";
import VariantSerials from "@/components/itemMaster/VariantSerials";

export default function VariantSerialsPage() {
  return (
    <Suspense fallback={null}>
      <VariantSerials />
    </Suspense>
  );
}
